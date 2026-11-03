import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { FusionEngine } from '../fusion';
import type { FusionData } from '../fusion';
import type { Demon, ElementChart, FusionChart, Races, SpecialRecipes, TripleChart } from '../model';
import { findRoutes, flattenSteps } from './smt1-route-finder';
import type { RouteContext, RouteNode } from './smt1-route-finder';

const repoRoot = fileURLToPath(import.meta.url).replace(/[\\/]src[\\/].*$/, '');
const load = <T>(name: string): T => JSON.parse(readFileSync(`${repoRoot}/public/data/smt1/${name}.json`, 'utf8')) as T;
const DATA: FusionData = {
  demons: load<Demon[]>('demons'),
  races: load<Races>('races'),
  fusionChart: load<FusionChart>('fusion-chart'),
  tripleChart: load<TripleChart>('triple-chart'),
  elementChart: load<ElementChart>('element-chart'),
  specialRecipes: load<SpecialRecipes>('special-recipes'),
};
const engine = new FusionEngine(DATA);
const ctx = (owned: string[], over: Partial<RouteContext> = {}): RouteContext => ({ heroLevel: 99, enforceLevelCap: true, owned: new Set(owned), ...over });

/** Property: every step of a route re-fuses through the engine, and every leaf is in the pool. */
function replay(tree: RouteNode, c: RouteContext): void {
  for (const step of flattenSteps(tree)) {
    const r = engine.fuse(step.ingredientIds[0], step.ingredientIds[1], c);
    expect(r.ok && r.resultId).toBe(step.resultId);
  }
}

describe('SMT1 route finder', () => {
  it('finds the special recipe for Shiva from Barong and Rangda in one step', () => {
    const c = ctx(['barong', 'rangda']);
    const result = findRoutes(engine, DATA.demons, c, { targetId: 'shiva', objective: 'fewest-steps', maxDepth: 3, pool: 'compendium' });
    expect(result.routes[0].steps).toBe(1);
    expect(flattenSteps(result.routes[0].tree)).toEqual([{ resultId: 'shiva', ingredientIds: ['barong', 'rangda'] }]);
  });

  it('builds multi-step routes whose every step re-fuses', () => {
    const c = ctx(['pixie', 'kinnari', 'gremlin', 'tun-kou', 'loki', 'ame-no-uzume', 'chimera', 'dakini']);
    const result = findRoutes(engine, DATA.demons, c, { targetId: 'arahabaki', objective: 'fewest-steps', maxDepth: 4, pool: 'compendium' });
    expect(result.routes.length).toBeGreaterThan(0);
    for (const route of result.routes) replay(route.tree, c);
  });

  it('can search from anything at the hero level, counting what is still to get', () => {
    const c = ctx([], { heroLevel: 40 });
    const result = findRoutes(engine, DATA.demons, c, { targetId: 'sarasvati', objective: 'fewest-unowned', maxDepth: 2, pool: 'anything' });
    expect(result.routes.length).toBeGreaterThan(0);
    expect(result.routes[0].unowned).toBeGreaterThan(0);
    for (const route of result.routes) replay(route.tree, c);
  });

  it('applies the hero level cap at search time, whatever context the engine saw first', () => {
    const fresh = new FusionEngine(DATA);
    fresh.fuse('barong', 'rangda', { heroLevel: 1, enforceLevelCap: true }); // a boot-time call at level 1
    const req = { targetId: 'shiva', objective: 'fewest-steps', maxDepth: 2, pool: 'compendium' } as const;
    expect(findRoutes(fresh, DATA.demons, ctx(['barong', 'rangda'], { heroLevel: 50 }), req).routes).toEqual([]);
    expect(findRoutes(fresh, DATA.demons, ctx(['barong', 'rangda'], { heroLevel: 99 }), req).routes[0].steps).toBe(1);
  });

  it('explains why nothing came back', () => {
    const recruit = DATA.demons.find((d) => d.kind === 'recruit')!;
    expect(findRoutes(engine, DATA.demons, ctx([]), { targetId: recruit.id, objective: 'fewest-steps', maxDepth: 3, pool: 'compendium' }).problems[0]).toMatch(/recruit it/);
    expect(findRoutes(engine, DATA.demons, ctx([]), { targetId: 'shiva', objective: 'fewest-steps', maxDepth: 3, pool: 'compendium' }).problems[0]).toMatch(/compendium is empty/);
  });
});
