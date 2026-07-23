import { convertToParamMap } from '@angular/router';

import type { Affinity, ElementId, Persona } from '../../model';
import { ELEMENT_ORDER } from '../../model/ids';
import {
  DEFAULT_PERSONA_FILTER,
  filterPersonas,
  isPersonaFilterActive,
  parsePersonaFilter,
  type PersonaFilter,
  serializePersonaFilter,
  sortPersonas,
} from './persona-filter';

function affinities(over: Partial<Record<ElementId, Affinity>> = {}): Record<ElementId, Affinity> {
  const base = {} as Record<ElementId, Affinity>;
  for (const e of ELEMENT_ORDER) base[e] = 'neutral';
  return { ...base, ...over };
}

const S = { strength: 10, magic: 10, endurance: 10, agility: 10, luck: 10 };

function persona(over: Partial<Persona> & Pick<Persona, 'id' | 'arcana' | 'level'>): Persona {
  return {
    name: over.id,
    inheritType: 'none',
    traitId: null,
    stats: S,
    growth: S,
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

const pixie = persona({ id: 'pixie', name: 'Pixie', arcana: 'lovers', level: 2, inheritType: 'elec', affinities: affinities({ ice: 'weak', elec: 'drain' }) });
const jack = persona({ id: 'jack-frost', name: 'Jack Frost', arcana: 'fool', level: 11, inheritType: 'ice', affinities: affinities({ fire: 'weak', ice: 'drain' }) });
const alice = persona({ id: 'alice', name: 'Alice', arcana: 'death', level: 55, kind: 'special', inheritType: 'curse', unlock: { group: 'confidant', condition: 'Death R10' } });
const orpheus = persona({ id: 'orpheus', name: 'Orpheus', arcana: 'fool', level: 10, kind: 'party', unlock: { group: 'dlc', condition: 'DLC' } });
const regent = persona({ id: 'regent', name: 'Regent', arcana: 'empress', level: 20, kind: 'treasure' });

const ALL = [pixie, jack, alice, orpheus, regent];

function withFilter(over: Partial<PersonaFilter>): PersonaFilter {
  return { ...DEFAULT_PERSONA_FILTER, ...over };
}

describe('persona filter', () => {
  it('matches text against name and arcana', () => {
    expect(filterPersonas(ALL, withFilter({ search: 'frost' })).map((p) => p.id)).toEqual(['jack-frost']);
    expect(filterPersonas(ALL, withFilter({ search: 'fool' })).map((p) => p.id).sort()).toEqual(['jack-frost', 'orpheus']);
  });

  it('filters by arcana and inherit type', () => {
    expect(filterPersonas(ALL, withFilter({ arcana: ['fool'] })).map((p) => p.id).sort()).toEqual(['jack-frost', 'orpheus']);
    expect(filterPersonas(ALL, withFilter({ inherit: ['ice'] })).map((p) => p.id)).toEqual(['jack-frost']);
  });

  it('filters availability by kind and by unlock group', () => {
    expect(filterPersonas(ALL, withFilter({ availability: ['treasure'] })).map((p) => p.id)).toEqual(['regent']);
    expect(filterPersonas(ALL, withFilter({ availability: ['party'] })).map((p) => p.id)).toEqual(['orpheus']);
    // Unlock-group token matches the persona's unlock.group.
    expect(filterPersonas(ALL, withFilter({ availability: ['dlc'] })).map((p) => p.id)).toEqual(['orpheus']);
    expect(filterPersonas(ALL, withFilter({ availability: ['confidant'] })).map((p) => p.id)).toEqual(['alice']);
    // Union across kind + group tokens.
    expect(filterPersonas(ALL, withFilter({ availability: ['treasure', 'dlc'] })).map((p) => p.id).sort()).toEqual(['orpheus', 'regent']);
  });

  it('filters by level range', () => {
    expect(filterPersonas(ALL, withFilter({ levelMin: 11, levelMax: 30 })).map((p) => p.id).sort()).toEqual(['jack-frost', 'regent']);
  });

  it('filters by affinity relation with and without a specific element', () => {
    expect(filterPersonas(ALL, withFilter({ affinityRelation: 'weak', affinityElement: 'ice' })).map((p) => p.id)).toEqual(['pixie']);
    expect(filterPersonas(ALL, withFilter({ affinityRelation: 'drain' })).map((p) => p.id).sort()).toEqual(['jack-frost', 'pixie']);
  });

  it('sorts by level then name, ascending and descending', () => {
    expect(sortPersonas(ALL, withFilter({ sort: 'level', dir: 'asc' })).map((p) => p.id)).toEqual(['pixie', 'orpheus', 'jack-frost', 'regent', 'alice']);
    expect(sortPersonas(ALL, withFilter({ sort: 'level', dir: 'desc' })).map((p) => p.id)).toEqual(['alice', 'regent', 'jack-frost', 'orpheus', 'pixie']);
  });

  it('filters to the compendium when owned is set (task 30)', () => {
    const ownedIds = new Set(['pixie', 'alice']);
    expect(filterPersonas(ALL, withFilter({ owned: true }), ownedIds).map((p) => p.id).sort()).toEqual(['alice', 'pixie']);
    // Without the owned set the clause matches nothing rather than everything.
    expect(filterPersonas(ALL, withFilter({ owned: true })).length).toBe(0);
    // owned off ignores the set entirely.
    expect(filterPersonas(ALL, withFilter({ owned: false }), ownedIds).length).toBe(ALL.length);
  });

  it('round-trips through the URL query string', () => {
    const filter = withFilter({
      search: 'pix',
      arcana: ['fool', 'lovers'],
      inherit: ['ice'],
      availability: ['treasure', 'dlc'],
      levelMin: 5,
      levelMax: 40,
      affinityRelation: 'weak',
      affinityElement: 'ice',
      sort: 'magic',
      dir: 'desc',
    });
    const params = serializePersonaFilter(filter);
    const nonNull: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) if (v !== null) nonNull[k] = v;
    expect(parsePersonaFilter(convertToParamMap(nonNull))).toEqual(filter);
  });

  it('serializes defaults to an empty query string', () => {
    const params = serializePersonaFilter(DEFAULT_PERSONA_FILTER);
    expect(Object.values(params).every((v) => v === null)).toBe(true);
    expect(isPersonaFilterActive(DEFAULT_PERSONA_FILTER)).toBe(false);
    expect(isPersonaFilterActive(withFilter({ arcana: ['fool'] }))).toBe(true);
  });
});
