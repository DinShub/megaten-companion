import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { FusionEngine, type FusionContext, type FusionData } from '../fusion';
import type { CompendiumEntry, FusionChart, InheritMatrix, Persona, Skill, SpecialRecipe } from '../model';
import { findRoutes, type RouteRequest, routeLeaves, routeSteps } from './p3r-route-finder';

/** Route-finder behaviour against the real committed P3R data. */
const repoRoot = fileURLToPath(import.meta.url).replace(/[\\/]src[\\/].*$/, '');
const load = <T>(name: string): T => JSON.parse(readFileSync(`${repoRoot}/public/data/p3r/${name}.json`, 'utf8')) as T;

const DATA: FusionData = {
  personas: load<Persona[]>('personas'),
  skills: load<Skill[]>('skills'),
  fusionChart: load<FusionChart>('fusion-chart'),
  specialRecipes: load<SpecialRecipe[]>('special-recipes'),
  inheritMatrix: load<InheritMatrix>('inherit-matrix'),
};
const engine = new FusionEngine(DATA);

function ctx(entries: CompendiumEntry[], level = 30): FusionContext {
  return {
    protagonistLevel: level,
    enforceLevelCap: true,
    unlockGroups: { story: true, 'social-link': true, 'teammate-link': true, dlc: false },
    compendium: new Map(entries.map((e) => [e.personaId, e] as const)),
  };
}

const req = (over: Partial<RouteRequest>): RouteRequest => ({
  targetId: 'omoikane',
  skillIds: [],
  objective: 'fewest-steps',
  maxDepth: 3,
  pool: 'compendium',
  ...over,
});

// Orpheus (Fool 1) + Jack Frost (Magician 8) → Omoikane (Hierophant 7).
const OWNED: CompendiumEntry[] = [
  { personaId: 'orpheus', level: 3, skillIds: ['agi', 'dia'] },
  { personaId: 'jack-frost', level: 10, skillIds: ['bufu', 'pulinpa', 'mabufu'] },
  { personaId: 'nekomata', level: 3, skillIds: ['agi', 'rakunda'] },
  { personaId: 'apsaras', level: 2, skillIds: ['bufu'] },
];

describe('P3R route finder', () => {
  it('finds a one-fusion route from owned personas, and every step really fuses', () => {
    const c = ctx(OWNED);
    const res = findRoutes(engine, DATA, c, req({}));
    expect(res.routes.length).toBeGreaterThan(0);
    for (const route of res.routes) {
      for (const step of routeSteps(route.tree)) {
        const ids = step.ingredients.map((n) => (n.kind === 'leaf' ? n.personaId : n.resultId));
        const o = engine.fuse(ids, c);
        expect(o.ok && o.resultId).toBe(step.resultId);
      }
      expect(routeLeaves(route.tree).every((l) => l.owned)).toBe(true);
    }
    expect(res.routes[0].steps).toBe(1);
  });

  it('carries a wanted skill the result can inherit', () => {
    // Omoikane is elecL, which takes ice skills such as Jack Frost's Mabufu.
    const best = findRoutes(engine, DATA, ctx(OWNED), req({ skillIds: ['mabufu'] })).routes[0];
    expect(best.complete).toBe(true);
    expect(routeLeaves(best.tree).map((l) => l.personaId)).toContain('jack-frost');
  });

  it('says when nothing in the pool knows a wanted skill', () => {
    const res = findRoutes(engine, DATA, ctx(OWNED), req({ skillIds: ['agidyne'] }));
    expect(res.routes[0].assignments[0].reason).toContain('Nothing in your pool knows');
  });

  it('refuses a target above the protagonist level, and a special that is not a pair', () => {
    expect(findRoutes(engine, DATA, ctx(OWNED, 5), req({})).problems[0]).toContain('above your protagonist');
    expect(findRoutes(engine, DATA, ctx(OWNED), req({ targetId: 'norn' })).problems[0]).toContain('special fusion of 3 personas');
  });

  it('reports an empty pool rather than inventing material', () => {
    const res = findRoutes(engine, DATA, ctx([]), req({}));
    expect(res.routes).toEqual([]);
    expect(res.problems[0]).toContain('from your compendium');
  });

  it('uses fusable personas at or below the protagonist level when allowed', () => {
    const res = findRoutes(engine, DATA, ctx([], 30), req({ pool: 'available', targetId: 'high-pixie', maxDepth: 2 }));
    expect(res.routes.length).toBeGreaterThan(0);
    for (const leaf of res.routes.flatMap((r) => routeLeaves(r.tree))) {
      const p = DATA.personas.find((x) => x.id === leaf.personaId)!;
      expect(leaf.owned).toBe(false);
      expect(p.kind).toBe('normal');
      expect(p.level).toBeLessThanOrEqual(30);
    }
  });

  it('never uses the same persona twice in one tree', () => {
    const res = findRoutes(engine, DATA, ctx([], 40), req({ pool: 'available', targetId: 'narcissus', maxDepth: 3 }));
    for (const route of res.routes) {
      const leaves = routeLeaves(route.tree).map((l) => l.personaId);
      expect(new Set(leaves).size).toBe(leaves.length);
    }
  });
});
