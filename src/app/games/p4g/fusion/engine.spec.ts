import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { FusionChart, InheritMatrix, Persona, Skill, SpecialRecipe } from '../model';
import { FusionEngine, summonCost } from './engine';
import type { FusionContext, FusionData, FusionOutcome } from './types';

/**
 * Golden suite for the P4G engine, against the **real committed datasets**.
 * Expectations are hand-derived from the committed data by applying the
 * upstream rules — so a flipped rounding direction, the wrong chart triangle or
 * a wrong triangle lead diverges from the literal.
 *
 *   magician:   pixie 2 · orobas 8 · jack-frost 16 · hua-po 25 · pyro-jack 32 …
 *   temperance: apsaras 4 · sylph 11 · xiezhai 16 … yurlungur 69 · vishnu 73 (Temperance Rank 10)
 *   fortune:    fortuna 35 · clotho 44 · lachesis 51 · ananta 58 · atropos 65
 *
 *   normal chart:   justice × hierophant → temperance · fool × magician → temperance
 *                   magician × chariot → temperance · fool × chariot → sun
 *   triangle chart: magician × sun → fortune
 */
const repoRoot = fileURLToPath(import.meta.url).replace(/[\\/]src[\\/].*$/, '');
const load = <T>(name: string): T => JSON.parse(readFileSync(`${repoRoot}/public/data/p4g/${name}.json`, 'utf8')) as T;

const DATA: FusionData = {
  personas: load<Persona[]>('personas'),
  skills: load<Skill[]>('skills'),
  fusionChart: load<FusionChart>('fusion-chart'),
  specialRecipes: load<SpecialRecipe[]>('special-recipes'),
  inheritMatrix: load<InheritMatrix>('inherit-matrix'),
};

const engine = new FusionEngine(DATA);
const ALL_ON = { story: true, 'social-link': true } as const;
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

describe('P4G fusion engine — two personas', () => {
  it('different arcana: the chart arcana, rounded up from (a + b) / 2 + 0.5', () => {
    // justice × hierophant → temperance; (4 + 15) / 2 + 0.5 = 10 → sylph (11)
    expectResult(fuse(['angel', 'anzu']), 'sylph', 'normal');
    // fool × magician → temperance; (1 + 2) / 2 + 0.5 = 2 → apsaras (4)
    expectResult(fuse(['izanagi', 'pixie']), 'apsaras', 'normal');
  });

  it('clamps to the arcana top, and the unlock toggle moves the top', () => {
    // magician × chariot → temperance; (69 + 72) / 2 + 0.5 = 71 → vishnu (73)
    expectResult(fuse(['surt', 'atavaka']), 'vishnu', 'normal');
    const locked = fuse(['surt', 'atavaka'], ctx({ unlockGroups: { story: true, 'social-link': false } }));
    expectResult(locked, 'yurlungur', 'normal');
    expect(locked.ok && locked.clampedToCeiling).toBe(true);
  });

  it('same arcana: the highest persona at or below (a + b) / 2 + 1, never an ingredient', () => {
    // (2 + 16) / 2 + 1 = 10 → orobas (8)
    expectResult(fuse(['pixie', 'jack-frost']), 'orobas', 'same-arcana');
    // (2 + 8) / 2 + 1 = 6 → only pixie fits, and it is an ingredient
    const none = fuse(['pixie', 'orobas']);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.code).toBe('empty-arcana-pool');
  });

  it('flags a result above the protagonist only when the cap is enforced', () => {
    const capped = fuse(['angel', 'anzu'], ctx({ protagonistLevel: 5 }));
    expect(capped.ok && capped.blockedByLevel).toBe(true);
    const free = fuse(['angel', 'anzu'], ctx({ protagonistLevel: 5, enforceLevelCap: false }));
    expect(free.ok && free.blockedByLevel).toBe(false);
  });
});

describe('P4G fusion engine — triangle and special', () => {
  it('triangle: the highest-level persona leads; a tie goes to the earlier arcana', () => {
    // pixie (magician 2) and slime (chariot 2) tie; magician comes first, so pixie leads.
    // izanagi × slime → fool × chariot → sun; magician × sun → fortune;
    // (1 + 2 + 2) / 3 + 4.25 ≈ 5.92 → fortuna (35)
    const o = fuse(['izanagi', 'slime', 'pixie']);
    expectResult(o, 'fortuna', 'triangle');
    if (o.ok) {
      expect(o.leadId).toBe('pixie');
      expect(o.intermediateArcana).toBe('sun');
    }
  });

  it('three of one arcana stay in it, skipping the ingredients', () => {
    // (2 + 8 + 16) / 3 + 4.25 ≈ 12.92 → hua-po (25)
    expectResult(fuse(['pixie', 'orobas', 'jack-frost']), 'hua-po', 'triangle');
  });

  it('special recipes of any size win, in any order', () => {
    expectResult(fuse(['nebiros', 'belial']), 'alice', 'special');
    expectResult(fuse(['atropos', 'clotho', 'lachesis']), 'norn', 'special');
    const four = fuse(['pixie', 'slime', 'angel', 'anzu']);
    expect(four.ok).toBe(false);
    if (!four.ok) expect(four.code).toBe('no-special-recipe');
  });

  it('rejects duplicates and unknown ids', () => {
    expect(fuse(['pixie', 'pixie']).ok).toBe(false);
    expect(fuse(['pixie', 'nope']).ok).toBe(false);
  });
});

describe('P4G fusion engine — listings', () => {
  it('reverse pairs include the forward example, and only make the target', () => {
    const recipes = engine.recipesFor('sylph', ctx());
    expect(recipes.some((r) => r.ingredientIds.includes('angel') && r.ingredientIds.includes('anzu'))).toBe(true);
    expect(recipes.every((r) => r.resultId === 'sylph' && r.ingredientIds.length === 2)).toBe(true);
  });

  it('specials are listed on their own', () => {
    expect(engine.specialFor('norn')?.ingredientIds).toEqual(['clotho', 'lachesis', 'atropos']);
    expect(engine.specialFor('pixie')).toBeNull();
  });

  it('triangles for a target all fuse back to it', () => {
    const triangles = engine.trianglesFor('fortuna', ctx());
    expect(triangles.length).toBeGreaterThan(0);
    expect(triangles.some((r) => [...r.ingredientIds].sort().join() === 'izanagi,pixie,slime')).toBe(true);
    for (const r of triangles.slice(0, 50)) expectResult(engine.fuse(r.ingredientIds, ctx()), 'fortuna', 'triangle');
  });

  it('forward listing covers every partner', () => {
    const from = engine.fusionsFrom('pixie', ctx());
    expect(from.some((r) => r.resultId === 'apsaras' && r.ingredientIds.includes('izanagi'))).toBe(true);
  });
});

describe('P4G fusion engine — inheritance and cost', () => {
  it('blocks the elements an inherit type refuses', () => {
    // Jack Frost is ice-type; ice-types cannot take fire skills.
    expect(engine.canInherit('jack-frost', 'agi')).toBe(false);
    expect(engine.canInherit('jack-frost', 'zio')).toBe(true);
  });

  it('marks unique and already-known skills', () => {
    const pool = engine.inheritableSkills(['angel', 'anzu'], 'sylph', ctx());
    expect(pool.find((s) => s.skillId === 'garu')?.reason).toBe('already-known');
    expect(pool.some((s) => s.eligible)).toBe(true);
  });

  it('prices a recall at 2000 + (stat sum)²', () => {
    const pixie = DATA.personas.find((p) => p.id === 'pixie')!;
    const sum = Object.values(pixie.stats).reduce((a, b) => a + b, 0);
    expect(summonCost(pixie)).toBe(2000 + sum * sum);
  });
});
