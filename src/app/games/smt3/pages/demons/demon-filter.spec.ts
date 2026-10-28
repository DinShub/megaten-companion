import { convertToParamMap } from '@angular/router';

import type { Demon } from '../../model';
import {
  DEFAULT_DEMON_FILTER,
  type DemonFilter,
  filterDemons,
  isDemonFilterActive,
  parseDemonFilter,
  serializeDemonFilter,
  sortDemons,
} from './demon-filter';

const NEUTRAL = {
  phys: 'neutral', fire: 'neutral', ice: 'neutral', elec: 'neutral', force: 'neutral',
  expel: 'neutral', death: 'neutral', mind: 'neutral', nerve: 'neutral', curse: 'neutral',
} as const;

function demon(over: Partial<Demon> & Pick<Demon, 'id' | 'name' | 'race' | 'level'>): Demon {
  return {
    stats: { hp: 10, mp: 10, strength: 3, magic: 3, vitality: 3, agility: 3, luck: 3 },
    affinities: NEUTRAL,
    ailments: {},
    inherits: [],
    learnedSkills: [],
    kind: 'normal',
    unlock: null,
    prereq: null,
    evolvesTo: null,
    evolvesFrom: null,
    enemy: null,
    personality: null,
    age: null,
    gender: null,
    ...over,
  };
}

const PIXIE = demon({ id: 'pixie', name: 'Pixie', race: 'fairy', level: 2, inherits: ['wings', 'eye'], affinities: { ...NEUTRAL, elec: 'resist' } });
const JACK = demon({ id: 'jack-frost', name: 'Jack Frost', race: 'fairy', level: 7, affinities: { ...NEUTRAL, fire: 'weak', ice: 'drain' } });
const SHIVA = demon({ id: 'shiva', name: 'Shiva', race: 'fury', level: 95, kind: 'special', inherits: ['wings'] });
const METATRON = demon({ id: 'metatron', name: 'Metatron', race: 'seraph', level: 95, kind: 'special', unlock: { group: 'amala', condition: 'x' } });
const ALL = [SHIVA, JACK, METATRON, PIXIE];

const f = (over: Partial<DemonFilter>): DemonFilter => ({ ...DEFAULT_DEMON_FILTER, ...over });
const ids = (list: readonly Demon[]) => list.map((d) => d.id);

describe('demon filter', () => {
  it('matches name or race text', () => {
    expect(ids(filterDemons(ALL, f({ search: 'frost' })))).toEqual(['jack-frost']);
    expect(ids(filterDemons(ALL, f({ search: 'fairy' }))).sort()).toEqual(['jack-frost', 'pixie']);
  });

  it('filters by race and by kind or unlock group', () => {
    expect(ids(filterDemons(ALL, f({ races: ['fury'] })))).toEqual(['shiva']);
    expect(ids(filterDemons(ALL, f({ availability: ['special'] }))).sort()).toEqual(['metatron', 'shiva']);
    expect(ids(filterDemons(ALL, f({ availability: ['amala'] })))).toEqual(['metatron']);
  });

  it('requires every chosen inherit category', () => {
    expect(ids(filterDemons(ALL, f({ inherits: ['wings'] }))).sort()).toEqual(['pixie', 'shiva']);
    expect(ids(filterDemons(ALL, f({ inherits: ['wings', 'eye'] })))).toEqual(['pixie']);
  });

  it('filters by affinity relation, optionally on one element', () => {
    expect(ids(filterDemons(ALL, f({ affinityRelation: 'drain' })))).toEqual(['jack-frost']);
    expect(ids(filterDemons(ALL, f({ affinityRelation: 'resist', affinityElement: 'elec' })))).toEqual(['pixie']);
    expect(ids(filterDemons(ALL, f({ affinityRelation: 'resist', affinityElement: 'fire' })))).toEqual([]);
  });

  it('restricts to owned demons', () => {
    expect(ids(filterDemons(ALL, f({ owned: true }), new Set(['pixie'])))).toEqual(['pixie']);
  });

  it('sorts by race in compendium order, then level', () => {
    expect(ids(sortDemons(ALL, f({ sort: 'race' })))).toEqual(['shiva', 'pixie', 'jack-frost', 'metatron']);
    expect(ids(sortDemons(ALL, f({ sort: 'level', dir: 'desc' })))).toEqual(['metatron', 'shiva', 'jack-frost', 'pixie']);
  });

  it('round-trips through the URL and drops defaults', () => {
    const state = f({ search: 'pix', races: ['fairy', 'fury'], inherits: ['eye'], levelMin: 3, affinityRelation: 'weak', affinityElement: 'fire', owned: true, sort: 'name', dir: 'desc' });
    const params = Object.fromEntries(Object.entries(serializeDemonFilter(state)).filter(([, v]) => v !== null)) as Record<string, string>;
    expect(parseDemonFilter(convertToParamMap(params))).toEqual(state);
    expect(Object.values(serializeDemonFilter(DEFAULT_DEMON_FILTER)).every((v) => v === null)).toBe(true);
    expect(isDemonFilterActive(DEFAULT_DEMON_FILTER)).toBe(false);
    expect(isDemonFilterActive(state)).toBe(true);
  });

  it('ignores junk in the URL', () => {
    const parsed = parseDemonFilter(convertToParamMap({ aff: 'bogus', affel: 'gun', sort: 'nope' }));
    expect(parsed.affinityRelation).toBeNull();
    expect(parsed.affinityElement).toBeNull();
    expect(parsed.sort).toBe('level');
  });
});
