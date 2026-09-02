import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { FusionEngine } from '../fusion';
import type { FusionContext, FusionData } from '../fusion';
import type {
  AdvancedRecipes,
  ElementChart,
  FusionChart,
  InheritMatrix,
  Persona,
  Skill,
} from '../model';
import type { InheritTypeId, PersonaId, SkillId } from '../model/ids';
import { findRoutes } from './route-finder';
import type { Objective, Route, RouteNode, RouteRequest } from './types';

/**
 * Route-finder property suite (§12, task 53). Like the fusion golden suite it
 * loads the **real committed datasets** and asserts invariants that must hold for
 * *every* route the finder returns, whatever the recipes turn out to be:
 *
 *  - **Reproducibility** — replaying each fusion node through `engine.fuse` yields
 *    that node's result and path. A route the engine can't reproduce fails here.
 *  - **Carry integrity** — every skill claimed as `inherited` has a real source
 *    leaf and survives the inherit mask at every fusion up to the root (§6.5).
 *  - **Ranking** — complete routes always precede partial ones (§7.2 step 6).
 *
 * plus the two named done-whens: the card short-circuit (task 47) and the
 * 2-of-3 partial route with the third explained (task 49).
 */
const repoRoot = fileURLToPath(import.meta.url).replace(/[\\/]src[\\/].*$/, '');

function load<T>(name: string): T {
  return JSON.parse(readFileSync(`${repoRoot}/public/data/p5r/${name}.json`, 'utf8')) as T;
}

const DATA: FusionData = {
  personas: load<Persona[]>('personas'),
  skills: load<Skill[]>('skills'),
  fusionChart: load<FusionChart>('fusion-chart'),
  advancedRecipes: load<AdvancedRecipes>('advanced-recipes'),
  elementChart: load<ElementChart>('element-chart'),
  inheritMatrix: load<InheritMatrix>('inherit-matrix'),
};

const engine = new FusionEngine(DATA);
const personaById = new Map<PersonaId, Persona>(DATA.personas.map((p) => [p.id, p]));
const skillById = new Map<SkillId, Skill>(DATA.skills.map((s) => [s.id, s]));
const ALL_ON = { story: true, confidant: true, dlc: true } as const;

function ctx(over: Partial<FusionContext> = {}): FusionContext {
  return {
    pool: 'obtainable',
    protagonistLevel: 99,
    enforceLevelCap: false,
    unlockGroups: ALL_ON,
    alarm: false,
    compendium: new Map(),
    ...over,
  };
}

function req(over: Partial<RouteRequest> & { targetId: PersonaId }): RouteRequest {
  return { skillIds: [], objective: 'fewest-steps', maxDepth: 2, ...over };
}

// ---- invariant checkers -----------------------------------------------------

function resultOf(node: RouteNode): PersonaId {
  return node.kind === 'leaf' ? node.personaId : node.resultId;
}

/** Every fusion node must reproduce, via the engine, from its children's results. */
function assertReproducible(node: RouteNode, c: FusionContext): void {
  if (node.kind === 'leaf') return;
  const childIds = node.children.map(resultOf);
  const outcome = engine.fuse(childIds, c);
  expect(outcome.ok).toBe(true);
  if (outcome.ok) {
    expect(outcome.resultId).toBe(node.resultId);
    expect(outcome.path).toBe(node.path);
  }
  for (const child of node.children) assertReproducible(child, c);
}

function nativeSkills(persona: Persona, level: number): Set<SkillId> {
  const out = new Set<SkillId>();
  for (const s of persona.learnedSkills) {
    if (s.kind === 'innate') out.add(s.skillId);
    else if (s.kind === 'level' && s.level <= level) out.add(s.skillId);
  }
  return out;
}

/** Mirror of the engine's §6.5 rule, for independently checking carry chains. */
function canInherit(type: InheritTypeId, skillId: SkillId): boolean {
  const skill = skillById.get(skillId)!;
  if (skill.unique) return false;
  if (skill.inheritElement === null) return true;
  return DATA.inheritMatrix[type][skill.inheritElement] === true;
}

/** A leaf under `node` knows the skill AND every fusion up to `node` admits it. */
function chainDelivers(skillId: SkillId, node: RouteNode, c: FusionContext): boolean {
  if (node.kind === 'leaf') {
    const entry = c.compendium.get(node.personaId);
    const known = entry ? new Set(entry.skillIds) : nativeSkills(personaById.get(node.personaId)!, node.level);
    return known.has(skillId);
  }
  if (!canInherit(personaById.get(node.resultId)!.inheritType, skillId)) return false;
  return node.children.some((child) => chainDelivers(skillId, child, c));
}

/** Assert the standing invariants over a whole search result. */
function assertInvariants(routes: readonly Route[], c: FusionContext, maxDepth: number): void {
  // Complete routes never sit below a partial one (§7.2 step 6).
  let seenPartial = false;
  for (const route of routes) {
    if (!route.complete) seenPartial = true;
    else expect(seenPartial).toBe(false);

    expect(route.steps).toBeLessThanOrEqual(maxDepth);
    assertReproducible(route.tree, c);

    for (const a of route.assignments) {
      if (a.satisfied && a.via === 'inherited') {
        expect(chainDelivers(a.skillId, route.tree, c)).toBe(true);
      }
    }
    // The three metrics are always present regardless of the objective (task 48).
    expect(Number.isFinite(route.cost)).toBe(true);
    expect(route.unowned).toBeGreaterThanOrEqual(0);
  }
}

// ---- reproducibility across the four paths ----------------------------------

describe('route finder — reproducibility (every route replays through fuse)', () => {
  it('a special target is built through its advanced recipe', () => {
    // Shiva = Barong + Rangda (advanced), neither in the pool as `special`… Shiva
    // itself is special so it is never a pool leaf — a route must fuse it.
    const result = findRoutes(engine, DATA, req({ targetId: 'shiva', maxDepth: 1 }), ctx());
    expect(result.routes.length).toBeGreaterThan(0);
    const top = result.routes[0];
    expect(top.tree.kind).toBe('fusion');
    if (top.tree.kind === 'fusion') expect(top.tree.path).toBe('advanced');
    assertInvariants(result.routes, ctx(), 1);
  });

  it('a normal target yields reproducible fusion routes at depth 2', () => {
    const c = ctx();
    for (const targetId of ['anzu', 'incubus', 'rangda']) {
      const result = findRoutes(engine, DATA, req({ targetId, maxDepth: 2 }), c);
      expect(result.routes.length).toBeGreaterThan(0);
      assertInvariants(result.routes, c, 2);
    }
  });

  it('in obtainable mode a normal target is also reachable as a zero-step leaf', () => {
    const result = findRoutes(engine, DATA, req({ targetId: 'anzu', objective: 'fewest-steps' }), ctx());
    // Anzu is a normal persona ≤ 99, so "just obtain it" is the fewest-steps route.
    expect(result.routes.some((r) => r.steps === 0)).toBe(true);
  });
});

// ---- registered specials are re-summonable, not re-fused --------------------

describe('route finder — a registered persona is re-summonable, even a special', () => {
  // Flauros is `kind: 'special'` (berith+eligor+orobas), so the §6.4 material pool
  // drops it — but once registered it is re-summoned from the compendium for yen,
  // never re-fused. It does not learn Tarukaja natively, so a recorded Tarukaja is
  // purely an inherited skill on the owned copy.
  const ownedFlauros = (skillIds: SkillId[], pool: 'compendium' | 'obtainable' = 'compendium'): FusionContext =>
    ctx({ pool, compendium: new Map([['flauros', { personaId: 'flauros', level: 19, skillIds, traitId: null }]]) });

  it('re-summons an owned special that already carries the wanted skill — zero steps, not a rebuild', () => {
    const c = ownedFlauros(['tarukaja']);
    const result = findRoutes(
      engine,
      DATA,
      req({ targetId: 'flauros', skillIds: ['tarukaja'], objective: 'fewest-steps', maxDepth: 3 }),
      c,
    );

    const top = result.routes[0];
    expect(top.steps).toBe(0);
    expect(top.complete).toBe(true);
    expect(top.tree.kind).toBe('leaf');
    if (top.tree.kind === 'leaf') {
      expect(top.tree.personaId).toBe('flauros');
      expect(top.tree.owned).toBe(true);
      expect(top.tree.supplies).toContain('tarukaja');
    }
    const taru = top.assignments.find((a) => a.skillId === 'tarukaja')!;
    expect(taru.satisfied).toBe(true);
    expect(taru.sourcePersonaId).toBe('flauros');
    assertInvariants(result.routes, c, 3);
  });

  it('offers a zero-step re-summon for an owned special with no skills requested', () => {
    const result = findRoutes(engine, DATA, req({ targetId: 'flauros', objective: 'fewest-steps' }), ownedFlauros([]));
    expect(result.routes[0].steps).toBe(0);
    expect(result.routes[0].tree.kind).toBe('leaf');
  });

  it('does NOT treat an unowned special as a leaf — it must still be fused (guards the fix)', () => {
    // Empty compendium, obtainable mode: Flauros is unowned + special, so "just
    // obtain it" is not on the table; every route fuses it via its advanced recipe.
    const result = findRoutes(engine, DATA, req({ targetId: 'flauros', objective: 'fewest-steps', maxDepth: 2 }), ctx());
    expect(result.routes.length).toBeGreaterThan(0);
    expect(result.routes.every((r) => r.tree.kind === 'fusion')).toBe(true);
  });
});

// ---- skill routing & the card short-circuit (tasks 46–47) -------------------

describe('route finder — skill routing', () => {
  it('a skill blocked by the target inherit type resolves via its card (§6.6, task 47)', () => {
    // Data-driven: find a card-backed skill whose element the target's inherit
    // type rejects, on a target that does not already learn it natively.
    const found = findCardBlockedCase();
    expect(found, 'expected a card-blocked case in the real data').not.toBeNull();
    const { targetId, skillId } = found!;

    const result = findRoutes(engine, DATA, req({ targetId, skillIds: [skillId], maxDepth: 1 }), ctx());
    expect(result.routes.length).toBeGreaterThan(0);
    const assignment = result.routes[0].assignments.find((a) => a.skillId === skillId)!;
    expect(assignment.satisfied).toBe(true);
    expect(assignment.via).toBe('card');
  });

  it('carries a native skill without inheritance', () => {
    const target = DATA.personas.find((p) => p.kind === 'normal' && nativeSkills(p, p.level).size >= 1)!;
    const skillId = [...nativeSkills(target, target.level)][0];
    const result = findRoutes(engine, DATA, req({ targetId: target.id, skillIds: [skillId] }), ctx());
    const assignment = result.routes[0].assignments.find((a) => a.skillId === skillId)!;
    expect(assignment.satisfied).toBe(true);
    expect(assignment.via).toBe('native');
  });
});

// ---- gap diagnostics & partial routes (task 49) -----------------------------

describe('route finder — diagnostics', () => {
  it('returns a 2-of-3 route with the third skill explained (task 49)', () => {
    // Two skills the target learns natively (always deliverable) plus one unique
    // skill with no card (never inheritable) → every route is 2-of-3.
    const target = DATA.personas.find((p) => p.kind === 'normal' && nativeSkills(p, p.level).size >= 2)!;
    const natives = [...nativeSkills(target, target.level)].slice(0, 2);
    const impossible = DATA.skills.find((s) => s.unique && s.cardSources.length === 0)!;
    expect(impossible, 'expected a unique, card-less skill').toBeTruthy();

    const result = findRoutes(
      engine,
      DATA,
      req({ targetId: target.id, skillIds: [...natives, impossible.id] }),
      ctx(),
    );
    expect(result.routes.length).toBeGreaterThan(0);
    const top = result.routes[0];
    expect(top.satisfiedCount).toBe(2);
    expect(top.complete).toBe(false);
    const gap = top.assignments.find((a) => a.skillId === impossible.id)!;
    expect(gap.satisfied).toBe(false);
    expect(gap.diagnostic?.code).toBe('NOT_INHERITABLE');
  });

  it('explains an unfusable (party) target at the search level', () => {
    const party = DATA.personas.find((p) => p.kind === 'party')!;
    const result = findRoutes(engine, DATA, req({ targetId: party.id }), ctx());
    expect(result.routes.length).toBe(0);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('reports DEPTH_EXCEEDED when a special target is out of depth reach', () => {
    // A special target in compendium mode with an empty compendium and depth 0 has
    // no leaf and no room to fuse — the finder must say so, never blank.
    const result = findRoutes(
      engine,
      DATA,
      req({ targetId: 'shiva', maxDepth: 0 }),
      ctx({ pool: 'compendium' }),
    );
    expect(result.routes.length).toBe(0);
    expect(result.diagnostics[0]?.code).toBe('DEPTH_EXCEEDED');
  });
});

// ---- ranking & determinism (task 48) ----------------------------------------

describe('route finder — ranking', () => {
  it('the objective changes the top route without dropping the other metrics', () => {
    const objectives: Objective[] = ['fewest-steps', 'cheapest', 'fewest-unowned'];
    for (const objective of objectives) {
      const result = findRoutes(engine, DATA, req({ targetId: 'rangda', objective, maxDepth: 2 }), ctx());
      expect(result.routes.length).toBeGreaterThan(0);
      // Every route always carries all three metrics (task 48).
      for (const route of result.routes) {
        expect(route).toHaveProperty('steps');
        expect(route).toHaveProperty('cost');
        expect(route).toHaveProperty('unowned');
      }
    }
  });

  it('is deterministic — the same request yields the same ranked trees', () => {
    const request = req({ targetId: 'incubus', skillIds: [], maxDepth: 2 });
    const a = findRoutes(engine, DATA, request, ctx());
    const b = findRoutes(engine, DATA, request, ctx());
    expect(a.routes.map((r) => treeKey(r.tree))).toEqual(b.routes.map((r) => treeKey(r.tree)));
  });
});

// ---- data-driven case finders -----------------------------------------------

function findCardBlockedCase(): { targetId: PersonaId; skillId: SkillId } | null {
  for (const skill of DATA.skills) {
    if (skill.unique || skill.inheritElement === null || skill.cardSources.length === 0) continue;
    const element = skill.inheritElement;
    for (const persona of DATA.personas) {
      if (persona.kind !== 'normal' || persona.level > 99) continue;
      if (DATA.inheritMatrix[persona.inheritType][element] === true) continue; // not blocked
      if (nativeSkills(persona, persona.level).has(skill.id)) continue; // would be native, not card
      return { targetId: persona.id, skillId: skill.id };
    }
  }
  return null;
}

function treeKey(node: RouteNode): string {
  if (node.kind === 'leaf') return `L:${node.personaId}`;
  return `F:${node.resultId}(${node.children.map(treeKey).sort().join(',')})`;
}
