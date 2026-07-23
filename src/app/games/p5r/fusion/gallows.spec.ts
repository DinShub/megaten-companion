import type { InheritMatrix, Persona, Skill } from '../model';
import type { CompendiumEntry, PersonaId, SkillElementId, Stats } from '../model';
import { FusionEngine } from './engine';
import { planGallows } from './gallows';

/** `engine.gallows` takes just the compendium map now — the empty default. */
const NO_COMPENDIUM: ReadonlyMap<PersonaId, CompendiumEntry> = new Map();

// ---- fixtures -----------------------------------------------------------

const STATS: Stats = { strength: 5, magic: 5, endurance: 5, agility: 5, luck: 5 };

function persona(over: Partial<Persona> & Pick<Persona, 'id' | 'arcana' | 'level'>): Persona {
  return {
    name: over.id,
    inheritType: 'almighty',
    traitId: null,
    stats: STATS,
    growth: STATS,
    maxStats: null,
    affinities: {} as Persona['affinities'],
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

// fire inherits fire but not ice (the §6.5 opposing-element block); almighty all.
const FIRE_ROW = {
  phys: true, gun: true, fire: true, ice: false, elec: true, wind: true,
  psy: true, nuke: true, bless: true, curse: true, ailment: true, healing: true,
};
const ALL_ROW = { ...FIRE_ROW, ice: true };
const MATRIX = { fire: FIRE_ROW, almighty: ALL_ROW } as unknown as InheritMatrix;

const INCUBUS = persona({ id: 'd2', arcana: 'devil', level: 27, inheritType: 'fire' });
const JACK_FROST = persona({
  id: 'm2',
  arcana: 'magician',
  level: 11,
  learnedSkills: [
    { skillId: 'agi', kind: 'innate', order: 1 },
    { skillId: 'bufu', kind: 'level', level: 5 }, // ≤ base 11 → native
    { skillId: 'megido', kind: 'innate', order: 2 },
    { skillId: 'tarukaja', kind: 'level', level: 20 }, // above base → not native
  ],
});

const SKILLS = [
  skill({ id: 'agi', element: 'fire', inheritElement: 'fire' }),
  skill({ id: 'bufu', element: 'ice', inheritElement: 'ice' }),
  skill({ id: 'megido', element: 'almighty', inheritElement: null, unique: true }),
  skill({ id: 'tarukaja', element: 'support', inheritElement: null }),
];

const DATA = {
  personas: [INCUBUS, JACK_FROST],
  skills: SKILLS,
  fusionChart: { grid: {} as never },
  advancedRecipes: { recipes: [], treasureIds: [] },
  elementChart: { offsets: {} as never },
  inheritMatrix: MATRIX,
};

function engine(): FusionEngine {
  return new FusionEngine(DATA);
}

// ---- pure planner -------------------------------------------------------

describe('planGallows (§6.6, task 54)', () => {
  it('marks an inheritable skill eligible and an opposing-element one blocked', () => {
    const plan = planGallows(
      MATRIX,
      INCUBUS,
      'm2',
      [SKILLS[0], SKILLS[1]], // agi (fire), bufu (ice) → Incubus is fire-type
      new Set(),
    );
    const agi = plan.skills.find((s) => s.skillId === 'agi');
    const bufu = plan.skills.find((s) => s.skillId === 'bufu');
    expect(agi?.eligible).toBe(true);
    expect(bufu?.eligible).toBe(false);
    expect(bufu?.reason).toBe('blocked-element');
    expect(bufu?.blockingElement).toBe('ice');
  });

  it('blocks a unique skill regardless of element (§6.5)', () => {
    const plan = planGallows(MATRIX, INCUBUS, 'm2', [SKILLS[2]], new Set());
    expect(plan.skills[0]).toMatchObject({ eligible: false, reason: 'unique' });
  });

  it('reports a skill the target already knows as a no-op, not (in)eligible', () => {
    // agi would be eligible, but the target already carries it.
    const plan = planGallows(MATRIX, INCUBUS, 'm2', [SKILLS[0]], new Set(['agi']));
    expect(plan.skills[0]).toMatchObject({ eligible: false, reason: 'already-known' });
  });

  it('counts free slots as capacity minus the target’s current skills', () => {
    expect(planGallows(MATRIX, INCUBUS, 'm2', [], new Set()).freeSlots).toBe(8);
    expect(planGallows(MATRIX, INCUBUS, 'm2', [], new Set(['a', 'b', 'c'])).freeSlots).toBe(5);
    const full = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']); // 9 > 8
    expect(planGallows(MATRIX, INCUBUS, 'm2', [], full).freeSlots).toBe(0);
  });
});

// ---- engine method ------------------------------------------------------

describe('FusionEngine.gallows (§6.6, task 54)', () => {
  it('offers the sacrifice’s native skills with per-skill verdicts for the target', () => {
    // Jack Frost → Incubus (fire). Native: agi (fire✓), bufu (ice✗), megido (unique✗).
    // tarukaja is learned above base level, so it is not offered.
    const plan = engine().gallows('m2', 'd2', NO_COMPENDIUM)!;
    expect(plan.sacrificeId).toBe('m2');
    expect(plan.targetId).toBe('d2');
    expect(plan.freeSlots).toBe(8);
    const byId = new Map(plan.skills.map((s) => [s.skillId, s]));
    expect(byId.get('agi')?.eligible).toBe(true);
    expect(byId.get('bufu')).toMatchObject({ eligible: false, reason: 'blocked-element' });
    expect(byId.get('megido')).toMatchObject({ eligible: false, reason: 'unique' });
    expect(byId.has('tarukaja')).toBe(false);
  });

  it('uses the target’s registered skills for the free-slot count and already-known check', () => {
    const compendium = new Map<PersonaId, CompendiumEntry>([
      ['d2', { personaId: 'd2', level: 27, skillIds: ['agi', 'x1', 'x2'], traitId: null }],
    ]);
    const plan = engine().gallows('m2', 'd2', compendium)!;
    expect(plan.freeSlots).toBe(5); // 8 − 3 registered
    expect(plan.skills.find((s) => s.skillId === 'agi')).toMatchObject({
      eligible: false,
      reason: 'already-known',
    });
  });

  it('uses the sacrifice’s registered skills when it is in the compendium', () => {
    const compendium = new Map<PersonaId, CompendiumEntry>([
      ['m2', { personaId: 'm2', level: 40, skillIds: ['tarukaja'], traitId: null }],
    ]);
    const plan = engine().gallows('m2', 'd2', compendium)!;
    // Only the one registered skill is offered, not the native learn-set.
    expect(plan.skills.map((s) => s.skillId)).toEqual(['tarukaja']);
    expect(plan.skills[0].eligible).toBe(true); // support skill, not element-gated
  });

  it('returns null for an unknown persona, or a self-sacrifice (§1.1)', () => {
    expect(engine().gallows('nope', 'd2', NO_COMPENDIUM)).toBeNull();
    expect(engine().gallows('m2', 'nope', NO_COMPENDIUM)).toBeNull();
    // Sacrificing a persona into itself is a domain invalid, owned by the engine.
    expect(engine().gallows('m2', 'm2', NO_COMPENDIUM)).toBeNull();
  });
});
