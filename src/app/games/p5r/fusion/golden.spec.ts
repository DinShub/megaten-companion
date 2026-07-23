import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type {
  AdvancedRecipes,
  ElementChart,
  FusionChart,
  InheritMatrix,
  Persona,
  Skill,
} from '../model';
import { FusionEngine } from './engine';
import type { FusionContext, FusionData } from './types';

/**
 * Golden suite (§12, task 40). Asserts known-correct P5R recipes against the
 * **real committed datasets**, across all four fusion paths plus the top- and
 * bottom-of-arcana clamp edges. This is the highest-value suite in the project:
 * the engine is pure and deterministic, and everything downstream depends on it
 * being right.
 *
 * The advanced-recipe cases are known-correct straight from `advanced-recipes.json`.
 * The normal/same/treasure expectations are hand-derived from the committed data
 * by applying the §6.1 rules (target level, then the arcana result list), so a
 * mis-implemented rule diverges from the literal — see the same-arcana case, which
 * fails if the rounding direction is flipped (the task-40 done-when).
 *
 * The datasets are read through Node at test time (see `src/testing-node.d.ts`),
 * which keeps the assertions honest against exactly what ships in `public/`.
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

// A fixed, fully-unlocked context so the arcana result lists — and therefore the
// expected results — are deterministic and match the hand-derivation.
const ALL_ON = { story: true, confidant: true, dlc: true } as const;

function baseCtx(over: Partial<FusionContext> = {}): FusionContext {
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

function fuse(ids: string[], ctx: FusionContext = baseCtx()) {
  const outcome = engine.fuse(ids, ctx);
  if (!outcome.ok) throw new Error(`${ids.join(' + ')} → invalid: ${outcome.code} (${outcome.message})`);
  return outcome;
}

describe('golden — advanced recipes (§6.2, known-correct from the recipe data)', () => {
  it('barong + rangda → Shiva', () => {
    const r = fuse(['barong', 'rangda']);
    expect(r.resultId).toBe('shiva');
    expect(r.path).toBe('advanced');
  });

  it('belial + nebiros → Alice, overriding the same-arcana result', () => {
    const r = fuse(['belial', 'nebiros']);
    expect(r).toMatchObject({ resultId: 'alice', path: 'advanced' });
  });

  it('Jack-o’-Lantern + Jack Frost + King Frost → Black Frost (3 ingredients)', () => {
    expect(fuse(['jack-o-lantern', 'jack-frost', 'king-frost']).resultId).toBe('black-frost');
  });
});

describe('golden — different arcana (§6.1) rounds UP', () => {
  it('Nekomata + Andras → Anzu (lowest hierophant ≥ target 23)', () => {
    expect(fuse(['nekomata', 'andras'])).toMatchObject({
      resultId: 'anzu',
      path: 'different-arcana',
      targetLevel: 23,
      clampedToCeiling: false,
    });
  });

  it('Pixie + Jack Frost → Andras (skips Incubus, which is below target 7)', () => {
    expect(fuse(['pixie', 'jack-frost']).resultId).toBe('andras');
  });

  it('clamps to the arcana ceiling on overflow: Abaddon + Atavaka → Lakshmi', () => {
    expect(fuse(['abaddon', 'atavaka'])).toMatchObject({
      resultId: 'lakshmi',
      clampedToCeiling: true,
    });
  });
});

describe('golden — same arcana (§6.1) rounds DOWN', () => {
  it('Queen Mab + Forneus → Rangda (round down; a flipped rule would give Surt)', () => {
    // Task-40 sign-flip guard: target 54 sits between Rangda (48) and Surt (83) in
    // the magician list. Rounding down picks Rangda; flipping the rounding
    // direction picks Surt and breaks this assertion.
    expect(fuse(['queen-mab', 'forneus'])).toMatchObject({
      resultId: 'rangda',
      path: 'same-arcana',
      targetLevel: 54,
    });
  });

  it('clamps up to the arcana floor: Abaddon + Anubis → Yamata-no-Orochi', () => {
    expect(fuse(['abaddon', 'anubis']).resultId).toBe('yamata-no-orochi');
  });
});

describe('golden — treasure demon (§6.1)', () => {
  it('Regent + Jack Frost → Nekomata (shift +1 within magician)', () => {
    expect(fuse(['regent', 'jack-frost'])).toMatchObject({
      resultId: 'nekomata',
      path: 'treasure',
      targetLevel: null,
    });
  });
});

describe('golden — summon cost (§6.8)', () => {
  it('Pixie re-summons for 2169', () => {
    expect(engine.summonCost('pixie')).toBe(2169);
  });
});
