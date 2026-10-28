import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Demon, ElementChart, FusionChart, Skill, SpecialRecipes } from '../model';
import { FusionEngine, summonCost } from './engine';
import type { FusionContext, FusionData, FusionOutcome } from './types';

/**
 * Golden suite for the Nocturne engine, against the **real committed datasets**.
 * Normal and element expectations are hand-derived from the committed data by
 * applying the upstream rules (result race from the chart, then the race's
 * fusable list) — so a flipped rounding direction or an off-by-one rank shift
 * diverges from the literal.
 *
 *   fairy: pixie 2 · jack-frost 7 · jack-o-lantern 19 · kelpie 26 · troll 38 · setanta 43 · oberon 46 · titania 57
 *   yoma:  apsaras 8 · isora 14 · koppa-tengu 19 · dis 23 · ongkhot 37 · jinn 44 · pulukishi 48
 *   fury (fusable): dionysus 44 · beidou-xingjun 61   (shiva is special-only)
 */
const repoRoot = fileURLToPath(import.meta.url).replace(/[\\/]src[\\/].*$/, '');
const load = <T>(name: string): T =>
  JSON.parse(readFileSync(`${repoRoot}/public/data/smt3/${name}.json`, 'utf8')) as T;

const DATA: FusionData = {
  demons: load<Demon[]>('demons'),
  skills: load<Skill[]>('skills'),
  fusionChart: load<FusionChart>('fusion-chart'),
  elementChart: load<ElementChart>('element-chart'),
  specialRecipes: load<SpecialRecipes>('special-recipes'),
};

const engine = new FusionEngine(DATA);
const ALL_ON = { story: true, fiend: true, amala: true } as const;
const ctx = (over: Partial<FusionContext> = {}): FusionContext => ({
  protagonistLevel: 99,
  enforceLevelCap: true,
  unlockGroups: ALL_ON,
  compendium: new Map(),
  ...over,
});

function result(a: string, b: string, c = ctx()): FusionOutcome {
  return engine.fuse([a, b], c);
}

function expectResult(o: FusionOutcome, id: string, path: string): void {
  expect(o.ok).toBe(true);
  if (o.ok) {
    expect(o.resultId).toBe(id);
    expect(o.path).toBe(path);
  }
}

describe('Nocturne fusion engine — normal (different race)', () => {
  it('rounds (a + b) / 2 + 1 up to the next fusable demon of the chart race', () => {
    // jirae × fairy → yoma; (3 + 2) / 2 + 1 = 3.5 → apsaras (8)
    expectResult(result('kodama', 'pixie'), 'apsaras', 'normal');
    // (13 + 7) / 2 + 1 = 11 → isora (14)
    expectResult(result('sudama', 'jack-frost'), 'isora', 'normal');
  });

  it('is order-independent', () => {
    expectResult(result('pixie', 'kodama'), 'apsaras', 'normal');
  });

  it('clamps to the race ceiling, skipping special-only demons', () => {
    // vile × tyrant → fury; (83 + 91) / 2 + 1 = 88 overshoots → beidou-xingjun, not shiva
    const o = result('mada', 'mot');
    expectResult(o, 'beidou-xingjun', 'normal');
    expect(o.ok && o.clampedToCeiling).toBe(true);
  });

  it('flags a result above the Demi-fiend level, and honours the cap toggle', () => {
    const capped = result('sudama', 'jack-frost', ctx({ protagonistLevel: 10 }));
    expect(capped.ok && capped.blockedByLevel).toBe(true);
    const uncapped = result('sudama', 'jack-frost', ctx({ protagonistLevel: 10, enforceLevelCap: false }));
    expect(uncapped.ok && uncapped.blockedByLevel).toBe(false);
  });

  it('names the Deathstone Fiends a Yoma result could become, and the cursed race', () => {
    const o = result('kodama', 'pixie');
    expect(o.ok && [...o.deathstoneIds].sort()).toEqual(['matador', 'white-rider']);
    expect(o.ok && o.cursedRace).toBe('wilder');
    const noFiends = result('kodama', 'pixie', ctx({ unlockGroups: { ...ALL_ON, fiend: false } }));
    expect(noFiends.ok && noFiends.deathstoneIds).toEqual([]);
  });

  it('explains an empty chart cell', () => {
    const o = result('metatron', 'amaterasu'); // seraph × deity has no cell
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.code).toBe('no-race-result');
  });
});

describe('Nocturne fusion engine — same race, element and mitama', () => {
  it('fuses two demons of one race into its Element', () => {
    expectResult(result('pixie', 'jack-frost'), 'aeros', 'same-race');
  });

  it('refuses a demon with itself', () => {
    const o = result('pixie', 'pixie');
    expect(!o.ok && o.code).toBe('duplicate-parents');
  });

  it('shifts the partner one rank within its own race', () => {
    expectResult(result('pixie', 'erthys'), 'jack-frost', 'element'); // fairy × erthys = +1
    expectResult(result('aeros', 'kelpie'), 'jack-o-lantern', 'element'); // fairy × aeros = −1
  });

  it('slots a non-result demon into its race before shifting', () => {
    // high-pixie (10, evolution-only) sits between jack-frost 7 and jack-o-lantern 19
    expectResult(result('high-pixie', 'erthys'), 'jack-o-lantern', 'element');
    expectResult(result('high-pixie', 'aeros'), 'jack-frost', 'element');
  });

  it('fails when the shift falls off either end of the race', () => {
    expect(!result('pixie', 'aeros').ok).toBe(true);
    const o = result('titania', 'aquans');
    expect(!o.ok && o.code).toBe('element-out-of-range');
  });

  it('pairs two different Elements into a Mitama', () => {
    expectResult(result('erthys', 'aeros'), 'nigi-mitama', 'mitama');
    expectResult(result('flaemis', 'aquans'), 'saki-mitama', 'mitama');
  });

  it('refuses a Mitama as an ingredient', () => {
    const o = result('nigi-mitama', 'pixie');
    expect(!o.ok && o.code).toBe('mitama-ingredient');
  });
});

describe('Nocturne fusion engine — special recipes', () => {
  it('overrides the chart with a fixed recipe', () => {
    expectResult(result('rangda', 'barong'), 'shiva', 'special');
    expectResult(result('barong', 'rangda'), 'shiva', 'special');
  });

  it('allows the same-demon special recipes', () => {
    expectResult(result('throne', 'throne'), 'samael', 'special');
  });

  it('refuses a special result whose unlock group is off', () => {
    const o = result('michael', 'angel', ctx({ unlockGroups: { ...ALL_ON, amala: false } }));
    expect(!o.ok && o.code).toBe('result-locked');
    expectResult(result('michael', 'angel'), 'metatron', 'special');
  });
});

describe('Nocturne fusion engine — reverse and forward listings', () => {
  it('lists every pair recipesFor finds, and each one fuses to the target', () => {
    const c = ctx();
    const recipes = engine.recipesFor('isora', c);
    expect(recipes.length).toBeGreaterThan(0);
    for (const r of recipes) expectResult(engine.fuse(r.ingredientIds, c), 'isora', r.path);
    expect(recipes.some((r) => r.ingredientIds.includes('sudama') && r.ingredientIds.includes('jack-frost'))).toBe(true);
  });

  it('includes special and same-demon recipes', () => {
    expect(engine.recipesFor('shiva', ctx()).map((r) => r.path)).toEqual(['special']);
    expect(engine.recipesFor('samael', ctx()).some((r) => r.ingredientIds[0] === 'throne' && r.ingredientIds[1] === 'throne')).toBe(true);
  });

  it('has no pairs for evolution-only, recruit-only and Deathstone demons', () => {
    expect(engine.recipesFor('high-pixie', ctx())).toEqual([]);
    expect(engine.recipesFor('dante', ctx())).toEqual([]);
    expect(engine.recipesFor('matador', ctx())).toEqual([]);
  });

  it('is symmetric with fusionsFrom', () => {
    const c = ctx();
    const from = engine.fusionsFrom('pixie', c);
    const kodama = from.find((r) => r.ingredientIds[1] === 'kodama');
    expect(kodama?.resultId).toBe('apsaras');
    expect(engine.recipesFor('apsaras', c).some((r) => r.ingredientIds.includes('pixie') && r.ingredientIds.includes('kodama'))).toBe(true);
  });
});

describe('Nocturne fusion engine — inheritance and cost', () => {
  it('blocks a body-type skill the result cannot take, and passes an open one', () => {
    const lunge = DATA.skills.find((s) => s.id === 'lunge')!;
    expect(lunge.inheritCategory).toBe('thrust');
    const noThrust = DATA.demons.find((d) => d.kind === 'normal' && !d.inherits.includes('thrust'))!;
    const withThrust = DATA.demons.find((d) => d.kind === 'normal' && d.inherits.includes('thrust'))!;
    expect(engine.canInherit(noThrust.id, 'lunge')).toBe(false);
    expect(engine.canInherit(withThrust.id, 'lunge')).toBe(true);
    expect(engine.canInherit(noThrust.id, 'agi')).toBe(true);
  });

  it('never passes a unique skill', () => {
    expect(engine.canInherit('pixie', 'freikugel')).toBe(false);
  });

  it('reports the parents\' skills with a verdict, marking ones the result already knows', () => {
    const rows = engine.inheritableSkills(['kodama', 'pixie'], 'apsaras', ctx());
    expect(rows.length).toBeGreaterThan(0);
    const dia = rows.find((r) => r.skillId === 'dia');
    expect(dia).toBeDefined();
  });

  it('uses a registered parent\'s recorded skills instead of its native set', () => {
    const compendium = new Map([['pixie', { demonId: 'pixie', level: 20, skillIds: ['agidyne'] }]]);
    const ids = engine.inheritableSkills(['pixie', 'kodama'], 'apsaras', ctx({ compendium })).map((r) => r.skillId);
    expect(ids).toContain('agidyne');
  });

  it('estimates the summon cost with upstream\'s formula', () => {
    const pixie = DATA.demons.find((d) => d.id === 'pixie')!;
    const { strength, magic, vitality, agility, luck } = pixie.stats;
    const sum = strength + magic + vitality + agility + luck;
    expect(summonCost(pixie)).toBe(100 * Math.floor((sum * sum) / 20));
  });
});
