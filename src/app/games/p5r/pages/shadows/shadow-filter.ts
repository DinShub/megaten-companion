import type { ParamMap } from '@angular/router';

import type { Affinity, ElementId, Shadow } from '../../model';
import { parseInt10, parseList, serializeList } from '../../../../shared/url-query';

/**
 * Filter state and pure apply/serialize functions shared by the shadow and
 * sub-boss lists (§4.2). Both lists filter the same fields; the sub-boss list
 * adds a Mementos-rank facet and request columns on top.
 */
export type ShadowSortKey = 'name' | 'arcana' | 'level' | 'hp' | 'sp' | 'exp' | 'yen' | 'rank';
export type SortDir = 'asc' | 'desc';

export interface ShadowFilter {
  readonly search: string;
  readonly arcana: readonly string[];
  readonly area: readonly string[];
  readonly levelMin: number | null;
  readonly levelMax: number | null;
  readonly affinityRelation: Affinity | null;
  readonly affinityElement: ElementId | null;
  /** Sub-boss Mementos request rank (S/A/B/…); ignored by the regular list. */
  readonly rank: readonly string[];
  readonly sort: ShadowSortKey;
  readonly dir: SortDir;
}

export function defaultShadowFilter(sort: ShadowSortKey = 'level'): ShadowFilter {
  return {
    search: '',
    arcana: [],
    area: [],
    levelMin: null,
    levelMax: null,
    affinityRelation: null,
    affinityElement: null,
    rank: [],
    sort,
    dir: 'asc',
  };
}

const AFFINITIES = new Set<Affinity>(['weak', 'neutral', 'resist', 'null', 'repel', 'drain']);
const SORT_KEYS = new Set<ShadowSortKey>(['name', 'arcana', 'level', 'hp', 'sp', 'exp', 'yen', 'rank']);

function matchesText(shadow: Shadow, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return shadow.name.toLowerCase().includes(q) || shadow.arcana.toLowerCase().includes(q);
}

function matchesAffinity(shadow: Shadow, relation: Affinity | null, element: ElementId | null): boolean {
  if (!relation) return true;
  if (element) return shadow.affinities[element] === relation;
  return Object.values(shadow.affinities).some((a) => a === relation);
}

export function filterShadows(shadows: readonly Shadow[], f: ShadowFilter): Shadow[] {
  return shadows.filter(
    (s) =>
      matchesText(s, f.search) &&
      (f.arcana.length === 0 || f.arcana.includes(s.arcana)) &&
      (f.area.length === 0 || s.areas.some((a) => f.area.includes(a))) &&
      (f.levelMin === null || s.level >= f.levelMin) &&
      (f.levelMax === null || s.level <= f.levelMax) &&
      matchesAffinity(s, f.affinityRelation, f.affinityElement) &&
      (f.rank.length === 0 || (s.request != null && f.rank.includes(s.request.rank))),
  );
}

function sortValue(shadow: Shadow, key: ShadowSortKey): string | number {
  switch (key) {
    case 'name':
      return shadow.name;
    case 'arcana':
      return shadow.arcana;
    case 'level':
      return shadow.level;
    case 'hp':
      return shadow.hp;
    case 'sp':
      return shadow.sp;
    case 'exp':
      return shadow.exp;
    case 'yen':
      return shadow.yen;
    case 'rank':
      // Numeric so rankless shadows sort last (ascending) rather than by an
      // unpredictable string sentinel under localeCompare.
      return shadow.request ? shadow.request.rank.charCodeAt(0) : Number.POSITIVE_INFINITY;
  }
}

export function sortShadows(shadows: readonly Shadow[], f: ShadowFilter): Shadow[] {
  const sign = f.dir === 'desc' ? -1 : 1;
  return [...shadows].sort((a, b) => {
    const av = sortValue(a, f.sort);
    const bv = sortValue(b, f.sort);
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return cmp !== 0 ? sign * cmp : a.name.localeCompare(b.name);
  });
}

// ---- URL serialization --------------------------------------------------

export function parseShadowFilter(params: ParamMap, defaultSort: ShadowSortKey): ShadowFilter {
  const relation = params.get('aff');
  const sort = params.get('sort');
  return {
    search: params.get('q') ?? '',
    arcana: parseList(params, 'arcana'),
    area: parseList(params, 'area'),
    levelMin: parseInt10(params, 'lmin'),
    levelMax: parseInt10(params, 'lmax'),
    affinityRelation: relation && AFFINITIES.has(relation as Affinity) ? (relation as Affinity) : null,
    affinityElement: (params.get('affel') as ElementId | null) || null,
    rank: parseList(params, 'rank'),
    sort: sort && SORT_KEYS.has(sort as ShadowSortKey) ? (sort as ShadowSortKey) : defaultSort,
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
  };
}

export function serializeShadowFilter(f: ShadowFilter, defaultSort: ShadowSortKey): Record<string, string | null> {
  return {
    q: f.search || null,
    arcana: serializeList(f.arcana),
    area: serializeList(f.area),
    lmin: f.levelMin === null ? null : String(f.levelMin),
    lmax: f.levelMax === null ? null : String(f.levelMax),
    aff: f.affinityRelation,
    affel: f.affinityRelation ? f.affinityElement : null,
    rank: serializeList(f.rank),
    sort: f.sort === defaultSort ? null : f.sort,
    dir: f.dir === 'asc' ? null : f.dir,
  };
}

export function isShadowFilterActive(f: ShadowFilter): boolean {
  return (
    f.search !== '' ||
    f.arcana.length > 0 ||
    f.area.length > 0 ||
    f.levelMin !== null ||
    f.levelMax !== null ||
    f.affinityRelation !== null ||
    f.rank.length > 0
  );
}
