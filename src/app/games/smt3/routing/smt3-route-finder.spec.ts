import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { FusionEngine, type FusionContext, type FusionData } from '../fusion';
import type { CompendiumEntry, Demon, ElementChart, FusionChart, Skill, SpecialRecipes } from '../model';
import { findRoutes, type RouteRequest, routeLeaves, routeSteps } from './smt3-route-finder';

/** Route-finder behaviour against the real committed Nocturne data. */
const repoRoot = fileURLToPath(import.meta.url).replace(/[\\/]src[\\/].*$/, '');
const load = <T>(name: string): T => JSON.parse(readFileSync(`${repoRoot}/public/data/smt3/${name}.json`, 'utf8')) as T;

const DATA: FusionData = {
  demons: load<Demon[]>('demons'),
  skills: load<Skill[]>('skills'),
  fusionChart: load<FusionChart>('fusion-chart'),
  elementChart: load<ElementChart>('element-chart'),
  specialRecipes: load<SpecialRecipes>('special-recipes'),
};
const engine = new FusionEngine(DATA);

function ctx(entries: CompendiumEntry[], level = 30): FusionContext {
  return {
    protagonistLevel: level,
    enforceLevelCap: true,
    unlockGroups: { story: true, fiend: true, amala: true },
    compendium: new Map(entries.map((e) => [e.demonId, e] as const)),
  };
}

const req = (over: Partial<RouteRequest>): RouteRequest => ({
  targetId: 'isora',
  skillIds: [],
  objective: 'fewest-steps',
  maxDepth: 3,
  pool: 'compendium',
  ...over,
});

const OWNED: CompendiumEntry[] = [
  { demonId: 'pixie', level: 20, skillIds: ['dia', 'zio', 'agidyne'] },
  { demonId: 'jack-frost', level: 7, skillIds: ['bufu'] },
  { demonId: 'sudama', level: 13, skillIds: ['zan'] },
];

describe('Nocturne route finder', () => {
  it('finds a one-fusion route from owned demons, and every step really fuses', () => {
    const c = ctx(OWNED);
    const res = findRoutes(engine, DATA, c, req({}));
    expect(res.routes.length).toBeGreaterThan(0);
    for (const route of res.routes) {
      for (const step of routeSteps(route.tree)) {
        const ids = step.ingredients.map((n) => (n.kind === 'leaf' ? n.demonId : n.resultId));
        const o = engine.fuse(ids, c);
        expect(o.ok && o.resultId).toBe(step.resultId);
      }
      expect(routeLeaves(route.tree).every((l) => l.owned)).toBe(true);
    }
    expect(res.routes[0].steps).toBe(1);
  });

  it('ranks the route that carries a wanted skill first, and explains the others', () => {
    const res = findRoutes(engine, DATA, ctx(OWNED), req({ skillIds: ['agidyne'] }));
    const best = res.routes[0];
    expect(best.complete).toBe(true);
    expect(routeLeaves(best.tree).map((l) => l.demonId)).toContain('pixie');
    const partial = res.routes.find((r) => !r.complete);
    expect(partial?.assignments[0].reason).toContain('None of the demons in this route know Agidyne');
  });

  it('says when nothing in the pool knows a wanted skill', () => {
    const res = findRoutes(engine, DATA, ctx(OWNED), req({ skillIds: ['mabufudyne'] }));
    expect(res.routes[0].assignments[0].reason).toContain('Nothing in your pool knows');
  });

  it('refuses a target above the Demi-fiend level, and one fusion cannot make', () => {
    expect(findRoutes(engine, DATA, ctx(OWNED, 10), req({})).problems[0]).toContain('above your Demi-fiend');
    expect(findRoutes(engine, DATA, ctx(OWNED), req({ targetId: 'matador' })).problems[0]).toContain('Deathstone');
    expect(findRoutes(engine, DATA, ctx(OWNED), req({ targetId: 'dante' })).problems[0]).toContain('recruit only');
  });

  it('reports an empty pool rather than inventing material', () => {
    const res = findRoutes(engine, DATA, ctx([]), req({}));
    expect(res.routes).toEqual([]);
    expect(res.problems[0]).toContain('from your compendium');
  });

  it('uses field recruits at or below the Demi-fiend level when allowed', () => {
    const res = findRoutes(engine, DATA, ctx([], 30), req({ pool: 'recruitable', targetId: 'kikuri-hime', maxDepth: 2 }));
    expect(res.routes.length).toBeGreaterThan(0);
    for (const leaf of res.routes.flatMap((r) => routeLeaves(r.tree))) {
      const d = DATA.demons.find((x) => x.id === leaf.demonId)!;
      expect(leaf.owned).toBe(false);
      expect(d.enemy).not.toBeNull();
      expect(d.level).toBeLessThanOrEqual(30);
    }
  });

  it('never uses the same demon twice in one tree', () => {
    const res = findRoutes(engine, DATA, ctx([], 40), req({ pool: 'recruitable', targetId: 'kushinada', maxDepth: 3 }));
    for (const route of res.routes) {
      const leaves = routeLeaves(route.tree).map((l) => l.demonId);
      expect(new Set(leaves).size).toBe(leaves.length);
    }
  });
});
