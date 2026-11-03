/**
 * SMT1 route finder — pure TypeScript, zero Angular.
 *
 * Given a target demon, it returns ranked fusion trees whose leaves come from
 * the user's pool: their compendium (owned demons, re-summoned) and, optionally,
 * any demon at or below the hero's level, counted as one still to get. SMT1
 * demons keep fixed skills, so there is no skill carry to plan — only how to
 * reach the demon.
 *
 * Search: a depth-bounded relaxation over every pair outcome (≈31.6k pairs,
 * computed once by the engine). Round `r` keeps, per demon, the few best trees
 * of at most `r` levels; a tree that would use one demon twice is skipped.
 * Pair fusions only: triple fusions multiply the search ~100× for little gain,
 * and the calculator shows them directly.
 */
import { type FusionContext, type FusionEngine, summonCost } from '../fusion';
import { displayLevel } from '../model';
import type { Demon, DemonId } from '../model';

export type Objective = 'fewest-steps' | 'cheapest' | 'fewest-unowned';
export type PoolMode = 'compendium' | 'anything';

export interface RouteRequest {
  readonly targetId: DemonId;
  readonly objective: Objective;
  readonly maxDepth: number;
  readonly pool: PoolMode;
}

export interface RouteLeaf {
  readonly kind: 'leaf';
  readonly demonId: DemonId;
  readonly owned: boolean;
  /** Re-summon cost for an owned demon; 0 for one still to get. */
  readonly cost: number;
}

export interface RouteStep {
  readonly kind: 'fusion';
  readonly resultId: DemonId;
  readonly children: readonly [RouteNode, RouteNode];
}

export type RouteNode = RouteLeaf | RouteStep;

export interface Route {
  readonly tree: RouteNode;
  readonly steps: number;
  readonly cost: number;
  readonly unowned: number;
}

export interface RouteSearchResult {
  readonly routes: readonly Route[];
  /** Why nothing came back, when nothing did. */
  readonly problems: readonly string[];
  readonly elapsedMs: number;
}

export interface RouteContext extends FusionContext {
  readonly owned: ReadonlySet<DemonId>;
}

interface Candidate extends Route {
  readonly used: ReadonlySet<DemonId>;
}

const KEEP = 4;
const MAX_ROUTES = 8;
export const MAX_DEPTH = 6;

export function findRoutes(
  engine: FusionEngine,
  demons: readonly Demon[],
  ctx: RouteContext,
  request: RouteRequest,
  now: () => number = () => Date.now(),
): RouteSearchResult {
  const started = now();
  const target = engine.demon(request.targetId);
  if (!target) return { routes: [], problems: ['Unknown target demon.'], elapsedMs: 0 };

  const score = scorer(request.objective);
  const best = new Map<DemonId, Candidate[]>();
  const offer = (id: DemonId, c: Candidate): void => {
    const list = best.get(id) ?? [];
    if (list.some((x) => sameShape(x.tree, c.tree))) return;
    list.push(c);
    list.sort((a, b) => score(a) - score(b));
    best.set(id, list.slice(0, KEEP));
  };

  // ---- leaves ---------------------------------------------------------------
  for (const d of demons) {
    if (ctx.owned.has(d.id)) offer(d.id, leaf(d, true));
    else if (request.pool === 'anything' && displayLevel(d) <= ctx.heroLevel) offer(d.id, leaf(d, false));
  }
  if (best.has(target.id) && ctx.owned.has(target.id)) {
    return { routes: [stripUsed(best.get(target.id)![0])], problems: [], elapsedMs: now() - started };
  }

  // ---- relaxation ------------------------------------------------------------
  const pairs = [...engine.pairs()].flatMap(([key, outcome]) => {
    if (!outcome.ok) return [];
    if (engine.isAboveLevel(outcome.resultId, ctx)) return [];
    const [a, b] = key.split('|');
    return [{ a, b, r: outcome.resultId }];
  });
  const depth = Math.min(MAX_DEPTH, Math.max(1, request.maxDepth));
  for (let round = 0; round < depth; round++) {
    const snapshot = new Map([...best].map(([k, v]) => [k, v.slice()]));
    for (const { a, b, r } of pairs) {
      const left = snapshot.get(a);
      const right = snapshot.get(b);
      if (!left || !right) continue;
      for (const x of left) {
        for (const y of right) {
          if (x.used.has(r) || y.used.has(r) || overlaps(x.used, y.used)) continue;
          offer(r, {
            tree: { kind: 'fusion', resultId: r, children: [x.tree, y.tree] },
            steps: x.steps + y.steps + 1,
            cost: x.cost + y.cost,
            unowned: x.unowned + y.unowned,
            used: new Set([...x.used, ...y.used, r]),
          });
        }
      }
    }
  }

  const routes = (best.get(target.id) ?? []).filter((c) => c.tree.kind === 'fusion').slice(0, MAX_ROUTES).map(stripUsed);
  const problems: string[] = [];
  if (!routes.length) {
    if (target.kind === 'recruit') problems.push(`${target.name} can't be fused: recruit it instead.`);
    else if (target.kind === 'enemy') problems.push(`${target.name} only appears as an enemy.`);
    else if (ctx.enforceLevelCap && displayLevel(target) > ctx.heroLevel) problems.push(`${target.name} is above your hero level (${ctx.heroLevel}).`);
    else if (request.pool === 'compendium' && ctx.owned.size === 0) problems.push('Your compendium is empty. Tick the demons you have, or search from anything at your level.');
    else problems.push(`No route within ${depth} fusion levels. Allow deeper routes, or search from anything at your level.`);
  }
  return { routes, problems, elapsedMs: now() - started };
}

function leaf(d: Demon, owned: boolean): Candidate {
  return { tree: { kind: 'leaf', demonId: d.id, owned, cost: owned ? summonCost(d) : 0 }, steps: 0, cost: owned ? summonCost(d) : 0, unowned: owned ? 0 : 1, used: new Set([d.id]) };
}

function scorer(objective: Objective): (c: Route) => number {
  switch (objective) {
    case 'cheapest':
      return (c) => c.cost * 1000 + c.steps;
    case 'fewest-unowned':
      return (c) => c.unowned * 1e9 + c.steps * 1e7 + c.cost;
    default:
      return (c) => c.steps * 1e9 + c.unowned * 1e7 + c.cost;
  }
}

function overlaps(a: ReadonlySet<DemonId>, b: ReadonlySet<DemonId>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

function sameShape(a: RouteNode, b: RouteNode): boolean {
  return shapeKey(a) === shapeKey(b);
}

function shapeKey(n: RouteNode): string {
  return n.kind === 'leaf' ? n.demonId : `${n.resultId}(${[shapeKey(n.children[0]), shapeKey(n.children[1])].sort().join(',')})`;
}

function stripUsed({ tree, steps, cost, unowned }: Candidate): Route {
  return { tree, steps, cost, unowned };
}

/** The fusion steps of a tree in the order they're made: leaves first, the target last. */
export function flattenSteps(tree: RouteNode): { readonly resultId: DemonId; readonly ingredientIds: readonly [DemonId, DemonId] }[] {
  if (tree.kind === 'leaf') return [];
  const id = (n: RouteNode): DemonId => (n.kind === 'leaf' ? n.demonId : n.resultId);
  return [...flattenSteps(tree.children[0]), ...flattenSteps(tree.children[1]), { resultId: tree.resultId, ingredientIds: [id(tree.children[0]), id(tree.children[1])] }];
}
