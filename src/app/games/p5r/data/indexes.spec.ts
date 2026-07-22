import type { Affinity, ElementId, Persona } from '../model';
import { ELEMENT_ORDER } from '../model/ids';
import {
  buildDropSources,
  buildIngredientsByArcana,
  buildInvertedSpecials,
  buildResultsByArcana,
  buildSkillLearnedBy,
} from './indexes';

function affinities(over: Partial<Record<ElementId, Affinity>> = {}): Record<ElementId, Affinity> {
  const base = {} as Record<ElementId, Affinity>;
  for (const e of ELEMENT_ORDER) base[e] = 'neutral';
  return { ...base, ...over };
}

const ZERO = { strength: 1, magic: 1, endurance: 1, agility: 1, luck: 1 };

function persona(over: Partial<Persona> & Pick<Persona, 'id' | 'arcana' | 'level'>): Persona {
  return {
    name: over.id,
    inheritType: 'none',
    traitId: null,
    stats: ZERO,
    growth: ZERO,
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

const ALL_ON = { story: true, confidant: true, dlc: true } as const;
const DLC_OFF = { story: true, confidant: true, dlc: false } as const;

describe('buildResultsByArcana', () => {
  const personas: Persona[] = [
    persona({ id: 'high-pixie', arcana: 'lovers', level: 20 }),
    persona({ id: 'pixie', arcana: 'lovers', level: 2 }),
    persona({ id: 'arsene', arcana: 'fool', level: 1, kind: 'party' }),
    persona({ id: 'alice', arcana: 'death', level: 60, kind: 'special' }),
    persona({ id: 'regent', arcana: 'empress', level: 30, kind: 'treasure' }),
    persona({
      id: 'ariadne',
      arcana: 'fortune',
      level: 40,
      unlock: { group: 'dlc', condition: 'Ariadne Set DLC' },
    }),
  ];

  it('keeps only normal personas, grouped by arcana, level-ascending', () => {
    const map = buildResultsByArcana(personas, ALL_ON);
    expect(map.get('lovers')!.map((p) => p.id)).toEqual(['pixie', 'high-pixie']);
    // party, special and treasure kinds are excluded entirely.
    expect(map.get('fool')).toEqual([]);
    expect(map.get('death')).toEqual([]);
    expect(map.get('empress')).toEqual([]);
  });

  it('drops a DLC persona when the DLC group is off, restores it when on', () => {
    expect(buildResultsByArcana(personas, ALL_ON).get('fortune')!.map((p) => p.id)).toEqual([
      'ariadne',
    ]);
    expect(buildResultsByArcana(personas, DLC_OFF).get('fortune')).toEqual([]);
  });
});

describe('buildIngredientsByArcana', () => {
  it('excludes treasure demons from the ingredient pool', () => {
    const personas: Persona[] = [
      persona({ id: 'jack-frost', arcana: 'magician', level: 11 }),
      persona({ id: 'queens-necklace', arcana: 'empress', level: 25, kind: 'treasure' }),
    ];
    const map = buildIngredientsByArcana(personas, ALL_ON);
    expect(map.get('magician')!.map((p) => p.id)).toEqual(['jack-frost']);
    expect(map.get('empress')).toEqual([]);
  });
});

describe('buildSkillLearnedBy', () => {
  it('inverts learn-sets, preserving how each persona learns the skill', () => {
    const personas: Persona[] = [
      persona({
        id: 'jack-frost',
        arcana: 'magician',
        level: 11,
        learnedSkills: [
          { skillId: 'bufu', kind: 'innate', order: 1 },
          { skillId: 'mabufu', kind: 'level', level: 14 },
        ],
      }),
      persona({
        id: 'pixie',
        arcana: 'lovers',
        level: 2,
        learnedSkills: [{ skillId: 'bufu', kind: 'level', level: 5 }],
      }),
    ];
    const map = buildSkillLearnedBy(personas);
    expect(map.get('bufu')).toEqual([
      { personaId: 'jack-frost', kind: 'innate', order: 1 },
      { personaId: 'pixie', kind: 'level', level: 5 },
    ]);
    expect(map.get('mabufu')).toEqual([{ personaId: 'jack-frost', kind: 'level', level: 14 }]);
  });
});

describe('buildDropSources', () => {
  it('inverts material and armour drops into name → shadow ids', () => {
    const shadows = [
      { id: 's1', drops: { material: 'Ambrosia', armor: 'Cheap Bangle', cardSkillId: null, items: [] } },
      { id: 's2', drops: { material: 'Ambrosia', armor: null, cardSkillId: null, items: [] } },
    ] as unknown as Parameters<typeof buildDropSources>[0];
    const map = buildDropSources(shadows);
    expect(map.get('Ambrosia')).toEqual(['s1', 's2']);
    expect(map.get('Cheap Bangle')).toEqual(['s1']);
  });
});

describe('buildInvertedSpecials', () => {
  it('maps each ingredient to the recipes that use it', () => {
    const recipes = {
      recipes: [
        { resultId: 'black-frost', ingredientIds: ['jack-frost', 'king-frost', 'jack-o-lantern'] },
        { resultId: 'alice', ingredientIds: ['belial', 'nebiros'] },
      ],
      treasureIds: [],
    };
    const map = buildInvertedSpecials(recipes);
    expect(map.get('jack-frost')).toEqual(['black-frost']);
    expect(map.get('belial')).toEqual(['alice']);
    expect(map.has('king-frost')).toBe(true);
  });
});
