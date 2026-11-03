import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Demon, ElementChart, FusionChart, Races, SpecialRecipes, TripleChart } from '../model';
import { FusionEngine, summonCost } from './engine';
import type { FusionContext, FusionData, FusionOutcome } from './types';

/**
 * Golden suite for the SMT1 engine, against the **real committed datasets**.
 * Every expectation is hand-derived from the committed data by applying the
 * upstream rules, so a flipped rounding direction or an off-by-one rank shift
 * diverges from the literal:
 *
 *   kishin: hitokotonushi 23 · kotoshironushi 31 · oumononushi 38 · take-minakata 43 · nagasunehiko 46 · zouchouten 55 · …
 *   deities (deity + megami): ame-no-uzume 16 · kushinada-hime 28 · sarasvati 39 · loki 40 · kikuri-hime 50 · arahabaki 51 · odin 58 · fudou-myouou 64 · lakshmi 64.1 · indra 72 · vishnu 82
 *   fairy: pixie 2 · goblin 6 · jack-frost 8 · … · troll 46 · tam-lin 55.1 · … · oberon 64     (shifts: sylph +2, gnome +1, salamander −1)
 *   yoma:  kinnari 15 · apsaras 21 · isora 34 · watcher 37 · loa 41 · …                         (jaki is dark: gremlin 5, tun-kou 8, orc 11)
 */
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
const ctx = (over: Partial<FusionContext> = {}): FusionContext => ({ heroLevel: 99, enforceLevelCap: true, ...over });

function ok(outcome: FusionOutcome) {
  if (!outcome.ok) throw new Error(`expected a result, got ${outcome.code}: ${outcome.message}`);
  return outcome;
}
function bad(outcome: FusionOutcome) {
  if (outcome.ok) throw new Error(`expected no result, got ${outcome.resultId} (${outcome.path})`);
  return outcome;
}

describe('SMT1 FusionEngine — pair rules', () => {
  it('applies a special recipe before the chart, and says what the chart would give', () => {
    const r = ok(engine.fuse('barong', 'rangda', ctx()));
    expect(r.resultId).toBe('shiva');
    expect(r.path).toBe('special');
    expect(r.chartSays).toEqual({ kind: 'race', id: 'kishin' });
    expect(ok(engine.fuse('rangda', 'barong', ctx())).resultId).toBe('shiva');
  });

  it('takes the lowest of the chart race at or above (a + b) / 2 + 1.5', () => {
    // Avatar × Femme → Kishin; (55 + 45) / 2 + 1.5 = 51.5 → Zouchouten 55.
    const r = ok(engine.fuse('chimera', 'dakini', ctx()));
    expect(r.resultId).toBe('zouchouten');
    expect(r.path).toBe('normal');
    expect(r.targetLevel).toBe(51.5);
  });

  it('looks a species result up across its races together', () => {
    // Megami × Deity → Deities; (16 + 40) / 2 + 1.5 = 29.5 → Sarasvati 39 (a Megami).
    const r = ok(engine.fuse('ame-no-uzume', 'loki', ctx()));
    expect(r.resultId).toBe('sarasvati');
    expect(r.path).toBe('species');
  });

  it('bumps past an ingredient to the next one up', () => {
    // (50 + 40) / 2 + 1.5 = 46.5 → Kikuri-Hime 50, an ingredient → Arahabaki 51.
    const r = ok(engine.fuse('kikuri-hime', 'loki', ctx()));
    expect(r.resultId).toBe('arahabaki');
    expect(r.bumped).toBe(true);
  });

  it('clamps an overshoot to the top of the race', () => {
    // Deity × Femme → Megami; (82 + 69) / 2 + 1.5 = 77 > Lakshmi 64.1, the top.
    const r = ok(engine.fuse('vishnu', 'kali', ctx()));
    expect(r.resultId).toBe('lakshmi');
    expect(r.clampedToCeiling).toBe(true);
  });

  it('makes the race element from two demons of one race', () => {
    const r = ok(engine.fuse('lamia', 'gorgon', ctx()));
    expect(r.resultId).toBe('undine');
    expect(r.path).toBe('same-race');
  });

  it('moves a demon within its race by the element chart', () => {
    expect(ok(engine.fuse('pixie', 'sylph', ctx())).resultId).toBe('jack-frost'); // +2
    expect(ok(engine.fuse('gnome', 'troll', ctx())).resultId).toBe('tam-lin'); // +1
    expect(bad(engine.fuse('pixie', 'salamander', ctx())).code).toBe('element-out-of-range'); // −1 off the bottom
    expect(bad(engine.fuse('oberon', 'gnome', ctx())).code).toBe('element-out-of-range'); // +1 off the top
  });

  it('makes nothing from two elements unless a special recipe names them', () => {
    expect(ok(engine.fuse('salamander', 'undine', ctx())).resultId).toBe('itzamna');
    expect(ok(engine.fuse('salamander', 'undine', ctx())).path).toBe('special');
  });

  it('applies the dark rule forward (SPEC §17.1 A6): 7 → two up, 5 → one up, 3 → one down', () => {
    expect(ok(engine.fuse('isora', 'tun-kou', ctx())).resultId).toBe('loa'); // 34 + 8 = 42, ×7
    expect(ok(engine.fuse('kinnari', 'gremlin', ctx())).resultId).toBe('apsaras'); // 15 + 5 = 20, ×5
    expect(ok(engine.fuse('isora', 'gremlin', ctx())).resultId).toBe('apsaras'); // 34 + 5 = 39, ×3
    expect(ok(engine.fuse('isora', 'gremlin', ctx())).path).toBe('dark');
    expect(bad(engine.fuse('kinnari', 'tun-kou', ctx())).code).toBe('dark-no-rule'); // 23
    expect(bad(engine.fuse('pixie', 'gremlin', ctx())).code).toBe('dark-no-rule'); // dark one is higher
    expect(bad(engine.fuse('gremlin', 'tun-kou', ctx())).code).toBe('dark-pair');
  });

  it('flags a result above the hero level only when the cap is on', () => {
    expect(ok(engine.fuse('chimera', 'dakini', ctx({ heroLevel: 50 }))).blockedByLevel).toBe(true);
    expect(ok(engine.fuse('chimera', 'dakini', ctx({ heroLevel: 50, enforceLevelCap: false }))).blockedByLevel).toBe(false);
  });

  it('refuses a demon fused with itself and unknown ids', () => {
    expect(bad(engine.fuse('pixie', 'pixie', ctx())).code).toBe('duplicate-parents');
    expect(bad(engine.fuse('pixie', 'nobody', ctx())).code).toBe('unknown-demon');
  });
});

describe('SMT1 FusionEngine — triple rule', () => {
  it('reads the row from the two lower species and the column from the highest', () => {
    // Loki (deities) + Agni (icons), Odin highest (deities) → Deity. Sum with upstream's
    // tri-levels 58 + 40.01 + 47.03 = 145.04 → needs 3·lvl − 22.5 ≥ 145.04 → Odin 58, an
    // ingredient → Fudou Myouou 64.
    const r = ok(engine.fuse3('loki', 'agni', 'odin', ctx()));
    expect(r.resultId).toBe('fudou-myouou');
    expect(r.path).toBe('triple');
    expect(r.bumped).toBe(true);
  });

  it('applies a three-demon special recipe first', () => {
    expect(ok(engine.fuse3('cherub', 'throne', 'dominion', ctx())).resultId).toBe('uriel');
  });

  it('needs one demon strictly highest, and the other two of different species', () => {
    expect(bad(engine.fuse3('fudou-myouou', 'oberon', 'loki', ctx())).code).toBe('triple-tie'); // both 64
    expect(bad(engine.fuse3('loki', 'sarasvati', 'odin', ctx())).code).toBe('no-triple-result'); // both lower ones deities
  });
});

describe('SMT1 FusionEngine — reverse', () => {
  it('lists the special recipe first, and every pair recipe re-fuses to the target', () => {
    const recipes = engine.pairRecipesFor('shiva');
    expect(recipes[0]).toEqual({ resultId: 'shiva', ingredientIds: ['barong', 'rangda'], path: 'special' });
    for (const r of recipes) expect(ok(engine.fuse(r.ingredientIds[0], r.ingredientIds[1], ctx())).resultId).toBe('shiva');
  });

  it('includes the chart, element and dark ways, not just the special recipe', () => {
    const paths = new Set(engine.pairRecipesFor('apsaras').map((r) => r.path));
    expect(paths.has('dark')).toBe(true);
    expect(engine.pairRecipesFor('apsaras').some((r) => r.ingredientIds.includes('kinnari') && r.ingredientIds.includes('gremlin'))).toBe(true);
  });

  it('finds nothing for a recruit-only demon', () => {
    const recruit = DATA.demons.find((d) => d.kind === 'recruit')!;
    expect(engine.pairRecipesFor(recruit.id)).toEqual([]);
  });

  it('finds triple recipes that re-fuse to the target', () => {
    const recipes = engine.tripleRecipesFor('fudou-myouou', ctx());
    expect(recipes.some((r) => r.ingredientIds.join() === 'odin,loki,agni')).toBe(true);
    for (const r of recipes) {
      const [a, b, c] = r.ingredientIds;
      expect(ok(engine.fuse3(a, b, c, ctx())).resultId).toBe('fudou-myouou');
    }
  });

  it('never makes a recruit-only or enemy-only demon', () => {
    const blocked = new Set(DATA.demons.filter((d) => d.kind !== 'normal').map((d) => d.id));
    for (const [, outcome] of engine.pairs()) if (outcome.ok) expect(blocked.has(outcome.resultId)).toBe(false);
  });
});

describe('summonCost', () => {
  it("is upstream's whole level cubed", () => {
    expect(summonCost(DATA.demons.find((d) => d.id === 'lakshmi')!)).toBe(64 ** 3);
  });
});
