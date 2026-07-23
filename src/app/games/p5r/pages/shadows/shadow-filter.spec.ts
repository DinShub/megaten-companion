import { convertToParamMap } from '@angular/router';

import type { Affinity, AilmentId, ElementId, Shadow } from '../../model';
import { AILMENT_ORDER, ELEMENT_ORDER } from '../../model/ids';
import {
  defaultShadowFilter,
  filterShadows,
  isShadowFilterActive,
  parseShadowFilter,
  type ShadowFilter,
  serializeShadowFilter,
  sortShadows,
} from './shadow-filter';

function affinities(over: Partial<Record<ElementId, Affinity>> = {}): Record<ElementId, Affinity> {
  const base = {} as Record<ElementId, Affinity>;
  for (const e of ELEMENT_ORDER) base[e] = 'neutral';
  return { ...base, ...over };
}

function noAilments(): Record<AilmentId, boolean> {
  const base = {} as Record<AilmentId, boolean>;
  for (const a of AILMENT_ORDER) base[a] = false;
  return base;
}

const S = { strength: 10, magic: 10, endurance: 10, agility: 10, luck: 10 };

function shadow(over: Partial<Shadow> & Pick<Shadow, 'id' | 'arcana' | 'level'>): Shadow {
  return {
    name: over.id,
    hp: 100,
    sp: 50,
    stats: S,
    exp: 100,
    yen: 100,
    affinities: affinities(),
    ailmentResists: noAilments(),
    skillIds: [],
    drops: { material: null, armor: null, cardSkillId: null, items: [] },
    areas: [],
    kind: 'shadow',
    personaId: null,
    ...over,
  } as Shadow;
}

const mob = shadow({ id: 'shadow-pixie', name: 'Pixie', arcana: 'lovers', level: 3, hp: 90, areas: ['Kamoshida 1'], affinities: affinities({ ice: 'weak' }) });
const bossA = shadow({ id: 'shadow-a', name: 'Shadow A', arcana: 'death', level: 40, hp: 3000, kind: 'subboss', request: { name: 'A request', date: '8/1', rank: 'A' } });
const bossB = shadow({ id: 'shadow-b', name: 'Shadow B', arcana: 'moon', level: 55, hp: 5000, kind: 'subboss', request: { name: 'B request', date: '9/1', rank: 'B' } });

const ALL = [mob, bossA, bossB];

function withFilter(over: Partial<ShadowFilter>): ShadowFilter {
  return { ...defaultShadowFilter('level'), ...over };
}

describe('shadow filter', () => {
  it('matches text, arcana and area', () => {
    expect(filterShadows(ALL, withFilter({ search: 'pixie' })).map((s) => s.id)).toEqual(['shadow-pixie']);
    expect(filterShadows(ALL, withFilter({ arcana: ['moon'] })).map((s) => s.id)).toEqual(['shadow-b']);
    expect(filterShadows(ALL, withFilter({ area: ['Kamoshida 1'] })).map((s) => s.id)).toEqual(['shadow-pixie']);
  });

  it('filters by level range and affinity', () => {
    expect(filterShadows(ALL, withFilter({ levelMin: 41 })).map((s) => s.id)).toEqual(['shadow-b']);
    expect(filterShadows(ALL, withFilter({ affinityRelation: 'weak', affinityElement: 'ice' })).map((s) => s.id)).toEqual(['shadow-pixie']);
  });

  it('filters sub-bosses by Mementos request rank', () => {
    expect(filterShadows(ALL, withFilter({ rank: ['A'] })).map((s) => s.id)).toEqual(['shadow-a']);
    expect(filterShadows(ALL, withFilter({ rank: ['A', 'B'] })).map((s) => s.id).sort()).toEqual(['shadow-a', 'shadow-b']);
  });

  it('sorts by level, hp and rank', () => {
    expect(sortShadows(ALL, withFilter({ sort: 'hp', dir: 'desc' })).map((s) => s.id)).toEqual(['shadow-b', 'shadow-a', 'shadow-pixie']);
    // rankless shadow sorts last on a rank sort.
    expect(sortShadows(ALL, withFilter({ sort: 'rank', dir: 'asc' })).map((s) => s.id)).toEqual(['shadow-a', 'shadow-b', 'shadow-pixie']);
  });

  it('round-trips through the URL query string', () => {
    const filter = withFilter({
      search: 'sha',
      arcana: ['death'],
      area: ['Kamoshida 1'],
      levelMin: 10,
      levelMax: 60,
      affinityRelation: 'resist',
      affinityElement: 'fire',
      rank: ['A', 'B'],
      sort: 'hp',
      dir: 'desc',
    });
    const params = serializeShadowFilter(filter, 'level');
    const nonNull: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) if (v !== null) nonNull[k] = v;
    expect(parseShadowFilter(convertToParamMap(nonNull), 'level')).toEqual(filter);
    expect(isShadowFilterActive(defaultShadowFilter('level'))).toBe(false);
  });
});
