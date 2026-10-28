import type { ParamMap } from '@angular/router';

import { parseList, serializeList } from '../../../../shared/url-query';
import type { Skill } from '../../model';
import { SKILL_ELEMENT_ORDER } from '../../model/ids';

/** Skill-list filter state, its pure application, and its URL mirror. */
export type SkillSortKey = 'name' | 'element' | 'cost' | 'rank' | 'power';
export type SortDir = 'asc' | 'desc';

/** `open` = inheritable by any demon; `gated` = needs a body type; `unique` = never inherited. */
export type InheritToken = 'open' | 'gated' | 'unique';

export interface SkillFilter {
  readonly search: string;
  readonly elements: readonly string[];
  readonly inherit: readonly string[];
  readonly sort: SkillSortKey;
  readonly dir: SortDir;
}

export const DEFAULT_SKILL_FILTER: SkillFilter = { search: '', elements: [], inherit: [], sort: 'element', dir: 'asc' };

const SORT_KEYS = new Set<SkillSortKey>(['name', 'element', 'cost', 'rank', 'power']);
const ELEMENT_INDEX = new Map(SKILL_ELEMENT_ORDER.map((e, i) => [e, i] as const));

export function inheritToken(s: Skill): InheritToken {
  if (s.unique) return 'unique';
  return s.inheritCategory ? 'gated' : 'open';
}

export function filterSkills(skills: readonly Skill[], f: SkillFilter): Skill[] {
  const q = f.search.trim().toLowerCase();
  return skills.filter(
    (s) =>
      (!q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) &&
      (f.elements.length === 0 || f.elements.includes(s.element)) &&
      (f.inherit.length === 0 || f.inherit.includes(inheritToken(s))),
  );
}

function costValue(s: Skill): number {
  if (!s.cost) return -1;
  // HP-percent costs sort after MP costs of any size.
  return s.cost.type === 'mp' ? s.cost.value : 1000 + s.cost.value;
}

function sortValue(s: Skill, key: SkillSortKey): string | number {
  switch (key) {
    case 'name':
      return s.name;
    case 'element':
      return ELEMENT_INDEX.get(s.element) ?? 99;
    case 'cost':
      return costValue(s);
    case 'rank':
      return s.rank;
    case 'power':
      return s.power ?? -1;
  }
}

/** Element sorts by display order, then rank — so tiers read Agi, Agilao, Agidyne. */
export function sortSkills(skills: readonly Skill[], f: SkillFilter): Skill[] {
  const sign = f.dir === 'desc' ? -1 : 1;
  return [...skills].sort((a, b) => {
    const av = sortValue(a, f.sort);
    const bv = sortValue(b, f.sort);
    let cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    if (cmp === 0 && f.sort === 'element') cmp = a.rank - b.rank;
    return cmp !== 0 ? sign * cmp : a.name.localeCompare(b.name);
  });
}

export function parseSkillFilter(params: ParamMap): SkillFilter {
  const sort = params.get('sort');
  return {
    search: params.get('q') ?? '',
    elements: parseList(params, 'el'),
    inherit: parseList(params, 'inh'),
    sort: sort && SORT_KEYS.has(sort as SkillSortKey) ? (sort as SkillSortKey) : 'element',
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
  };
}

export function serializeSkillFilter(f: SkillFilter): Record<string, string | null> {
  return {
    q: f.search || null,
    el: serializeList(f.elements),
    inh: serializeList(f.inherit),
    sort: f.sort === 'element' ? null : f.sort,
    dir: f.dir === 'asc' ? null : f.dir,
  };
}

export function isSkillFilterActive(f: SkillFilter): boolean {
  return f.search !== '' || f.elements.length > 0 || f.inherit.length > 0;
}
