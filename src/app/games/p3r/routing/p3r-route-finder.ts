/**
 * P3R route finder — pure TypeScript, zero Angular.
 *
 * Given a target persona and up to eight wanted skills, it returns ranked fusion
 * trees whose leaves come from the user's pool: their compendium (a recall) and,
 * optionally, any fusable persona at or below the protagonist's level — the
 * ones a player can pick up from Shuffle Time or fuse on the way. Each tree is annotated with how every wanted skill reaches the target.
 *
 * Search: a depth-bounded AND-OR expansion over the engine's reverse index. Each
 * `(persona, depth)` cell keeps a small Pareto-ish front of sub-trees, one per
 * distinct set of wanted skills it can deliver to its root, ranked by the chosen
 * objective. Skill carry is computed bottom-up: a node carries a skill when one
 * of its children carries it (or the node learns it itself) *and* the node can
 * inherit it. The wall-clock and node-cap budgets return best-so-far, flagged.
 */
import { type FusionContext, type FusionEngine, nativeSkills, summonCost } from '../fusion';
import type { Persona, PersonaId, Skill, SkillId } from '../model';
import { inheritTypeLabel, SKILL_ELEMENT_LABEL } from '../ui/p3r-format';

export type Objective = 'fewest-steps' | 'cheapest' | 'fewest-unowned';
export type PoolMode = 'compendium' | 'available';

export interface RouteRequest {
  readonly targetId: PersonaId;
  readonly skillIds: readonly SkillId[];
  readonly objective: Objective;
  readonly maxDepth: number;
  readonly pool: PoolMode;
}

export interface RouteLeaf {
  readonly kind: 'leaf';
  readonly personaId: PersonaId;
  readonly owned: boolean;
  /** Recall cost for owned personas; 0 for one picked up at your level. */
  readonly cost: number;
}

export interface RouteStep {
  readonly kind: 'fusion';
  readonly resultId: PersonaId;
  readonly children: readonly [RouteNode, RouteNode];
}

export type RouteNode = RouteLeaf | RouteStep;

export interface SkillAssignment {
  readonly skillId: SkillId;
  readonly satisfied: boolean;
  /** Why not, when unsatisfied. */
  readonly reason?: string;
}

export interface Route {
  readonly tree: RouteNode;
  readonly steps: number;
  readonly cost: number;
  readonly unowned: number;
  readonly assignments: readonly SkillAssignment[];
  readonly complete: boolean;
}

export interface RouteSearchResult {
  readonly routes: readonly Route[];
  /** Search-wide reasons nothing came back. */
  readonly problems: readonly string[];
  readonly incomplete: boolean;
  readonly elapsedMs: number;
}

export interface RouteData {
  readonly personas: readonly Persona[];
  readonly skills: readonly Skill[];
}

const FRONT_CAP = 8;
const CHILD_KEEP = 3;
const MAX_ROUTES = 10;
const TIME_BUDGET_MS = 2500;
const NODE_CAP = 400_000;
export const MAX_WANTED_SKILLS = 8;

interface Candidate {
  readonly tree: RouteNode;
  readonly steps: number;
  readonly cost: number;
  readonly unowned: number;
  /** Bitmask over the wanted skills that can reach this node's root. */
  readonly carried: number;
  /** Bitmask over the wanted skills some persona in the tree knows — for per-route diagnostics. */
  readonly sourced: number;
  /** Personas used anywhere in the tree, to reject trees that reuse one persona. */
  readonly used: ReadonlySet<PersonaId>;
}

export function findRoutes(
  engine: FusionEngine,
  data: RouteData,
  ctx: FusionContext,
  request: RouteRequest,
  now: () => number = () => Date.now(),
): RouteSearchResult {
  const started = now();
  const personaById = new Map(data.personas.map((d) => [d.id, d] as const));
  const skillById = new Map(data.skills.map((s) => [s.id, s] as const));
  const target = personaById.get(request.targetId);
  const wanted = [...new Set(request.skillIds)].slice(0, MAX_WANTED_SKILLS);

  if (!target) return { routes: [], problems: ['Unknown target persona.'], incomplete: false, elapsedMs: 0 };

  // ---- the pool -----------------------------------------------------------
  const leafFor = (d: Persona): Candidate | null => {
    const entry = ctx.compendium.get(d.id);
    if (entry) return leafCandidate(d.id, true, summonCost(d), maskOf(entry.skillIds));
    const available = request.pool === 'available' && d.kind === 'normal' && d.level <= ctx.protagonistLevel;
    return available ? leafCandidate(d.id, false, 0, maskOf(nativeSkills(d))) : null;
  };

  const maskOf = (ids: readonly SkillId[]): number => {
    let m = 0;
    wanted.forEach((s, i) => {
      if (ids.includes(s)) m |= 1 << i;
    });
    return m;
  };

  const inheritMaskFor = new Map<PersonaId, number>();
  const canCarry = (personaId: PersonaId): number => {
    let m = inheritMaskFor.get(personaId);
    if (m === undefined) {
      m = 0;
      wanted.forEach((s, i) => {
        if (engine.canInherit(personaId, s)) m! |= 1 << i;
      });
      inheritMaskFor.set(personaId, m);
    }
    return m;
  };

  const nativeMask = (d: Persona): number => maskOf(nativeSkills(d));

  // ---- search ---------------------------------------------------------------
  let nodes = 0;
  let incomplete = false;
  const memo = new Map<string, readonly Candidate[]>();
  const better = comparator(request.objective);

  const expand = (personaId: PersonaId, depth: number): readonly Candidate[] => {
    const key = `${personaId}@${depth}`;
    const cached = memo.get(key);
    if (cached) return cached;
    memo.set(key, []); // cycle guard while this cell is being built

    const persona = personaById.get(personaId)!;
    const out: Candidate[] = [];
    const leaf = leafFor(persona);
    if (leaf) out.push(leaf);

    const blocked = ctx.enforceLevelCap && persona.level > ctx.protagonistLevel;
    if (depth > 0 && !blocked && !(leaf && leaf.carried === fullMask(wanted.length) && personaId !== request.targetId)) {
      const carryHere = canCarry(personaId);
      const selfSkills = nativeMask(persona);
      for (const recipe of engine.recipesFor(personaId, ctx)) {
        if (budgetSpent()) break;
        if (recipe.ingredientIds.length !== 2) continue;
        const [a, b] = recipe.ingredientIds;
        if (a === personaId || b === personaId) continue;
        const left = expand(a, depth - 1).slice(0, CHILD_KEEP);
        if (left.length === 0) continue;
        const right = a === b ? left : expand(b, depth - 1).slice(0, CHILD_KEEP);
        for (const l of left) {
          for (const r of right) {
            nodes++;
            if (a === b && l === r) continue;
            if (overlaps(l.used, r.used)) continue;
            const used = new Set([...l.used, ...r.used, personaId]);
            out.push({
              tree: { kind: 'fusion', resultId: personaId, children: [l.tree, r.tree] },
              steps: l.steps + r.steps + 1,
              cost: l.cost + r.cost,
              unowned: l.unowned + r.unowned,
              carried: ((l.carried | r.carried) & carryHere) | selfSkills,
              sourced: l.sourced | r.sourced | selfSkills,
              used,
            });
          }
        }
      }
    }

    const front = keepFront(out, better);
    memo.set(key, front);
    return front;
  };

  const budgetSpent = (): boolean => {
    if (incomplete) return true;
    if (nodes > NODE_CAP || now() - started > TIME_BUDGET_MS) incomplete = true;
    return incomplete;
  };

  const problems: string[] = [];
  // The more fundamental problem wins: a persona pairs can't make doesn't also need a level warning.
  const special = engine.specialFor(target.id);
  if (special && special.ingredientIds.length > 2) {
    problems.push(`${target.name} is a special fusion of ${special.ingredientIds.length} personas, not a pair — fuse its recipe on the Special fusions tab.`);
  } else if (ctx.enforceLevelCap && target.level > ctx.protagonistLevel) {
    problems.push(`${target.name} is level ${target.level} — above your protagonist (Lv ${ctx.protagonistLevel}). Raise it in Settings or lift the cap.`);
  }

  // Iterative deepening, so shallow routes are found even if the budget runs out. Memo
  // cells are keyed by depth, so each pass reuses the shallower passes' work.
  const all: Candidate[] = [];
  if (problems.length === 0) {
    for (let depth = 1; depth <= request.maxDepth && !incomplete; depth++) {
      for (const c of expand(request.targetId, depth)) {
        if (c.tree.kind === 'fusion' || ctx.compendium.has(request.targetId)) all.push(c);
      }
    }
  }

  const seen = new Set<string>();
  const routes: Route[] = [];
  const full = fullMask(wanted.length);
  const ranked = all.sort((x, y) => popcount(y.carried & full) - popcount(x.carried & full) || better(x, y));
  for (const c of ranked) {
    const key = treeKey(c.tree);
    if (seen.has(key)) continue;
    seen.add(key);
    const assignments = wanted.map((skillId, i) =>
      c.carried & (1 << i)
        ? { skillId, satisfied: true }
        : {
            skillId,
            satisfied: false,
            reason: diagnose(skillId, target, skillById, engine, ctx, request.pool, data.personas, (c.sourced & (1 << i)) !== 0),
          },
    );
    routes.push({ tree: c.tree, steps: c.steps, cost: c.cost, unowned: c.unowned, assignments, complete: assignments.every((a) => a.satisfied) });
    if (routes.length >= MAX_ROUTES) break;
  }

  if (problems.length === 0 && routes.length === 0) {
    problems.push(
      request.pool === 'compendium'
        ? `No route to ${target.name} within ${request.maxDepth} fusions from your compendium. Register more personas, allow personas at your level, or search deeper.`
        : `No route to ${target.name} within ${request.maxDepth} fusions. Try searching deeper.`,
    );
  }

  return { routes, problems, incomplete, elapsedMs: now() - started };
}

function leafCandidate(personaId: PersonaId, owned: boolean, cost: number, carried: number): Candidate {
  return { tree: { kind: 'leaf', personaId, owned, cost }, steps: 0, cost, unowned: owned ? 0 : 1, carried, sourced: carried, used: new Set([personaId]) };
}

function comparator(objective: Objective): (a: Candidate, b: Candidate) => number {
  switch (objective) {
    case 'fewest-steps':
      return (a, b) => a.steps - b.steps || a.unowned - b.unowned || a.cost - b.cost;
    case 'cheapest':
      return (a, b) => a.cost - b.cost || a.steps - b.steps || a.unowned - b.unowned;
    case 'fewest-unowned':
      return (a, b) => a.unowned - b.unowned || a.steps - b.steps || a.cost - b.cost;
  }
}

/** Keep the best candidate per carried-skill set, then the overall best, up to the cap. */
function keepFront(cands: readonly Candidate[], better: (a: Candidate, b: Candidate) => number): Candidate[] {
  const sorted = [...cands].sort((a, b) => popcount(b.carried) - popcount(a.carried) || better(a, b));
  const out: Candidate[] = [];
  const masks = new Set<number>();
  for (const c of sorted) {
    if (masks.has(c.carried)) continue;
    masks.add(c.carried);
    out.push(c);
    if (out.length >= FRONT_CAP) return out;
  }
  for (const c of [...cands].sort(better)) {
    if (out.length >= FRONT_CAP) break;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

function diagnose(
  skillId: SkillId,
  target: Persona,
  skillById: ReadonlyMap<SkillId, Skill>,
  engine: FusionEngine,
  ctx: FusionContext,
  pool: PoolMode,
  personas: readonly Persona[],
  /** Some persona in *this* route knows the skill — so the carry, not the source, failed. */
  sourcedInRoute: boolean,
): string {
  const skill = skillById.get(skillId);
  if (!skill) return 'Unknown skill.';
  if (skill.unique) return `${skill.name} is unique — it can never be inherited.`;
  if (!engine.canInherit(target.id, skillId)) {
    return `${target.name} has ${inheritTypeLabel(target.inheritType)} inheritance, which can't take ${SKILL_ELEMENT_LABEL[skill.element]} skills like ${skill.name}.`;
  }
  const inPool = personas.some((d) => {
    const entry = ctx.compendium.get(d.id);
    if (entry) return entry.skillIds.includes(skillId);
    return pool === 'available' && d.kind === 'normal' && d.level <= ctx.protagonistLevel && nativeSkills(d).includes(skillId);
  });
  if (!inPool) return `Nothing in your pool knows ${skill.name}. Register a persona that has it${pool === 'compendium' ? ', or allow personas at your level' : ''}.`;
  if (!sourcedInRoute) return `None of the personas in this route know ${skill.name}.`;
  return `${skill.name} is lost on the way — a persona in the middle of this route can't inherit it.`;
}

function overlaps(a: ReadonlySet<PersonaId>, b: ReadonlySet<PersonaId>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

function fullMask(n: number): number {
  return n === 0 ? 0 : (1 << n) - 1;
}

function popcount(n: number): number {
  let c = 0;
  while (n) {
    n &= n - 1;
    c++;
  }
  return c;
}

function treeKey(node: RouteNode): string {
  return node.kind === 'leaf' ? node.personaId : `(${node.resultId}:${node.children.map(treeKey).sort().join(',')})`;
}

/** Flatten a tree into numbered fusion steps, children first. */
export function routeSteps(tree: RouteNode): { resultId: PersonaId; ingredients: readonly [RouteNode, RouteNode] }[] {
  const out: { resultId: PersonaId; ingredients: readonly [RouteNode, RouteNode] }[] = [];
  const walk = (n: RouteNode): void => {
    if (n.kind === 'leaf') return;
    walk(n.children[0]);
    walk(n.children[1]);
    out.push({ resultId: n.resultId, ingredients: n.children });
  };
  walk(tree);
  return out;
}

/** The pool personas a route consumes. */
export function routeLeaves(tree: RouteNode): RouteLeaf[] {
  return tree.kind === 'leaf' ? [tree] : [...routeLeaves(tree.children[0]), ...routeLeaves(tree.children[1])];
}
