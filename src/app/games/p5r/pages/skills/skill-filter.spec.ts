import { convertToParamMap } from '@angular/router';

import type { Skill } from '../../model';
import {
  costToken,
  DEFAULT_SKILL_FILTER,
  filterSkills,
  isSkillFilterActive,
  parseSkillFilter,
  type SkillFilter,
  serializeSkillFilter,
  sortSkills,
} from './skill-filter';

function skill(over: Partial<Skill> & Pick<Skill, 'id' | 'name' | 'element'>): Skill {
  return {
    inheritElement: null,
    cost: null,
    target: '1 foe',
    description: '',
    rank: 1,
    unique: false,
    cardLocations: [],
    cardSources: [],
    ...over,
  } as Skill;
}

const agi = skill({ id: 'agi', name: 'Agi', element: 'fire', inheritElement: 'fire', cost: { type: 'sp', value: 8 }, rank: 1, description: 'Light Fire damage' });
const bufula = skill({ id: 'bufula', name: 'Bufula', element: 'ice', inheritElement: 'ice', cost: { type: 'sp', value: 12 }, rank: 20, cardSources: [{ kind: 'itemization', from: 'jack-frost' }] });
const megatonRaid = skill({ id: 'megaton-raid', name: 'Megaton Raid', element: 'phys', inheritElement: 'phys', cost: { type: 'hp-percent', value: 14 }, target: 'All foes', rank: 40 });
const enduringSoul = skill({ id: 'enduring-soul', name: 'Enduring Soul', element: 'passive', unique: true, rank: 99, target: 'Self', description: 'Revive once with full HP' });

const ALL = [agi, bufula, megatonRaid, enduringSoul];

function withFilter(over: Partial<SkillFilter>): SkillFilter {
  return { ...DEFAULT_SKILL_FILTER, ...over };
}

describe('skill filter', () => {
  it('derives the cost token', () => {
    expect(costToken(agi)).toBe('sp');
    expect(costToken(megatonRaid)).toBe('hp-percent');
    expect(costToken(enduringSoul)).toBe('none');
  });

  it('matches text against name and effect description', () => {
    expect(filterSkills(ALL, withFilter({ search: 'raid' })).map((s) => s.id)).toEqual(['megaton-raid']);
    expect(filterSkills(ALL, withFilter({ search: 'revive' })).map((s) => s.id)).toEqual(['enduring-soul']);
  });

  it('filters by element, cost type and target', () => {
    expect(filterSkills(ALL, withFilter({ element: ['ice'] })).map((s) => s.id)).toEqual(['bufula']);
    expect(filterSkills(ALL, withFilter({ costType: ['hp-percent'] })).map((s) => s.id)).toEqual(['megaton-raid']);
    expect(filterSkills(ALL, withFilter({ costType: ['none'] })).map((s) => s.id)).toEqual(['enduring-soul']);
    expect(filterSkills(ALL, withFilter({ target: ['All foes'] })).map((s) => s.id)).toEqual(['megaton-raid']);
  });

  it('filters by cost range, excluding cost-less skills', () => {
    expect(filterSkills(ALL, withFilter({ costMin: 10 })).map((s) => s.id).sort()).toEqual(['bufula', 'megaton-raid']);
    // enduring-soul has no cost, so a cost range excludes it.
    expect(filterSkills(ALL, withFilter({ costMin: 0 })).map((s) => s.id)).not.toContain('enduring-soul');
  });

  it('filters by inheritance token and card availability', () => {
    expect(filterSkills(ALL, withFilter({ inheritance: ['unique'] })).map((s) => s.id)).toEqual(['enduring-soul']);
    expect(filterSkills(ALL, withFilter({ inheritance: ['inheritable'] })).map((s) => s.id).sort()).toEqual(['agi', 'bufula', 'megaton-raid']);
    expect(filterSkills(ALL, withFilter({ hasCard: true })).map((s) => s.id)).toEqual(['bufula']);
  });

  it('sorts by rank and by cost, cost-less last', () => {
    expect(sortSkills(ALL, withFilter({ sort: 'rank', dir: 'asc' })).map((s) => s.id)).toEqual(['agi', 'bufula', 'megaton-raid', 'enduring-soul']);
    expect(sortSkills(ALL, withFilter({ sort: 'cost', dir: 'asc' })).map((s) => s.id)).toEqual(['agi', 'bufula', 'megaton-raid', 'enduring-soul']);
  });

  it('round-trips through the URL query string', () => {
    const filter = withFilter({
      search: 'ag',
      element: ['fire', 'ice'],
      costType: ['sp'],
      costMin: 5,
      costMax: 50,
      target: ['1 foe'],
      inheritance: ['inheritable'],
      hasCard: true,
      sort: 'rank',
      dir: 'desc',
    });
    const params = serializeSkillFilter(filter);
    const nonNull: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) if (v !== null) nonNull[k] = v;
    expect(parseSkillFilter(convertToParamMap(nonNull))).toEqual(filter);
    expect(isSkillFilterActive(DEFAULT_SKILL_FILTER)).toBe(false);
  });
});
