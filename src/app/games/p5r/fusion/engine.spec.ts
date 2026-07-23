import type {
  AdvancedRecipes,
  ElementChart,
  FusionChart,
  InheritMatrix,
  Persona,
  Skill,
} from '../model';
import type {
  Affinity,
  ArcanaId,
  CompendiumEntry,
  ElementId,
  InheritTypeId,
  PersonaId,
  SkillElementId,
  Stats,
} from '../model';
import { ARCANA_ORDER, ELEMENT_ORDER, INHERIT_TYPE_ORDER } from '../model/ids';
import { FusionEngine } from './engine';
import type { FusionContext, FusionSuccess } from './types';

// ---- fixture builders ---------------------------------------------------

const STATS: Stats = { strength: 5, magic: 5, endurance: 5, agility: 5, luck: 5 };

function affinities(): Record<ElementId, Affinity> {
  const base = {} as Record<ElementId, Affinity>;
  for (const e of ELEMENT_ORDER) base[e] = 'neutral';
  return base;
}

function persona(
  over: Partial<Persona> & Pick<Persona, 'id' | 'arcana' | 'level'>,
): Persona {
  return {
    name: over.id,
    inheritType: 'almighty',
    traitId: null,
    stats: STATS,
    growth: STATS,
    maxStats: null,
    affinities: affinities(),
    learnedSkills: [],
    learnedTraits: [],
    kind: 'normal',
    unlock: null,
    prereq: null,
    itemization: { normal: null, alarm: null, normalItem: null, alarmItem: null },
    ...over,
  } as Persona;
}

function skill(over: Partial<Skill> & Pick<Skill, 'id'>): Skill {
  return {
    name: over.id,
    element: 'almighty' as SkillElementId,
    inheritElement: null,
    cost: null,
    target: '1 foe',
    description: '',
    rank: 10,
    unique: false,
    cardLocations: [],
    cardSources: [],
    ...over,
  } as Skill;
}

/** A full 24×24 null grid with the named pairs set symmetrically. */
function buildGrid(pairs: [ArcanaId, ArcanaId, ArcanaId][]): FusionChart {
  const grid = {} as Record<ArcanaId, Record<ArcanaId, ArcanaId | null>>;
  for (const a of ARCANA_ORDER) {
    grid[a] = {} as Record<ArcanaId, ArcanaId | null>;
    for (const b of ARCANA_ORDER) grid[a][b] = null;
  }
  for (const [a, b, r] of pairs) {
    grid[a][b] = r;
    grid[b][a] = r;
  }
  return { grid };
}

function allTrueMatrix(): InheritMatrix {
  const m = {} as Record<InheritTypeId, Record<string, boolean>>;
  for (const t of INHERIT_TYPE_ORDER) {
    m[t] = {} as Record<string, boolean>;
    for (const e of ELEMENT_ORDER) m[t][e] = t !== 'none';
    m[t]['ailment'] = t !== 'none';
    m[t]['healing'] = t !== 'none';
  }
  return m as InheritMatrix;
}

// magician: m1..m5, lovers: l1..l3, devil: d1..d3 (+ specials sp1/sp2), fool: f1/tr1/tr2/pt1
const PERSONAS: Persona[] = [
  persona({ id: 'm1', arcana: 'magician', level: 2 }),
  persona({
    id: 'm2',
    arcana: 'magician',
    level: 11,
    itemization: { normal: 'agi', alarm: 'bufu', normalItem: null, alarmItem: null },
    learnedSkills: [
      { skillId: 'agi', kind: 'innate', order: 1 },
      { skillId: 'bufu', kind: 'level', level: 5 },
      { skillId: 'tarukaja', kind: 'level', level: 20 }, // above base 11 → not native
      { skillId: 'megido', kind: 'innate', order: 2 },
    ],
  }),
  persona({ id: 'm3', arcana: 'magician', level: 17 }),
  persona({ id: 'm4', arcana: 'magician', level: 30 }),
  persona({ id: 'm5', arcana: 'magician', level: 50 }),
  persona({ id: 'l1', arcana: 'lovers', level: 2 }),
  persona({ id: 'l2', arcana: 'lovers', level: 20 }),
  persona({ id: 'l3', arcana: 'lovers', level: 80 }),
  persona({ id: 'd1', arcana: 'devil', level: 5 }),
  persona({ id: 'd2', arcana: 'devil', level: 27 }),
  persona({ id: 'd3', arcana: 'devil', level: 60 }),
  persona({ id: 'sp1', arcana: 'devil', level: 40, kind: 'special' }),
  persona({ id: 'sp2', arcana: 'devil', level: 35, kind: 'special' }),
  persona({ id: 'f1', arcana: 'fool', level: 10 }),
  persona({ id: 'tr1', arcana: 'fool', level: 8, kind: 'treasure' }),
  persona({ id: 'tr2', arcana: 'fool', level: 9, kind: 'treasure' }),
  persona({ id: 'pt1', arcana: 'fool', level: 5, kind: 'party' }),
];

const RECIPES: AdvancedRecipes = {
  recipes: [
    { resultId: 'sp1', ingredientIds: ['m2', 'l2'] }, // 2-ingredient → overrides normal
    { resultId: 'sp2', ingredientIds: ['m1', 'm3', 'd1'] }, // 3-ingredient
  ],
  treasureIds: ['tr1', 'tr2'],
};

// Only the arcana under test need offsets; the engine reads a row lazily.
const ELEMENT_CHART: ElementChart = {
  offsets: {
    magician: { tr1: 1, tr2: 2 },
    lovers: { tr1: -1, tr2: 1 },
    devil: { tr1: 1, tr2: -1 },
    fool: { tr1: 1, tr2: 1 },
  } as unknown as ElementChart['offsets'],
};

const DATA = {
  personas: PERSONAS,
  skills: [
    skill({ id: 'agi', element: 'fire', inheritElement: 'fire' }),
    skill({ id: 'bufu', element: 'ice', inheritElement: 'ice' }),
    skill({ id: 'tarukaja', element: 'support', inheritElement: null }),
    skill({ id: 'megido', element: 'almighty', inheritElement: null, unique: true }),
  ],
  fusionChart: buildGrid([['magician', 'lovers', 'devil']]),
  advancedRecipes: RECIPES,
  elementChart: ELEMENT_CHART,
  inheritMatrix: allTrueMatrix(),
};

function ctx(over: Partial<FusionContext> = {}): FusionContext {
  return {
    pool: 'obtainable',
    protagonistLevel: 99,
    enforceLevelCap: false,
    unlockGroups: { story: true, confidant: true, dlc: true },
    alarm: false,
    compendium: new Map<PersonaId, CompendiumEntry>(),
    ...over,
  };
}

function engine(): FusionEngine {
  return new FusionEngine(DATA);
}

function ok(outcome: ReturnType<FusionEngine['fuse']>): FusionSuccess {
  if (!outcome.ok) throw new Error(`expected success, got ${outcome.code}: ${outcome.message}`);
  return outcome;
}

// ---- tests --------------------------------------------------------------

describe('FusionEngine.fuse — different arcana (§6.1, task 32)', () => {
  it('rounds the average level up to the lowest result at or above target', () => {
    // m2(11) + l1(2): grid[magician][lovers] = devil; target = floor(13/2)+1 = 7.
    // devil list [d1:5, d2:27, d3:60]; lowest ≥ 7 is d2.
    const r = ok(engine().fuse(['m2', 'l1'], ctx()));
    expect(r.resultId).toBe('d2');
    expect(r.path).toBe('different-arcana');
    expect(r.targetLevel).toBe(7);
    expect(r.clampedToCeiling).toBe(false);
  });

  it('is order-independent', () => {
    expect(ok(engine().fuse(['l1', 'm2'], ctx())).resultId).toBe('d2');
  });

  it('clamps to the arcana ceiling when the target overflows', () => {
    // m5(50) + l3(80): target = floor(130/2)+1 = 66 > devil ceiling 60 → clamp to d3.
    const r = ok(engine().fuse(['m5', 'l3'], ctx()));
    expect(r.resultId).toBe('d3');
    expect(r.clampedToCeiling).toBe(true);
    expect(r.targetLevel).toBe(66);
  });

  it('reports no-arcana-result for an impossible pairing', () => {
    const r = engine().fuse(['f1', 'm2'], ctx()); // grid[fool][magician] = null
    expect(r).toEqual({
      ok: false,
      code: 'no-arcana-result',
      message: expect.stringContaining('no fusion result'),
    });
  });
});

describe('FusionEngine.fuse — same arcana (§6.1, task 33)', () => {
  it('rounds down to the highest result at or below target, excluding both ingredients', () => {
    // m2(11) + m4(30): target = floor(41/2)+1 = 21. Excluding m2,m4 → [m1:2,m3:17,m5:50].
    // Highest ≤ 21 is m3. (Round-up would give m5 — the sign-flip guard.)
    const r = ok(engine().fuse(['m2', 'm4'], ctx()));
    expect(r.resultId).toBe('m3');
    expect(r.path).toBe('same-arcana');
    expect(r.targetLevel).toBe(21);
  });

  it('clamps up to the arcana floor when the target is below it', () => {
    // m1(2) + m2(11): target = floor(13/2)+1 = 7. Excluding m1,m2 → [m3:17,m4:30,m5:50];
    // none ≤ 7 → clamp to the lowest, m3.
    expect(ok(engine().fuse(['m1', 'm2'], ctx())).resultId).toBe('m3');
  });

  it('rejects fusing a persona with itself (same species)', () => {
    const r = engine().fuse(['m2', 'm2'], ctx());
    expect(r).toMatchObject({ ok: false, code: 'duplicate-parents' });
  });
});

describe('FusionEngine.fuse — treasure demon (§6.1, task 34)', () => {
  it('shifts the non-treasure parent up by a positive offset', () => {
    // tr1 + m2: m2 is index 1 in magician [m1,m2,m3,m4,m5]; offset +1 → m3.
    const r = ok(engine().fuse(['tr1', 'm2'], ctx()));
    expect(r.resultId).toBe('m3');
    expect(r.path).toBe('treasure');
    expect(r.targetLevel).toBeNull();
  });

  it('shifts downward on a negative offset — not an upgrade', () => {
    // tr1 + l2: l2 is index 1 in lovers [l1,l2,l3]; offset -1 → l1.
    expect(ok(engine().fuse(['tr1', 'l2'], ctx())).resultId).toBe('l1');
  });

  it('is order-independent (treasure demon on either side)', () => {
    expect(ok(engine().fuse(['m2', 'tr1'], ctx())).resultId).toBe('m3');
  });

  it('fails when the shift falls outside the arcana', () => {
    // tr1 + l1: l1 index 0, offset -1 → -1, out of range.
    expect(engine().fuse(['tr1', 'l1'], ctx())).toMatchObject({
      ok: false,
      code: 'treasure-out-of-range',
    });
  });

  it('rejects two treasure demons', () => {
    expect(engine().fuse(['tr1', 'tr2'], ctx())).toMatchObject({ ok: false, code: 'treasure-pair' });
  });
});

describe('FusionEngine.fuse — advanced recipes (§6.2, task 35)', () => {
  it('matches an exact ingredient set and overrides the normal pairing', () => {
    // m2 + l2 would normally give a devil persona; the recipe wins → sp1.
    const r = ok(engine().fuse(['m2', 'l2'], ctx()));
    expect(r.resultId).toBe('sp1');
    expect(r.path).toBe('advanced');
  });

  it('matches a 3-ingredient recipe regardless of order', () => {
    expect(ok(engine().fuse(['d1', 'm3', 'm1'], ctx())).resultId).toBe('sp2');
  });

  it('reports no-advanced-recipe for an unmatched >2 ingredient set', () => {
    expect(engine().fuse(['m1', 'm3', 'm4'], ctx())).toMatchObject({
      ok: false,
      code: 'no-advanced-recipe',
    });
  });
});

describe('FusionEngine.fuse — level cap (§6.3, task 36)', () => {
  it('annotates blockedByLevel when the result outranks the protagonist', () => {
    // m2 + l1 → d2 (level 27).
    const blocked = ok(engine().fuse(['m2', 'l1'], ctx({ enforceLevelCap: true, protagonistLevel: 10 })));
    expect(blocked.blockedByLevel).toBe(true);
    const allowed = ok(engine().fuse(['m2', 'l1'], ctx({ enforceLevelCap: true, protagonistLevel: 30 })));
    expect(allowed.blockedByLevel).toBe(false);
  });

  it('honours the enforceLevelCap switch — never blocks when the cap is off', () => {
    const r = ok(engine().fuse(['m2', 'l1'], ctx({ enforceLevelCap: false, protagonistLevel: 1 })));
    expect(r.blockedByLevel).toBe(false);
  });
});

describe('FusionEngine.fuse — invalid ingredients (§4.7.1)', () => {
  it('rejects a party persona as material', () => {
    expect(engine().fuse(['pt1', 'm2'], ctx())).toMatchObject({ ok: false, code: 'party-ingredient' });
  });

  it('rejects an unknown persona and a lone parent', () => {
    expect(engine().fuse(['nope', 'm2'], ctx())).toMatchObject({ ok: false, code: 'unknown-persona' });
    expect(engine().fuse(['m2'], ctx())).toMatchObject({ ok: false, code: 'too-few-parents' });
  });
});

describe('FusionEngine — unlock filtering', () => {
  it('excludes a disabled-unlock persona from the result list', () => {
    const gated = PERSONAS.map((p) =>
      p.id === 'd2' ? { ...p, unlock: { group: 'dlc' as const, condition: 'DLC' } } : p,
    );
    const eng = new FusionEngine({ ...DATA, personas: gated });
    // With DLC off, d2 is gone; m2+l1 target 7 now selects the next result, d3.
    const r = ok(eng.fuse(['m2', 'l1'], ctx({ unlockGroups: { story: true, confidant: true, dlc: false } })));
    expect(r.resultId).toBe('d3');
  });
});

describe('FusionEngine.inheritableSkills (§6.5, task 37 integration)', () => {
  it('pools a parent’s native skills and attaches eligibility, dropping unique', () => {
    const list = engine().inheritableSkills(['m2'], 'd2', ctx());
    const byId = new Map(list.map((e) => [e.skillId, e]));
    // m2 knows agi (innate), bufu (lvl5 ≤ 11), megido (innate); tarukaja is lvl20 > base.
    expect(new Set(byId.keys())).toEqual(new Set(['agi', 'bufu', 'megido']));
    expect(byId.get('agi')!.eligible).toBe(true);
    expect(byId.get('megido')).toMatchObject({ eligible: false, reason: 'unique' });
  });

  it('uses a registered parent’s recorded skills instead of the native set', () => {
    const compendium = new Map<PersonaId, CompendiumEntry>([
      ['m2', { personaId: 'm2', level: 40, skillIds: ['tarukaja'], traitId: null }],
    ]);
    const list = engine().inheritableSkills(['m2'], 'd2', ctx({ compendium }));
    expect(list.map((e) => e.skillId)).toEqual(['tarukaja']);
  });
});

describe('FusionEngine.itemize / summonCost (§6.7, §6.8)', () => {
  it('returns the normal or alarm card, and null for an unknown persona', () => {
    const eng = engine();
    expect(eng.itemize('m2', false)).toBe('agi');
    expect(eng.itemize('m2', true)).toBe('bufu');
    expect(eng.itemize('nope', false)).toBeNull();
  });

  it('computes re-summon cost over base stats', () => {
    // STATS sum = 25 → 2000 + 625 = 2625.
    expect(engine().summonCost('m2')).toBe(2625);
    expect(Number.isNaN(engine().summonCost('nope'))).toBe(true);
  });
});

describe('FusionEngine.recipesFor — reverse fusion (§4.7.2, task 39)', () => {
  it('lists the advanced recipe for a special target', () => {
    const recipes = engine().recipesFor('sp1', ctx());
    const advanced = recipes.filter((r) => r.path === 'advanced');
    expect(advanced).toHaveLength(1);
    expect([...advanced[0].ingredientIds].sort()).toEqual(['l2', 'm2']);
  });

  it('finds treasure-demon pairings that reach the target', () => {
    // tr1 + m2 → m3 (offset +1). tr2 + m1 → m3 (offset +2, index 0→2).
    const treasure = engine()
      .recipesFor('m3', ctx())
      .filter((r) => r.path === 'treasure')
      .map((r) => [...r.ingredientIds].sort().join('+'));
    expect(treasure).toContain('m2+tr1');
  });

  it('finds normal pairs and memoises the result', () => {
    const eng = engine();
    const first = eng.recipesFor('d2', ctx());
    // m2 + l1 → d2 via different-arcana; should appear as a normal recipe.
    expect(
      first.some(
        (r) => r.path === 'different-arcana' && [...r.ingredientIds].sort().join('+') === 'l1+m2',
      ),
    ).toBe(true);
    expect(eng.recipesFor('d2', ctx())).toBe(first); // same array reference (memoised)
  });

  it('returns nothing for an un-fusable target', () => {
    expect(engine().recipesFor('pt1', ctx())).toEqual([]);
  });
});
