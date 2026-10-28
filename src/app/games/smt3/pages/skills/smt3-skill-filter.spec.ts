import { convertToParamMap } from '@angular/router';

import type { Skill } from '../../model';
import {
  DEFAULT_SKILL_FILTER,
  filterSkills,
  inheritToken,
  parseSkillFilter,
  serializeSkillFilter,
  sortSkills,
} from './smt3-skill-filter';

function skill(over: Partial<Skill> & Pick<Skill, 'id' | 'name' | 'element'>): Skill {
  return { inheritCategory: null, cost: null, target: '1 foe', description: '', rank: 1, unique: false, power: null, hits: null, ...over };
}

const AGI = skill({ id: 'agi', name: 'Agi', element: 'fire', rank: 1, cost: { type: 'mp', value: 3 }, description: '37 pwr' });
const AGIDYNE = skill({ id: 'agidyne', name: 'Agidyne', element: 'fire', rank: 7, cost: { type: 'mp', value: 10 } });
const LUNGE = skill({ id: 'lunge', name: 'Lunge', element: 'phys', inheritCategory: 'thrust', cost: { type: 'hp-percent', value: 10 } });
const FREIKUGEL = skill({ id: 'freikugel', name: 'Freikugel', element: 'almighty', rank: 99, unique: true });
const ALL = [FREIKUGEL, AGIDYNE, LUNGE, AGI];

describe('skill filter', () => {
  it('classifies inheritability', () => {
    expect([AGI, LUNGE, FREIKUGEL].map(inheritToken)).toEqual(['open', 'gated', 'unique']);
  });

  it('filters by text (name or effect), element and inheritability', () => {
    expect(filterSkills(ALL, { ...DEFAULT_SKILL_FILTER, search: '37 pwr' }).map((s) => s.id)).toEqual(['agi']);
    expect(filterSkills(ALL, { ...DEFAULT_SKILL_FILTER, elements: ['fire'] }).map((s) => s.id)).toEqual(['agidyne', 'agi']);
    expect(filterSkills(ALL, { ...DEFAULT_SKILL_FILTER, inherit: ['gated', 'unique'] }).map((s) => s.id)).toEqual(['freikugel', 'lunge']);
  });

  it('sorts by element order then rank by default, and costs MP before HP', () => {
    expect(sortSkills(ALL, DEFAULT_SKILL_FILTER).map((s) => s.id)).toEqual(['lunge', 'agi', 'agidyne', 'freikugel']);
    expect(sortSkills(ALL, { ...DEFAULT_SKILL_FILTER, sort: 'cost' }).map((s) => s.id)).toEqual(['freikugel', 'agi', 'agidyne', 'lunge']);
  });

  it('round-trips through the URL', () => {
    const state = { search: 'agi', elements: ['fire'], inherit: ['open'], sort: 'cost' as const, dir: 'desc' as const };
    const params = Object.fromEntries(Object.entries(serializeSkillFilter(state)).filter(([, v]) => v !== null)) as Record<string, string>;
    expect(parseSkillFilter(convertToParamMap(params))).toEqual(state);
  });
});
