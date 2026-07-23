import type { Affinity, CompendiumEntry, ElementId, Persona, PersonaId, Stats } from '../model';
import { ELEMENT_ORDER } from '../model/ids';
import { resolvePool } from './pool';
import type { FusionContext } from './types';

const STATS: Stats = { strength: 1, magic: 1, endurance: 1, agility: 1, luck: 1 };

function affinities(): Record<ElementId, Affinity> {
  const base = {} as Record<ElementId, Affinity>;
  for (const e of ELEMENT_ORDER) base[e] = 'neutral';
  return base;
}

function persona(over: Partial<Persona> & Pick<Persona, 'id' | 'level'>): Persona {
  return {
    name: over.id,
    arcana: 'fool',
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

const PERSONAS: Persona[] = [
  persona({ id: 'a1', level: 10 }),
  persona({ id: 'a2', level: 40 }),
  persona({ id: 'a3', level: 8 }),
  persona({ id: 'sp', level: 20, kind: 'special' }),
  persona({ id: 'pt', level: 5, kind: 'party' }),
  persona({ id: 'dlc1', level: 15, unlock: { group: 'dlc', condition: 'DLC' } }),
];

function entry(personaId: PersonaId, level: number): CompendiumEntry {
  return { personaId, level, skillIds: [], traitId: null };
}

function ctx(over: Partial<FusionContext> = {}): FusionContext {
  return {
    pool: 'compendium',
    protagonistLevel: 20,
    enforceLevelCap: true,
    unlockGroups: { story: true, confidant: true, dlc: false },
    alarm: false,
    compendium: new Map(),
    ...over,
  };
}

describe('resolvePool (§6.4, task 31)', () => {
  it('compendium mode keeps only registered, still-usable personas', () => {
    const compendium = new Map([
      ['a1', entry('a1', 30)],
      ['sp', entry('sp', 99)], // special — excluded as material
      ['pt', entry('pt', 5)], // party — excluded
      ['dlc1', entry('dlc1', 50)], // DLC off — excluded
    ]);
    const pool = resolvePool(PERSONAS, ctx({ pool: 'compendium', compendium }));
    expect(pool.members.map((m) => m.personaId)).toEqual(['a1']);
    expect(pool.byId.get('a1')).toEqual({ personaId: 'a1', level: 30, owned: true });
  });

  it('restores a DLC persona when its unlock group is on', () => {
    const compendium = new Map([['dlc1', entry('dlc1', 50)]]);
    const on = resolvePool(
      PERSONAS,
      ctx({ pool: 'compendium', compendium, unlockGroups: { story: true, confidant: true, dlc: true } }),
    );
    expect(on.members.map((m) => m.personaId)).toEqual(['dlc1']);
  });

  it('obtainable mode adds every fusable persona at or below the protagonist level', () => {
    const compendium = new Map([['a1', entry('a1', 30)]]);
    const pool = resolvePool(PERSONAS, ctx({ pool: 'obtainable', protagonistLevel: 20, compendium }));
    const byId = pool.byId;
    // a1 stays owned at its registered level; a3 (base 8) is a fresh unowned seed.
    expect(byId.get('a1')).toEqual({ personaId: 'a1', level: 30, owned: true });
    expect(byId.get('a3')).toEqual({ personaId: 'a3', level: 8, owned: false });
    // a2 (level 40) is above the cap; sp/pt/dlc1 are excluded on kind or unlock.
    expect(byId.has('a2')).toBe(false);
    expect(byId.has('sp')).toBe(false);
    expect(byId.has('pt')).toBe(false);
    expect(byId.has('dlc1')).toBe(false);
  });

  it('obtainable mode admits a DLC persona under the cap when the group is on', () => {
    const pool = resolvePool(
      PERSONAS,
      ctx({
        pool: 'obtainable',
        protagonistLevel: 20,
        unlockGroups: { story: true, confidant: true, dlc: true },
      }),
    );
    expect(pool.byId.get('dlc1')).toEqual({ personaId: 'dlc1', level: 15, owned: false });
  });
});
