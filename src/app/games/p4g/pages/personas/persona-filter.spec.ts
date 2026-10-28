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
  phys: 'neutral', fire: 'neutral', ice: 'neutral', elec: 'neutral',
  wind: 'neutral', light: 'neutral', dark: 'neutral', almighty: 'neutral',
} as const;

function persona(over: Partial<Persona> & Pick<Persona, 'id' | 'name' | 'arcana' | 'level'>): Persona {
  return {
    inheritType: 'phys',
    stats: { strength: 3, magic: 3, endurance: 3, agility: 3, luck: 3 },
    affinities: NEUTRAL,
    learnedSkills: [],
    kind: 'normal',
    unlock: null,
    ...over,
  };
}

const PIXIE = persona({ id: 'pixie', name: 'Pixie', arcana: 'magician', level: 2, inheritType: 'recovery', affinities: { ...NEUTRAL, fire: 'weak', wind: 'resist' } });
const JACK = persona({ id: 'jack-frost', name: 'Jack Frost', arcana: 'magician', level: 16, inheritType: 'ice', affinities: { ...NEUTRAL, fire: 'weak', ice: 'null' } });
const IZANAGI = persona({ id: 'izanagi', name: 'Izanagi', arcana: 'fool', level: 1, inheritType: 'elec' });
const KAGUYA = persona({ id: 'kaguya', name: 'Kaguya', arcana: 'aeon', level: 74, inheritType: 'light', unlock: { group: 'social-link', condition: 'Aeon Rank 10' } });
const ALICE = persona({ id: 'alice', name: 'Alice', arcana: 'death', level: 72, inheritType: 'dark', kind: 'special' });
const ALL = [ALICE, JACK, KAGUYA, PIXIE, IZANAGI];

const f = (over: Partial<PersonaFilter>): PersonaFilter => ({ ...DEFAULT_PERSONA_FILTER, ...over });
const ids = (list: readonly Persona[]) => list.map((d) => d.id);

describe('persona filter', () => {
  it('matches name or arcana text', () => {
    expect(ids(filterPersonas(ALL, f({ search: 'frost' })))).toEqual(['jack-frost']);
    expect(ids(filterPersonas(ALL, f({ search: 'magician' }))).sort()).toEqual(['jack-frost', 'pixie']);
  });

  it('filters by arcana and by kind or unlock group', () => {
    expect(ids(filterPersonas(ALL, f({ arcana: ['fool'] })))).toEqual(['izanagi']);
    expect(ids(filterPersonas(ALL, f({ availability: ['special'] })))).toEqual(['alice']);
    expect(ids(filterPersonas(ALL, f({ availability: ['social-link'] })))).toEqual(['kaguya']);
  });

  it('keeps personas of any chosen inheritance type', () => {
    expect(ids(filterPersonas(ALL, f({ inherits: ['ice'] })))).toEqual(['jack-frost']);
    expect(ids(filterPersonas(ALL, f({ inherits: ['ice', 'light'] }))).sort()).toEqual(['jack-frost', 'kaguya']);
  });

  it('filters by affinity relation, optionally on one element', () => {
    expect(ids(filterPersonas(ALL, f({ affinityRelation: 'null' })))).toEqual(['jack-frost']);
    expect(ids(filterPersonas(ALL, f({ affinityRelation: 'resist', affinityElement: 'wind' })))).toEqual(['pixie']);
    expect(ids(filterPersonas(ALL, f({ affinityRelation: 'resist', affinityElement: 'fire' })))).toEqual([]);
  });

  it('restricts to owned personas', () => {
    expect(ids(filterPersonas(ALL, f({ owned: true }), new Set(['pixie'])))).toEqual(['pixie']);
  });

  it('sorts by arcana in compendium order, then level', () => {
    expect(ids(sortPersonas(ALL, f({ sort: 'arcana' })))).toEqual(['izanagi', 'pixie', 'jack-frost', 'alice', 'kaguya']);
    expect(ids(sortPersonas(ALL, f({ sort: 'level', dir: 'desc' })))).toEqual(['kaguya', 'alice', 'jack-frost', 'pixie', 'izanagi']);
  });

  it('round-trips through the URL and drops defaults', () => {
    const state = f({ search: 'pix', arcana: ['magician', 'fool'], inherits: ['ice'], levelMin: 3, affinityRelation: 'weak', affinityElement: 'fire', owned: true, sort: 'name', dir: 'desc' });
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
