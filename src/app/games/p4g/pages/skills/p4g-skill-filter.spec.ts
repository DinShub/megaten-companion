import { convertToParamMap } from '@angular/router';

import type { Skill } from '../../model';
import {
  DEFAULT_SKILL_FILTER,
  filterSkills,
  inheritToken,
  parseSkillFilter,
  serializeSkillFilter,
  sortSkills,
} from './p4g-skill-filter';

function skill(over: Partial<Skill> & Pick<Skill, 'id' | 'name' | 'element'>): Skill {
  return { cost: null, target: '1 foe', description: '', rank: 1, unique: false, cardPersonaId: null, ...over };
}

const AGI = skill({ id: 'agi', name: 'Agi', element: 'fire', rank: 1.5, cost: { type: 'sp', value: 4 }, description: '√40 pwr', cardPersonaId: 'ukobach' });
const AGIDYNE = skill({ id: 'agidyne', name: 'Agidyne', element: 'fire', rank: 5.5, cost: { type: 'sp', value: 12 } });
const CLEAVE = skill({ id: 'cleave', name: 'Cleave', element: 'phys', rank: 1.5, cost: { type: 'hp-percent', value: 5 } });
const OLD_ONE = skill({ id: 'old-one', name: 'Old One', element: 'ailment', rank: 99, unique: true });
const ALL = [OLD_ONE, AGIDYNE, CLEAVE, AGI];

describe('skill filter', () => {
  it('classifies inheritability', () => {
    expect([AGI, OLD_ONE].map(inheritToken)).toEqual(['inheritable', 'unique']);
  });

  it('filters by text (name or effect), element, inheritability and skill card', () => {
    expect(filterSkills(ALL, { ...DEFAULT_SKILL_FILTER, search: '√40' }).map((s) => s.id)).toEqual(['agi']);
    expect(filterSkills(ALL, { ...DEFAULT_SKILL_FILTER, elements: ['fire'] }).map((s) => s.id)).toEqual(['agidyne', 'agi']);
    expect(filterSkills(ALL, { ...DEFAULT_SKILL_FILTER, inherit: ['unique'] }).map((s) => s.id)).toEqual(['old-one']);
    expect(filterSkills(ALL, { ...DEFAULT_SKILL_FILTER, card: true }).map((s) => s.id)).toEqual(['agi']);
  });

  it('sorts by element order then rank by default, and costs SP before HP', () => {
    expect(sortSkills(ALL, DEFAULT_SKILL_FILTER).map((s) => s.id)).toEqual(['cleave', 'agi', 'agidyne', 'old-one']);
    expect(sortSkills(ALL, { ...DEFAULT_SKILL_FILTER, sort: 'cost' }).map((s) => s.id)).toEqual(['old-one', 'agi', 'agidyne', 'cleave']);
  });

  it('round-trips through the URL', () => {
    const state = { search: 'agi', elements: ['fire'], inherit: ['inheritable'], card: true, sort: 'cost' as const, dir: 'desc' as const };
    const params = Object.fromEntries(Object.entries(serializeSkillFilter(state)).filter(([, v]) => v !== null)) as Record<string, string>;
    expect(parseSkillFilter(convertToParamMap(params))).toEqual(state);
  });
});
