import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { FusionChart, InheritMatrix, Persona, Skill, SpecialRecipe } from '../model';
import { FusionEngine, nativeSkills, summonCost } from './engine';
import type { FusionContext, FusionData, FusionOutcome } from './types';

/**
 * Golden suite for the P3R engine, against the **real committed datasets**.
 * Expectations are hand-derived from the committed data by applying the
 * upstream rules — so a flipped rounding direction or a wrong unlock filter
 * diverges from the literal.
 *
 *   fool:       orpheus 1 · slime 12 · legion 26 · ose 41 · izanagi 46 (DLC) · decarabia 54 (story) · loki 69
 *   magician:   nekomata 3 · jack-frost 8 · jack-o-lantern 15 · hua-po 19 (story) …
 *   hierophant: omoikane 7 · berith 13 · shiisaa 23 …
 *   empress:    … skadi 68 · mother-harlot 77 · alilat 84 (Empress Rank 10)
 *
 *   chart: fool × magician → hierophant · hierophant × justice → fool · priestess × tower → empress
 */
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
const ALL_ON = { story: true, 'social-link': true, 'teammate-link': true, dlc: true } as const;
const ctx = (over: Partial<FusionContext> = {}): FusionContext => ({
  protagonistLevel: 99,
  enforceLevelCap: true,
  unlockGroups: ALL_ON,
  compendium: new Map(),
  ...over,
});

const fuse = (ids: string[], c = ctx()): FusionOutcome => engine.fuse(ids, c);

function expectResult(o: FusionOutcome, id: string, path: string): void {
  expect(o.ok).toBe(true);
  if (o.ok) {
    expect(o.resultId).toBe(id);
    expect(o.path).toBe(path);
  }
}

describe('P3R fusion engine — two personas', () => {
  it('different arcana: the chart arcana, rounded up from (a + b) / 2 + 0.5', () => {
    // fool × magician → hierophant; (1 + 8) / 2 + 0.5 = 5 → omoikane (7)
    expectResult(fuse(['orpheus', 'jack-frost']), 'omoikane', 'normal');
  });

  it('honours the unlock groups: DLC personas drop out of the results', () => {
    // hierophant × justice → fool; (59 + 25) / 2 + 0.5 = 42.5 → izanagi (46, DLC)
    expectResult(fuse(['daisoujou', 'power']), 'izanagi', 'normal');
    // DLC off → the next fool up, decarabia (54)
    expectResult(fuse(['daisoujou', 'power'], ctx({ unlockGroups: { ...ALL_ON, dlc: false } })), 'decarabia', 'normal');
  });

  it('clamps to the arcana top, and the unlock toggle moves the top', () => {
    // priestess × tower → empress; (75 + 86) / 2 + 0.5 = 81 → alilat (84)
    expectResult(fuse(['scathach', 'chi-you']), 'alilat', 'normal');
    const locked = fuse(['scathach', 'chi-you'], ctx({ unlockGroups: { ...ALL_ON, 'social-link': false } }));
    expectResult(locked, 'mother-harlot', 'normal');
    expect(locked.ok && locked.clampedToCeiling).toBe(true);
  });

  it('same arcana: the highest persona at or below (a + b) / 2 + 1, never an ingredient', () => {
    // (3 + 15) / 2 + 1 = 10 → jack-frost (8)
    expectResult(fuse(['nekomata', 'jack-o-lantern']), 'jack-frost', 'same-arcana');
    // (3 + 8) / 2 + 1 = 6.5 → only nekomata fits, and it is an ingredient
    const none = fuse(['nekomata', 'jack-frost']);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.code).toBe('empty-arcana-pool');
  });

  it('flags a result above the protagonist only when the cap is enforced', () => {
    const capped = fuse(['orpheus', 'jack-frost'], ctx({ protagonistLevel: 5 }));
    expect(capped.ok && capped.blockedByLevel).toBe(true);
    const free = fuse(['orpheus', 'jack-frost'], ctx({ protagonistLevel: 5, enforceLevelCap: false }));
    expect(free.ok && free.blockedByLevel).toBe(false);
  });
});

describe('P3R fusion engine — specials, and no triangle', () => {
  it('special recipes of any size win, in any order', () => {
    expectResult(fuse(['barong', 'rangda']), 'shiva', 'special');
    expectResult(fuse(['atropos', 'clotho', 'lachesis']), 'norn', 'special');
  });

  it('three personas that are not a recipe do not fuse — Reload has no triangle fusion', () => {
    const three = fuse(['orpheus', 'jack-frost', 'nekomata']);
    expect(three.ok).toBe(false);
    if (!three.ok) expect(three.code).toBe('no-special-recipe');
  });

  it('a special whose unlock group is off is refused', () => {
    // Orpheus Telos needs every Social Link maxed.
    const telos = DATA.specialRecipes.find((r) => r.resultId === 'orpheus-telos')!;
    const o = fuse([...telos.ingredientIds], ctx({ unlockGroups: { ...ALL_ON, 'social-link': false } }));
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.code).toBe('result-locked');
  });

  it('rejects duplicates and unknown ids', () => {
    expect(fuse(['orpheus', 'orpheus']).ok).toBe(false);
    expect(fuse(['orpheus', 'nope']).ok).toBe(false);
  });
});

describe('P3R fusion engine — listings', () => {
  it('reverse pairs include the forward example, and only make the target', () => {
    const recipes = engine.recipesFor('omoikane', ctx());
    expect(recipes.some((r) => r.ingredientIds.includes('orpheus') && r.ingredientIds.includes('jack-frost'))).toBe(true);
    expect(recipes.every((r) => r.resultId === 'omoikane' && r.ingredientIds.length === 2)).toBe(true);
  });

  it('specials are listed on their own', () => {
    expect(engine.specialFor('norn')?.ingredientIds).toEqual(['clotho', 'lachesis', 'atropos']);
    expect(engine.specialFor('omoikane')).toBeNull();
  });

  it('forward listing covers every partner', () => {
    const from = engine.fusionsFrom('orpheus', ctx());
    expect(from.some((r) => r.resultId === 'omoikane' && r.ingredientIds.includes('jack-frost'))).toBe(true);
  });
});

describe('P3R fusion engine — inheritance and cost', () => {
  it('blocks the elements an inherit mask refuses; Almighty and passives stay open', () => {
    // Jack Frost is iceA, which refuses fire.
    expect(engine.canInherit('jack-frost', 'agi')).toBe(false);
    expect(engine.canInherit('jack-frost', 'zio')).toBe(true);
    // Omoikane is elecL, which refuses wind.
    expect(engine.canInherit('omoikane', 'garu')).toBe(false);
  });

  it('Theurgies are not native skills, so they are never in the pool', () => {
    const orpheus = DATA.personas.find((p) => p.id === 'orpheus')!;
    expect(nativeSkills(orpheus, 99)).not.toContain('cadenza');
    const pool = engine.inheritableSkills(['orpheus', 'jack-frost'], 'omoikane', ctx());
    expect(pool.map((s) => s.skillId)).not.toContain('cadenza');
    expect(pool.map((s) => s.skillId)).not.toContain('jack-brothers');
  });

  it('checks each parent skill against the result', () => {
    // Orpheus at Lv 1 knows only Agi; Jack Frost at Lv 8 knows Bufu and Pulinpa. Omoikane (elecL) refuses ailments.
    const pool = engine.inheritableSkills(['orpheus', 'jack-frost'], 'omoikane', ctx());
    expect(pool.find((s) => s.skillId === 'agi')?.eligible).toBe(true);
    expect(pool.find((s) => s.skillId === 'bufu')?.eligible).toBe(true);
    expect(pool.find((s) => s.skillId === 'pulinpa')).toEqual({ skillId: 'pulinpa', eligible: false, reason: 'blocked-element', blockingElement: 'ailment' });
  });

  it('prices a recall at 2000 + (stat sum)²', () => {
    const jack = DATA.personas.find((p) => p.id === 'jack-frost')!;
    const sum = Object.values(jack.stats).reduce((a, b) => a + b, 0);
    expect(summonCost(jack)).toBe(2000 + sum * sum);
  });
});
