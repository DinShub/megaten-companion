/**
 * Nocturne route finder — pure TypeScript, zero Angular.
 *
 * Given a target demon and up to eight wanted skills, it returns ranked fusion
 * trees whose leaves come from the user's pool: their compendium (a recall) and,
 * optionally, demons they could recruit in the field at or below the Demi-fiend's
 * level. Each tree is annotated with how every wanted skill reaches the target.
 *
 * Search: a depth-bounded AND-OR expansion over the engine's reverse index. Each
 * `(demon, depth)` cell keeps a small Pareto-ish front of sub-trees, one per
 * distinct set of wanted skills it can deliver to its root, ranked by the chosen
 * objective. Skill carry is computed bottom-up: a node carries a skill when one
 * of its children carries it (or the node learns it itself) *and* the node can
 * inherit it. The wall-clock and node-cap budgets return best-so-far, flagged.
 */
import { type FusionContext, type FusionEngine, nativeSkills, summonCost } from '../fusion';
import type { Demon, DemonId, Skill, SkillId } from '../model';
import { INHERIT_LABEL } from '../ui/smt3-format';

export type Objective = 'fewest-steps' | 'cheapest' | 'fewest-unowned';
export type PoolMode = 'compendium' | 'recruitable';

export interface RouteRequest {
  readonly targetId: DemonId;
  readonly skillIds: readonly SkillId[];
  readonly objective: Objective;
  readonly maxDepth: number;
  readonly pool: PoolMode;
}

export interface RouteLeaf {
  readonly kind: 'leaf';
  readonly demonId: DemonId;
  readonly owned: boolean;
  /** Recall cost for owned demons; 0 for a field recruit. */
  readonly cost: number;
}

export interface RouteStep {
  readonly kind: 'fusion';
  readonly resultId: DemonId;
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
  readonly demons: readonly Demon[];
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
  /** Bitmask over the wanted skills some demon in the tree knows — for per-route diagnostics. */
  readonly sourced: number;
  /** Demons used anywhere in the tree, to reject trees that reuse one demon. */
  readonly used: ReadonlySet<DemonId>;
}

export function findRoutes(
  engine: FusionEngine,
  data: RouteData,
  ctx: FusionContext,
  request: RouteRequest,
  now: () => number = () => Date.now(),
): RouteSearchResult {
  const started = now();
  const demonById = new Map(data.demons.map((d) => [d.id, d] as const));
  const skillById = new Map(data.skills.map((s) => [s.id, s] as const));
  const target = demonById.get(request.targetId);
  const wanted = [...new Set(request.skillIds)].slice(0, MAX_WANTED_SKILLS);

  if (!target) return { routes: [], problems: ['Unknown target demon.'], incomplete: false, elapsedMs: 0 };

  // ---- the pool -----------------------------------------------------------
  const leafFor = (d: Demon): Candidate | null => {
    const entry = ctx.compendium.get(d.id);
    if (entry) return leafCandidate(d.id, true, summonCost(d), maskOf(entry.skillIds));
    const recruitable = request.pool === 'recruitable' && d.enemy !== null && d.level <= ctx.protagonistLevel;
    return recruitable ? leafCandidate(d.id, false, 0, maskOf(nativeSkills(d))) : null;
  };

  const maskOf = (ids: readonly SkillId[]): number => {
    let m = 0;
    wanted.forEach((s, i) => {
      if (ids.includes(s)) m |= 1 << i;
    });
    return m;
  };

  const inheritMaskFor = new Map<DemonId, number>();
  const canCarry = (demonId: DemonId): number => {
    let m = inheritMaskFor.get(demonId);
    if (m === undefined) {
      m = 0;
      wanted.forEach((s, i) => {
        if (engine.canInherit(demonId, s)) m! |= 1 << i;
      });
      inheritMaskFor.set(demonId, m);
    }
    return m;
  };

  const nativeMask = (d: Demon): number => maskOf(nativeSkills(d));

  // ---- search ---------------------------------------------------------------
  let nodes = 0;
  let incomplete = false;
  const memo = new Map<string, readonly Candidate[]>();
  const better = comparator(request.objective);

  const expand = (demonId: DemonId, depth: number): readonly Candidate[] => {
    const key = `${demonId}@${depth}`;
    const cached = memo.get(key);
    if (cached) return cached;
    memo.set(key, []); // cycle guard while this cell is being built

    const demon = demonById.get(demonId)!;
    const out: Candidate[] = [];
    const leaf = leafFor(demon);
    if (leaf) out.push(leaf);

    const blocked = ctx.enforceLevelCap && demon.level > ctx.protagonistLevel;
    if (depth > 0 && !blocked && !(leaf && leaf.carried === fullMask(wanted.length) && demonId !== request.targetId)) {
      const carryHere = canCarry(demonId);
      const selfSkills = nativeMask(demon);
      for (const recipe of engine.recipesFor(demonId, ctx)) {
        if (budgetSpent()) break;
        const [a, b] = recipe.ingredientIds;
        if (a === demonId || b === demonId) continue;
        const left = expand(a, depth - 1).slice(0, CHILD_KEEP);
        if (left.length === 0) continue;
        const right = a === b ? left : expand(b, depth - 1).slice(0, CHILD_KEEP);
        for (const l of left) {
          for (const r of right) {
            nodes++;
            if (a === b && l === r) continue;
            if (overlaps(l.used, r.used)) continue;
            const used = new Set([...l.used, ...r.used, demonId]);
            out.push({
              tree: { kind: 'fusion', resultId: demonId, children: [l.tree, r.tree] },
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
  // The more fundamental problem wins: a demon fusion can't make doesn't also need a level warning.
  if (target.kind === 'fiend' || target.kind === 'evolution' || target.kind === 'recruit') {
    problems.push(`${target.name} can't be made from a fusion pair (${target.kind === 'fiend' ? 'Deathstone fusion' : target.kind === 'evolution' ? 'evolution only' : 'recruit only'}).`);
  } else if (ctx.enforceLevelCap && target.level > ctx.protagonistLevel) {
    problems.push(`${target.name} is level ${target.level} — above your Demi-fiend (Lv ${ctx.protagonistLevel}). Raise it in Settings or lift the cap.`);
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
            reason: diagnose(skillId, target, skillById, engine, ctx, request.pool, data.demons, (c.sourced & (1 << i)) !== 0),
          },
    );
    routes.push({ tree: c.tree, steps: c.steps, cost: c.cost, unowned: c.unowned, assignments, complete: assignments.every((a) => a.satisfied) });
    if (routes.length >= MAX_ROUTES) break;
  }

  if (problems.length === 0 && routes.length === 0) {
    problems.push(
      request.pool === 'compendium'
        ? `No route to ${target.name} within ${request.maxDepth} fusions from your compendium. Register more demons, allow field recruits, or search deeper.`
        : `No route to ${target.name} within ${request.maxDepth} fusions. Try searching deeper.`,
    );
  }

  return { routes, problems, incomplete, elapsedMs: now() - started };
}

function leafCandidate(demonId: DemonId, owned: boolean, cost: number, carried: number): Candidate {
  return { tree: { kind: 'leaf', demonId, owned, cost }, steps: 0, cost, unowned: owned ? 0 : 1, carried, sourced: carried, used: new Set([demonId]) };
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
  target: Demon,
  skillById: ReadonlyMap<SkillId, Skill>,
  engine: FusionEngine,
  ctx: FusionContext,
  pool: PoolMode,
  demons: readonly Demon[],
  /** Some demon in *this* route knows the skill — so the carry, not the source, failed. */
  sourcedInRoute: boolean,
): string {
  const skill = skillById.get(skillId);
  if (!skill) return 'Unknown skill.';
  if (skill.unique) return `${skill.name} is unique — it can never be inherited.`;
  if (!engine.canInherit(target.id, skillId)) {
    return `${target.name} can't inherit ${skill.inheritCategory ? INHERIT_LABEL[skill.inheritCategory] : ''} skills like ${skill.name}.`;
  }
  const inPool = demons.some((d) => {
    const entry = ctx.compendium.get(d.id);
    if (entry) return entry.skillIds.includes(skillId);
    return pool === 'recruitable' && d.enemy !== null && d.level <= ctx.protagonistLevel && nativeSkills(d).includes(skillId);
  });
  if (!inPool) return `Nothing in your pool knows ${skill.name}. Register a demon that has it${pool === 'compendium' ? ', or allow field recruits' : ''}.`;
  if (!sourcedInRoute) return `None of the demons in this route know ${skill.name}.`;
  return `${skill.name} is lost on the way — a demon in the middle of this route can't inherit it.`;
}

function overlaps(a: ReadonlySet<DemonId>, b: ReadonlySet<DemonId>): boolean {
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
  return node.kind === 'leaf' ? node.demonId : `(${node.resultId}:${node.children.map(treeKey).sort().join(',')})`;
}

/** Flatten a tree into numbered fusion steps, children first. */
export function routeSteps(tree: RouteNode): { resultId: DemonId; ingredients: readonly [RouteNode, RouteNode] }[] {
  const out: { resultId: DemonId; ingredients: readonly [RouteNode, RouteNode] }[] = [];
  const walk = (n: RouteNode): void => {
    if (n.kind === 'leaf') return;
    walk(n.children[0]);
    walk(n.children[1]);
    out.push({ resultId: n.resultId, ingredients: n.children });
  };
  walk(tree);
  return out;
}

/** The pool demons a route consumes. */
export function routeLeaves(tree: RouteNode): RouteLeaf[] {
  return tree.kind === 'leaf' ? [tree] : [...routeLeaves(tree.children[0]), ...routeLeaves(tree.children[1])];
}
