/**
 * The route finder (§7, Phase 7, tasks 45–50).
 *
 * Pure and deterministic, like the fusion engine it drives: given a target and a
 * set of desired skills, it enumerates depth-bounded fusion trees, routes each
 * requested skill to a source and verifies its carry chain, ranks the results by
 * the chosen objective, and returns typed diagnostics for anything it could not
 * deliver. No Angular, no I/O — task 51 runs exactly this inside a Web Worker.
 *
 * Shape of the search (§7.2):
 *  1. **Seed** — the resolved pool (§6.4) plus recruited treasure demons are the
 *     leaves; every leaf is directly obtainable (owned = a re-summon, unowned = an
 *     acquisition in `obtainable` mode).
 *  2. **Expand** — an AND-OR walk down from the target: "obtain X" is satisfied by
 *     any recipe (OR), a recipe needs *all* its ingredients (AND). All four §6.1/§6.2
 *     paths expand. Memoised per (persona, depth); a bounded Pareto front of the
 *     best sub-trees is kept at every node so the search stays tractable.
 *  3. **Prune** — depth bound, the level cap (§6.3), and a wall-clock / node-cap
 *     budget that returns best-so-far rather than truncating silently.
 *  4. **Route skills** — for each candidate tree, assign every requested skill to a
 *     native/leaf/card source and verify its inherit-mask carry chain (§6.5, §6.6).
 *  5. **Rank** — complete routes first, then by the objective (§7.3); all three
 *     metrics are computed for every route regardless of the objective chosen.
 */
import type { FusionData, FusionEngine } from '../fusion';
import type { FusionContext, FusionPath } from '../fusion';
import type { CardSource, Persona, Skill } from '../model';
import type { PersonaId, SkillId } from '../model/ids';
import {
  DEFAULT_LIMITS,
  type Diagnostic,
  type Objective,
  type Route,
  type RouteNode,
  type RouteRequest,
  type RouteSearchLimits,
  type RouteSearchResult,
  type SkillAssignment,
} from './types';

// Search-shape knobs. Small enough to keep a depth-3 search inside the budget,
// large enough that the top of the ranking has genuine variety.
const FRONT_CAP = 24; // candidate sub-trees kept per (persona, depth) memo cell
const CHILD_KEEP = 6; // best options taken from each ingredient when combining
const COMBO_CAP = 8; // fusion combinations generated per recipe
const SKILL_SLOTS = 8; // §6.5 total capacity — the SLOT_OVERFLOW threshold

/** A node in the shared, un-annotated search tree. Leaves carry their pool facts. */
type SearchNode =
  | { readonly kind: 'leaf'; readonly id: PersonaId; readonly owned: boolean; readonly level: number; readonly cost: number }
  | { readonly kind: 'fusion'; readonly id: PersonaId; readonly path: FusionPath; readonly children: readonly SearchNode[] };

/** One kept sub-tree with the metrics the Pareto front and the ranker read. */
interface Candidate {
  readonly node: SearchNode;
  readonly steps: number;
  readonly cost: number;
  readonly unowned: number;
  /** Requested skills some leaf under this node knows — biases the front toward carriers. */
  readonly coverage: number;
  readonly key: string;
}

/** Mutable output node, annotated with the skill-carry plan, then returned as a {@link RouteNode}. */
type BuildLeaf = { kind: 'leaf'; personaId: PersonaId; level: number; owned: boolean; summonCost: number; supplies: SkillId[] };
type BuildFusion = { kind: 'fusion'; resultId: PersonaId; path: FusionPath; level: number; children: BuildNode[]; carries: SkillId[] };
type BuildNode = BuildLeaf | BuildFusion;

/**
 * Enumerate, rank and diagnose routes to `request.targetId`. The single entry
 * point; the Web Worker and the property suite both call exactly this.
 */
export function findRoutes(
  engine: FusionEngine,
  data: FusionData,
  request: RouteRequest,
  ctx: FusionContext,
  limits: RouteSearchLimits = DEFAULT_LIMITS,
): RouteSearchResult {
  const started = Date.now();
  const deadline = started + limits.timeBudgetMs;

  const personaById = new Map<PersonaId, Persona>(data.personas.map((p) => [p.id, p]));
  const skillById = new Map<SkillId, Skill>(data.skills.map((s) => [s.id, s]));
  const pool = engine.resolvePool(ctx);

  // Requested skills, de-duplicated and restricted to ones we know about.
  const requested = uniq(request.skillIds).filter((id) => skillById.has(id));

  const budget = { nodes: 0, incomplete: false };
  const overBudget = (): boolean => {
    if (budget.incomplete) return true;
    if (budget.nodes >= limits.nodeCap || Date.now() > deadline) budget.incomplete = true;
    return budget.incomplete;
  };

  // --- leaf availability (pool + recruited treasure demons) ------------------
  // The §6.4 pool is normal-only; treasure demons are recruited, not fused, so
  // the pool excludes them — but a treasure recipe still needs one as a leaf
  // (§7.2 "treasure … recipes all expand"). Owned demons count in either mode;
  // in `obtainable` mode an unowned demon is an acquisition like any other.
  const leafCache = new Map<PersonaId, { owned: boolean; level: number; cost: number } | null>();
  function leafInfo(id: PersonaId): { owned: boolean; level: number; cost: number } | null {
    const hit = leafCache.get(id);
    if (hit !== undefined) return hit;
    let info: { owned: boolean; level: number; cost: number } | null = null;
    const member = pool.byId.get(id);
    if (member) {
      info = { owned: member.owned, level: member.level, cost: safeCost(engine, id) };
    } else {
      const persona = personaById.get(id);
      if (persona?.kind === 'treasure') {
        const entry = ctx.compendium.get(id);
        if (entry) info = { owned: true, level: entry.level, cost: safeCost(engine, id) };
        else if (ctx.pool === 'obtainable') info = { owned: false, level: persona.level, cost: safeCost(engine, id) };
      }
    }
    leafCache.set(id, info);
    return info;
  }

  // --- skills a leaf brings (compendium record, or native learn-set) ---------
  const knownCache = new Map<PersonaId, ReadonlySet<SkillId>>();
  function knownByLeaf(id: PersonaId): ReadonlySet<SkillId> {
    const hit = knownCache.get(id);
    if (hit) return hit;
    const entry = ctx.compendium.get(id);
    const persona = personaById.get(id);
    const set = new Set<SkillId>(
      entry ? entry.skillIds : persona ? nativeSkillIds(persona, persona.level) : [],
    );
    knownCache.set(id, set);
    return set;
  }

  const canInheritResult = (resultId: PersonaId, skillId: SkillId): boolean => {
    const persona = personaById.get(resultId);
    return persona ? engine.canInherit(persona.inheritType, skillId) : false;
  };

  // --- level cap (§6.3): a persona above the protagonist can't be produced ---
  const cappedIds = new Set<PersonaId>();
  const isCapped = (id: PersonaId): boolean => {
    const persona = personaById.get(id);
    const capped = !!persona && ctx.enforceLevelCap && persona.level > ctx.protagonistLevel;
    if (capped) cappedIds.add(id);
    return capped;
  };

  // --- the AND-OR expansion (§7.2 step 2), memoised per (id, depth) ----------
  const memo = new Map<string, readonly Candidate[]>();
  function expand(id: PersonaId, depth: number): readonly Candidate[] {
    const memoKey = `${id}|${depth}`;
    const cached = memo.get(memoKey);
    if (cached) return cached;

    const out: Candidate[] = [];
    const seen = new Set<string>();
    const push = (c: Candidate): void => {
      if (seen.has(c.key)) return;
      seen.add(c.key);
      out.push(c);
    };

    // Leaf option: obtain it straight from the pool. Always terminal.
    const leaf = leafInfo(id);
    if (leaf) push(leafCandidate(id, leaf, knownByLeaf(id), requested));

    // Fusion options: any recipe producing `id`, if depth and the cap allow.
    if (depth >= 1 && !isCapped(id) && !overBudget()) {
      for (const recipe of engine.recipesFor(id, ctx)) {
        if (overBudget()) break;
        budget.nodes++;
        const childLists = recipe.ingredientIds.map((ing) => expand(ing, depth - 1));
        if (childLists.some((list) => list.length === 0)) continue; // an ingredient is unreachable
        for (const combo of combine(childLists)) {
          push(fusionCandidate(id, recipe.path, combo, requested));
        }
      }
    }

    const front = paretoFront(out).slice(0, FRONT_CAP);
    memo.set(memoKey, front);
    return front;
  }

  // --- target edge cases (§4.7.1 special-only, treasure, party) --------------
  const target = personaById.get(request.targetId);
  const searchDiagnostics: Diagnostic[] = [];
  if (!target) {
    return emptyResult([{ code: 'NO_SOURCE_IN_POOL', message: `Unknown persona: ${request.targetId}.` }], started, budget.nodes);
  }
  if (target.kind === 'party') {
    return emptyResult(
      [{ code: 'NO_SOURCE_IN_POOL', message: `${target.name} is a party persona — it can't be produced by fusion.` }],
      started,
      budget.nodes,
    );
  }

  const maxDepth = Math.max(0, Math.floor(request.maxDepth));
  const rootCandidates = expand(request.targetId, maxDepth);

  // Materialise each candidate tree into a ranked, skill-routed route. The
  // per-search context (notably the nearest-source index) is built once.
  const mctx: MaterializeCtx = {
    request,
    requested,
    target,
    targetLevel: ctx.compendium.get(target.id)?.level ?? target.level,
    personaById,
    skillById,
    knownByLeaf,
    canInheritResult,
    summonCost: (id) => safeCost(engine, id),
    nearestSource: buildNearestSource(data.personas, ctx),
    obtainableLeaf: leafInfo,
  };
  // Materialise every distinct candidate, then de-duplicate on the *simplified*
  // tree — two search trees often collapse to the same recipe.
  const routes: Route[] = [];
  const seenTrees = new Set<string>();
  for (const cand of rootCandidates) {
    const route = materialize(cand.node, mctx);
    const key = treeKey(route.tree);
    if (seenTrees.has(key)) continue;
    seenTrees.add(key);
    routes.push(route);
  }

  rankRoutes(routes, request.objective);

  const returned = routes.slice(0, limits.maxRoutes);
  const truncated = routes.length > returned.length;

  // No route at all → explain why at the search level (§7.4).
  if (returned.length === 0) {
    if (target.kind === 'treasure') {
      searchDiagnostics.push({
        code: 'NO_SOURCE_IN_POOL',
        message: `${target.name} is a treasure demon — recruit it${target.prereq ? ` (${target.prereq})` : ''} rather than fusing it.`,
      });
    } else if (cappedIds.has(target.id)) {
      searchDiagnostics.push({
        code: 'LEVEL_CAPPED',
        message: `${target.name} needs protagonist level ${target.level}; you're ${ctx.protagonistLevel}.`,
      });
    } else {
      searchDiagnostics.push({
        code: 'DEPTH_EXCEEDED',
        message: `No route to ${target.name} within ${maxDepth} ${maxDepth === 1 ? 'fusion' : 'fusions'}. Try raising the max depth.`,
      });
    }
  }

  return {
    routes: returned,
    diagnostics: searchDiagnostics,
    incomplete: budget.incomplete,
    truncated,
    nodesExpanded: budget.nodes,
    elapsedMs: Date.now() - started,
  };
}

// ---- candidate construction -------------------------------------------------

function leafCandidate(
  id: PersonaId,
  leaf: { owned: boolean; level: number; cost: number },
  known: ReadonlySet<SkillId>,
  requested: readonly SkillId[],
): Candidate {
  const node: SearchNode = { kind: 'leaf', id, owned: leaf.owned, level: leaf.level, cost: leaf.cost };
  return {
    node,
    steps: 0,
    cost: leaf.cost,
    unowned: leaf.owned ? 0 : 1,
    coverage: requested.reduce((n, s) => n + (known.has(s) ? 1 : 0), 0),
    key: `L:${id}`,
  };
}

function fusionCandidate(
  id: PersonaId,
  path: FusionPath,
  combo: readonly Candidate[],
  _requested: readonly SkillId[],
): Candidate {
  const node: SearchNode = { kind: 'fusion', id, path, children: combo.map((c) => c.node) };
  const childKeys = combo.map((c) => c.key).sort(); // fusion is order-independent
  return {
    node,
    steps: 1 + combo.reduce((n, c) => n + c.steps, 0),
    cost: combo.reduce((n, c) => n + c.cost, 0),
    unowned: combo.reduce((n, c) => n + c.unowned, 0),
    coverage: combo.reduce((n, c) => n + c.coverage, 0),
    key: `F:${id}(${childKeys.join(',')})`,
  };
}

/**
 * Bounded cartesian product over the ingredient candidate lists. Each list is
 * already best-first (Pareto-sorted), so taking the low-index combinations first
 * yields the strongest fusions; capped at {@link COMBO_CAP} to bound the fan-out.
 */
function combine(childLists: readonly (readonly Candidate[])[]): Candidate[][] {
  const lists = childLists.map((l) => l.slice(0, CHILD_KEEP));
  let combos: Candidate[][] = [[]];
  for (const list of lists) {
    const next: Candidate[][] = [];
    for (const prefix of combos) {
      for (const item of list) {
        next.push([...prefix, item]);
        if (next.length >= COMBO_CAP * lists.length) break;
      }
    }
    combos = next.slice(0, COMBO_CAP);
  }
  return combos;
}

/**
 * Keep the Pareto-optimal candidates over (steps, cost, unowned) minimised and
 * coverage maximised — a candidate survives unless another beats or ties it on
 * every axis. Sorted best-first by a coverage-then-cheap scalar so callers can
 * slice the strongest few.
 */
function paretoFront(cands: readonly Candidate[]): Candidate[] {
  const dominates = (a: Candidate, b: Candidate): boolean =>
    a.steps <= b.steps &&
    a.cost <= b.cost &&
    a.unowned <= b.unowned &&
    a.coverage >= b.coverage &&
    (a.steps < b.steps || a.cost < b.cost || a.unowned < b.unowned || a.coverage > b.coverage);

  const front = cands.filter((c) => !cands.some((o) => o !== c && dominates(o, c)));
  return front.sort(
    (a, b) => b.coverage - a.coverage || a.steps - b.steps || a.cost - b.cost || a.unowned - b.unowned || a.key.localeCompare(b.key),
  );
}

// ---- route materialisation & skill routing (§7.2 step 4, tasks 46–47) -------

interface MaterializeCtx {
  readonly request: RouteRequest;
  readonly requested: readonly SkillId[];
  readonly target: Persona;
  readonly targetLevel: number;
  readonly personaById: ReadonlyMap<PersonaId, Persona>;
  readonly skillById: ReadonlyMap<SkillId, Skill>;
  readonly knownByLeaf: (id: PersonaId) => ReadonlySet<SkillId>;
  readonly canInheritResult: (resultId: PersonaId, skillId: SkillId) => boolean;
  readonly summonCost: (id: PersonaId) => number;
  readonly nearestSource: (skillId: SkillId) => { name: string; level: number; owned: boolean } | null;
  /** Pool facts for a persona obtainable directly as a leaf, else null. */
  readonly obtainableLeaf: (id: PersonaId) => { owned: boolean; level: number; cost: number } | null;
}

function materialize(root: SearchNode, ctx: MaterializeCtx): Route {
  const built = buildTree(root, ctx);
  const assignments: SkillAssignment[] = [];
  const targetNative = new Set(nativeSkillIds(ctx.target, ctx.targetLevel));

  for (const skillId of ctx.requested) {
    assignments.push(routeSkill(skillId, built, targetNative, ctx));
  }

  applySlotOverflow(assignments, targetNative.size, ctx);

  // Collapse redundant sub-fusions: a subtree that ended up carrying no requested
  // skill and whose result you can simply obtain is pure waste (re-summon the
  // persona instead of re-fusing it). Strictly fewer steps, yen and unowned — but
  // never the root, which is the whole point of the route.
  const tree = simplifyTree(built, ctx, true);

  let steps = 0;
  let cost = 0;
  let unowned = 0;
  walk(tree, (n) => {
    if (n.kind === 'fusion') steps++;
    else {
      cost += Number.isNaN(n.summonCost) ? 0 : n.summonCost;
      if (!n.owned) unowned++;
    }
  });

  const satisfiedCount = assignments.filter((a) => a.satisfied).length;
  return {
    tree: tree as RouteNode,
    steps,
    cost,
    unowned,
    assignments,
    satisfiedCount,
    complete: satisfiedCount === ctx.requested.length,
    diagnostics: assignments.filter((a) => a.diagnostic).map((a) => a.diagnostic!),
  };
}

/** Deep-clone a shared search node into fresh, annotatable output nodes. */
function buildTree(node: SearchNode, ctx: MaterializeCtx): BuildNode {
  if (node.kind === 'leaf') {
    return { kind: 'leaf', personaId: node.id, level: node.level, owned: node.owned, summonCost: node.cost, supplies: [] };
  }
  return {
    kind: 'fusion',
    resultId: node.id,
    path: node.path,
    level: ctx.personaById.get(node.id)?.level ?? 0,
    children: node.children.map((c) => buildTree(c, ctx)),
    carries: [],
  };
}

/**
 * Collapse a fusion sub-tree to a leaf when it delivers no requested skill (its
 * `carries` is empty — and since a carried skill propagates to every ancestor,
 * an empty `carries` means the *whole* sub-tree carries nothing) and its result
 * is directly obtainable. The root is never collapsed. Safe for the property
 * invariants: no skill assignment sources from inside a zero-carry sub-tree, and
 * the collapsed leaf's id equals the former result, so the parent still replays.
 */
function simplifyTree(node: BuildNode, ctx: MaterializeCtx, isRoot: boolean): BuildNode {
  if (node.kind === 'leaf') return node;
  const children = node.children.map((c) => simplifyTree(c, ctx, false));
  if (!isRoot && node.carries.length === 0) {
    const leaf = ctx.obtainableLeaf(node.resultId);
    if (leaf) {
      return { kind: 'leaf', personaId: node.resultId, level: leaf.level, owned: leaf.owned, summonCost: leaf.cost, supplies: [] };
    }
  }
  return { ...node, children };
}

/** Resolve one requested skill against the tree (§7.2 step 4). */
function routeSkill(skillId: SkillId, tree: BuildNode, targetNative: ReadonlySet<SkillId>, ctx: MaterializeCtx): SkillAssignment {
  const skill = ctx.skillById.get(skillId)!;

  // 1. The target learns it on its own — nothing to inherit.
  if (targetNative.has(skillId)) {
    return { skillId, satisfied: true, via: 'native', sourcePersonaId: ctx.target.id };
  }

  // 2. Chain: a leaf that knows it, on a path whose every fusion result admits it.
  const sources: BuildLeaf[] = [];
  collectSources(skillId, tree, ctx, sources);
  if (sources.length > 0) {
    const source = pickSource(sources);
    markCarry(skillId, tree, source);
    return { skillId, satisfied: true, via: 'inherited', sourcePersonaId: source.personaId };
  }

  // 3. Card: teaches any persona directly, bypassing the inherit mask (§6.6).
  const card = skill.cardSources[0] as CardSource | undefined;
  if (card) {
    return { skillId, satisfied: true, via: 'card', cardKind: card.kind, cardFrom: card.from };
  }

  // 4. Unsatisfiable — a typed reason (§7.4). Card was already ruled out above.
  return { skillId, satisfied: false, via: null, diagnostic: diagnose(skillId, skill, tree, ctx) };
}

/** Leaves that know the skill on a mask-valid path to the root (descend only through admitting fusions). */
function collectSources(skillId: SkillId, node: BuildNode, ctx: MaterializeCtx, out: BuildLeaf[]): void {
  if (node.kind === 'leaf') {
    if (ctx.knownByLeaf(node.personaId).has(skillId)) out.push(node);
    return;
  }
  if (!ctx.canInheritResult(node.resultId, skillId)) return;
  for (const child of node.children) collectSources(skillId, child, ctx, out);
}

/** Prefer an owned source (a cheap re-summon), then the lowest level, then id. */
function pickSource(sources: readonly BuildLeaf[]): BuildLeaf {
  return [...sources].sort(
    (a, b) => Number(b.owned) - Number(a.owned) || a.level - b.level || a.personaId.localeCompare(b.personaId),
  )[0];
}

/** Mark the single path from the chosen source leaf up to the root as carrying the skill. */
function markCarry(skillId: SkillId, node: BuildNode, target: BuildLeaf): boolean {
  if (node === target) {
    node.supplies.push(skillId);
    return true;
  }
  if (node.kind !== 'fusion') return false;
  for (const child of node.children) {
    if (markCarry(skillId, child, target)) {
      node.carries.push(skillId);
      return true;
    }
  }
  return false;
}

/** The typed §7.4 reason a skill could not be delivered (card already excluded). */
function diagnose(skillId: SkillId, skill: Skill, tree: BuildNode, ctx: MaterializeCtx): Diagnostic {
  const name = skill.name;

  // A leaf knows it, but every path is blocked by an inherit mask → the card is
  // the usual fix, and there wasn't one (checked before us).
  const blocker = findBlocker(skillId, tree, ctx);
  if (blocker) {
    const type = ctx.personaById.get(blocker)?.inheritType ?? 'none';
    const el = skill.inheritElement ?? skill.element;
    return {
      code: 'INHERIT_TYPE_BLOCKED',
      skillId,
      message: `${ctx.personaById.get(blocker)?.name ?? blocker} (${labelType(type)} inherit) can't receive ${cap(el)} skills, and no ${name} card is available.`,
    };
  }

  if (skill.unique) {
    return { code: 'NOT_INHERITABLE', skillId, message: `${name} is unique — no fusion can inherit it.` };
  }

  const nearest = ctx.nearestSource(skillId);
  const tail = nearest
    ? ` Nearest source: ${nearest.name} (lv ${nearest.level})${nearest.owned ? '' : ', unregistered'}.`
    : '';
  return { code: 'NO_SOURCE_IN_POOL', skillId, message: `No persona in your pool knows ${name}.${tail}` };
}

/** True if any leaf under `node` knows the skill, ignoring inherit masks. */
function anyLeafKnows(skillId: SkillId, node: BuildNode, ctx: MaterializeCtx): boolean {
  if (node.kind === 'leaf') return ctx.knownByLeaf(node.personaId).has(skillId);
  return node.children.some((c) => anyLeafKnows(skillId, c, ctx));
}

/** The fusion nearest the root, on a path to a knowing leaf, whose result rejects the skill. */
function findBlocker(skillId: SkillId, node: BuildNode, ctx: MaterializeCtx): PersonaId | null {
  if (node.kind !== 'fusion') return null;
  const feeds = node.children.some((c) => anyLeafKnows(skillId, c, ctx));
  if (!feeds) return null;
  if (!ctx.canInheritResult(node.resultId, skillId)) return node.resultId;
  for (const child of node.children) {
    const deeper = findBlocker(skillId, child, ctx);
    if (deeper) return deeper;
  }
  return null;
}

/**
 * SLOT_OVERFLOW (§7.4): only fires in the unambiguous case — the target already
 * fills its 8 slots with native skills at its level, so inherited/card skills
 * would have to replace one. Below capacity we don't nitpick, matching the
 * forward calculator's "deliverable set may be slightly smaller" footnote (§6.5).
 */
function applySlotOverflow(assignments: SkillAssignment[], nativeCount: number, ctx: MaterializeCtx): void {
  if (nativeCount < SKILL_SLOTS) return;
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    if (a.satisfied && (a.via === 'inherited' || a.via === 'card')) {
      assignments[i] = {
        skillId: a.skillId,
        satisfied: false,
        via: null,
        diagnostic: {
          code: 'SLOT_OVERFLOW',
          skillId: a.skillId,
          message: `${ctx.target.name} already knows ${nativeCount} skills at level ${ctx.targetLevel}; an inherited skill would replace one.`,
        },
      };
    }
  }
}

// ---- ranking (§7.3, task 48) ------------------------------------------------

/** Sort in place: complete routes first, then most-satisfied, then the objective, then a stable key. */
function rankRoutes(routes: Route[], objective: Objective): void {
  const byObjective = objectiveComparator(objective);
  routes.sort(
    (a, b) =>
      Number(b.complete) - Number(a.complete) ||
      b.satisfiedCount - a.satisfiedCount ||
      byObjective(a, b) ||
      treeKey(a.tree).localeCompare(treeKey(b.tree)),
  );
}

function objectiveComparator(objective: Objective): (a: Route, b: Route) => number {
  switch (objective) {
    case 'fewest-steps':
      return (a, b) => a.steps - b.steps || a.cost - b.cost || a.unowned - b.unowned;
    case 'cheapest':
      return (a, b) => a.cost - b.cost || a.steps - b.steps || a.unowned - b.unowned;
    case 'fewest-unowned':
      return (a, b) => a.unowned - b.unowned || a.steps - b.steps || a.cost - b.cost;
  }
}

// ---- small helpers ----------------------------------------------------------

function nativeSkillIds(persona: Persona, level: number): SkillId[] {
  const out: SkillId[] = [];
  for (const learned of persona.learnedSkills) {
    if (learned.kind === 'innate') out.push(learned.skillId);
    else if (learned.kind === 'level' && learned.level <= level) out.push(learned.skillId);
  }
  return out;
}

/** For NO_SOURCE_IN_POOL "nearest source": lowest-level persona that learns a skill natively. */
function buildNearestSource(
  personas: readonly Persona[],
  ctx: FusionContext,
): (skillId: SkillId) => { name: string; level: number; owned: boolean } | null {
  const index = new Map<SkillId, { name: string; level: number; owned: boolean }>();
  for (const persona of personas) {
    for (const learned of persona.learnedSkills) {
      if (learned.kind === 'tag') continue;
      const current = index.get(learned.skillId);
      if (!current || persona.level < current.level) {
        index.set(learned.skillId, { name: persona.name, level: persona.level, owned: ctx.compendium.has(persona.id) });
      }
    }
  }
  return (skillId) => index.get(skillId) ?? null;
}

function walk(node: BuildNode, visit: (n: BuildNode) => void): void {
  visit(node);
  if (node.kind === 'fusion') for (const child of node.children) walk(child, visit);
}

function treeKey(node: RouteNode): string {
  if (node.kind === 'leaf') return `L:${node.personaId}`;
  return `F:${node.resultId}(${node.children.map(treeKey).sort().join(',')})`;
}

function safeCost(engine: FusionEngine, id: PersonaId): number {
  const c = engine.summonCost(id);
  return Number.isNaN(c) ? 0 : c;
}

function uniq<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function labelType(type: string): string {
  return type === 'none' ? 'None' : cap(type);
}

function emptyResult(diagnostics: readonly Diagnostic[], started: number, nodes: number): RouteSearchResult {
  return { routes: [], diagnostics, incomplete: false, truncated: false, nodesExpanded: nodes, elapsedMs: Date.now() - started };
}
