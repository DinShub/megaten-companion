import type { ParamMap } from '@angular/router';

import type { Skill } from '../../model';
import { parseInt10, parseList, serializeList } from '../../../../shared/url-query';

/**
 * Skill-list filter state and pure apply/serialize functions (§4.3). Extracted
 * from the component so filter behaviour and URL round-tripping unit-test without
 * a DOM. The "known by a persona I own" filter lands in Phase 4 with the
 * compendium store (task 30).
 */
export type SkillSortKey = 'name' | 'element' | 'rank' | 'cost' | 'target';
export type SortDir = 'asc' | 'desc';

export interface SkillFilter {
  readonly search: string;
  readonly element: readonly string[];
  readonly costType: readonly string[];
  readonly costMin: number | null;
  readonly costMax: number | null;
  readonly target: readonly string[];
  /** Tokens: `inheritable`, `unique`. */
  readonly inheritance: readonly string[];
  readonly hasCard: boolean;
  readonly sort: SkillSortKey;
  readonly dir: SortDir;
}

export const DEFAULT_SKILL_FILTER: SkillFilter = {
  search: '',
  element: [],
  costType: [],
  costMin: null,
  costMax: null,
  target: [],
  inheritance: [],
  hasCard: false,
  sort: 'name',
  dir: 'asc',
};

const SORT_KEYS = new Set<SkillSortKey>(['name', 'element', 'rank', 'cost', 'target']);

/** The cost-type token used by the filter: the type, or `none` for no cost. */
export function costToken(skill: Skill): string {
  return skill.cost ? skill.cost.type : 'none';
}

function matchesText(skill: Skill, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q);
}

function matchesInheritance(skill: Skill, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return true;
  const inheritable = skill.inheritElement !== null && !skill.unique;
  return (tokens.includes('inheritable') && inheritable) || (tokens.includes('unique') && skill.unique);
}

function matchesCostRange(skill: Skill, min: number | null, max: number | null): boolean {
  if (min === null && max === null) return true;
  if (!skill.cost) return false; // filtering by cost excludes cost-less skills
  return (min === null || skill.cost.value >= min) && (max === null || skill.cost.value <= max);
}

export function filterSkills(skills: readonly Skill[], f: SkillFilter): Skill[] {
  return skills.filter(
    (s) =>
      matchesText(s, f.search) &&
      (f.element.length === 0 || f.element.includes(s.element)) &&
      (f.costType.length === 0 || f.costType.includes(costToken(s))) &&
      matchesCostRange(s, f.costMin, f.costMax) &&
      (f.target.length === 0 || f.target.includes(s.target)) &&
      matchesInheritance(s, f.inheritance) &&
      (!f.hasCard || s.cardSources.length > 0),
  );
}

function sortValue(skill: Skill, key: SkillSortKey): string | number {
  switch (key) {
    case 'name':
      return skill.name;
    case 'element':
      return skill.element;
    case 'rank':
      return skill.rank;
    case 'target':
      return skill.target;
    case 'cost':
      // Cost-less skills sort last in ascending order.
      return skill.cost ? skill.cost.value : Number.POSITIVE_INFINITY;
  }
}

export function sortSkills(skills: readonly Skill[], f: SkillFilter): Skill[] {
  const sign = f.dir === 'desc' ? -1 : 1;
  return [...skills].sort((a, b) => {
    const av = sortValue(a, f.sort);
    const bv = sortValue(b, f.sort);
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return cmp !== 0 ? sign * cmp : a.name.localeCompare(b.name);
  });
}

// ---- URL serialization (§4.3) -------------------------------------------

export function parseSkillFilter(params: ParamMap): SkillFilter {
  const sort = params.get('sort');
  return {
    search: params.get('q') ?? '',
    element: parseList(params, 'el'),
    costType: parseList(params, 'cost'),
    costMin: parseInt10(params, 'cmin'),
    costMax: parseInt10(params, 'cmax'),
    target: parseList(params, 'target'),
    inheritance: parseList(params, 'inh'),
    hasCard: params.get('card') === '1',
    sort: sort && SORT_KEYS.has(sort as SkillSortKey) ? (sort as SkillSortKey) : 'name',
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
  };
}

export function serializeSkillFilter(f: SkillFilter): Record<string, string | null> {
  return {
    q: f.search || null,
    el: serializeList(f.element),
    cost: serializeList(f.costType),
    cmin: f.costMin === null ? null : String(f.costMin),
    cmax: f.costMax === null ? null : String(f.costMax),
    target: serializeList(f.target),
    inh: serializeList(f.inheritance),
    card: f.hasCard ? '1' : null,
    sort: f.sort === 'name' ? null : f.sort,
    dir: f.dir === 'asc' ? null : f.dir,
  };
}

export function isSkillFilterActive(f: SkillFilter): boolean {
  return (
    f.search !== '' ||
    f.element.length > 0 ||
    f.costType.length > 0 ||
    f.costMin !== null ||
    f.costMax !== null ||
    f.target.length > 0 ||
    f.inheritance.length > 0 ||
    f.hasCard
  );
}
