import { convertToParamMap } from '@angular/router';

import type { Persona } from '../../model';
import {
  DEFAULT_PERSONA_FILTER,
  type PersonaFilter,
  filterPersonas,
  isPersonaFilterActive,
  parsePersonaFilter,
  serializePersonaFilter,
  sortPersonas,
} from './persona-filter';

const NEUTRAL = {
  slash: 'neutral', strike: 'neutral', pierce: 'neutral', fire: 'neutral', ice: 'neutral',
  elec: 'neutral', wind: 'neutral', light: 'neutral', dark: 'neutral', almighty: 'neutral',
} as const;

function persona(over: Partial<Persona> & Pick<Persona, 'id' | 'name' | 'arcana' | 'level'>): Persona {
  return {
    inheritType: 'strikeA',
    stats: { strength: 3, magic: 3, endurance: 3, agility: 3, luck: 3 },
    affinities: NEUTRAL,
    learnedSkills: [],
    kind: 'normal',
    unlock: null,
    heartItem: null,
    ...over,
  };
}

const NEKOMATA = persona({ id: 'nekomata', name: 'Nekomata', arcana: 'magician', level: 3, inheritType: 'windA', affinities: { ...NEUTRAL, elec: 'weak', wind: 'resist' } });
const JACK = persona({ id: 'jack-frost', name: 'Jack Frost', arcana: 'magician', level: 8, inheritType: 'iceA', affinities: { ...NEUTRAL, fire: 'weak', ice: 'null' } });
const ORPHEUS = persona({ id: 'orpheus', name: 'Orpheus', arcana: 'fool', level: 1, inheritType: 'windA' });
const CYBELE = persona({ id: 'cybele', name: 'Cybele', arcana: 'lovers', level: 67, inheritType: 'recovery', unlock: { group: 'social-link', condition: 'Lovers Rank 10' } });
const ALICE = persona({ id: 'alice', name: 'Alice', arcana: 'death', level: 68, inheritType: 'darkA', kind: 'special' });
const ALL = [ALICE, JACK, CYBELE, NEKOMATA, ORPHEUS];

const f = (over: Partial<PersonaFilter>): PersonaFilter => ({ ...DEFAULT_PERSONA_FILTER, ...over });
const ids = (list: readonly Persona[]) => list.map((d) => d.id);

describe('persona filter', () => {
  it('matches name or arcana text', () => {
    expect(ids(filterPersonas(ALL, f({ search: 'frost' })))).toEqual(['jack-frost']);
    expect(ids(filterPersonas(ALL, f({ search: 'magician' }))).sort()).toEqual(['jack-frost', 'nekomata']);
  });

  it('filters by arcana and by kind or unlock group', () => {
    expect(ids(filterPersonas(ALL, f({ arcana: ['fool'] })))).toEqual(['orpheus']);
    expect(ids(filterPersonas(ALL, f({ availability: ['special'] })))).toEqual(['alice']);
    expect(ids(filterPersonas(ALL, f({ availability: ['social-link'] })))).toEqual(['cybele']);
  });

  it('keeps personas of any chosen inheritance type', () => {
    expect(ids(filterPersonas(ALL, f({ inherits: ['iceA'] })))).toEqual(['jack-frost']);
    expect(ids(filterPersonas(ALL, f({ inherits: ['iceA', 'recovery'] }))).sort()).toEqual(['cybele', 'jack-frost']);
  });

  it('filters by affinity relation, optionally on one element', () => {
    expect(ids(filterPersonas(ALL, f({ affinityRelation: 'null' })))).toEqual(['jack-frost']);
    expect(ids(filterPersonas(ALL, f({ affinityRelation: 'resist', affinityElement: 'wind' })))).toEqual(['nekomata']);
    expect(ids(filterPersonas(ALL, f({ affinityRelation: 'resist', affinityElement: 'fire' })))).toEqual([]);
  });

  it('restricts to owned personas', () => {
    expect(ids(filterPersonas(ALL, f({ owned: true }), new Set(['nekomata'])))).toEqual(['nekomata']);
  });

  it('sorts by arcana in compendium order, then level', () => {
    expect(ids(sortPersonas(ALL, f({ sort: 'arcana' })))).toEqual(['orpheus', 'nekomata', 'jack-frost', 'cybele', 'alice']);
    expect(ids(sortPersonas(ALL, f({ sort: 'level', dir: 'desc' })))).toEqual(['alice', 'cybele', 'jack-frost', 'nekomata', 'orpheus']);
  });

  it('round-trips through the URL and drops defaults', () => {
    const state = f({ search: 'nek', arcana: ['magician', 'fool'], inherits: ['iceA'], levelMin: 3, affinityRelation: 'weak', affinityElement: 'fire', owned: true, sort: 'name', dir: 'desc' });
    const params = Object.fromEntries(Object.entries(serializePersonaFilter(state)).filter(([, v]) => v !== null)) as Record<string, string>;
    expect(parsePersonaFilter(convertToParamMap(params))).toEqual(state);
    expect(Object.values(serializePersonaFilter(DEFAULT_PERSONA_FILTER)).every((v) => v === null)).toBe(true);
    expect(isPersonaFilterActive(DEFAULT_PERSONA_FILTER)).toBe(false);
    expect(isPersonaFilterActive(state)).toBe(true);
  });

  it('ignores junk in the URL', () => {
    const parsed = parsePersonaFilter(convertToParamMap({ aff: 'bogus', affel: 'gun', sort: 'nope' }));
    expect(parsed.affinityRelation).toBeNull();
    expect(parsed.affinityElement).toBeNull();
    expect(parsed.sort).toBe('level');
  });
});
