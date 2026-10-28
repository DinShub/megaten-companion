import type { ParamMap } from '@angular/router';

import { parseInt10, parseList, serializeList } from '../../../../shared/url-query';
import type { Affinity, Demon, ElementId } from '../../model';
import { ELEMENT_ORDER, RACE_ORDER } from '../../model/ids';

/**
 * Demon-list filter state, the pure functions that apply it, and its URL
 * mirror — kept out of the component so "a filtered URL restores on reload" is
 * a property of tested code, not template wiring.
 */
export type DemonSortKey = 'name' | 'race' | 'level' | 'strength' | 'magic' | 'vitality' | 'agility' | 'luck';
export type SortDir = 'asc' | 'desc';

export interface DemonFilter {
  readonly search: string;
  readonly races: readonly string[];
  /** Union of DemonKind tokens and unlock groups. */
  readonly availability: readonly string[];
  /** The demon must be able to inherit *every* listed body-type category. */
  readonly inherits: readonly string[];
  readonly levelMin: number | null;
  readonly levelMax: number | null;
  readonly affinityRelation: Affinity | null;
  readonly affinityElement: ElementId | null;
  readonly owned: boolean;
  readonly sort: DemonSortKey;
  readonly dir: SortDir;
}

export const DEFAULT_DEMON_FILTER: DemonFilter = {
  search: '',
  races: [],
  availability: [],
  inherits: [],
  levelMin: null,
  levelMax: null,
  affinityRelation: null,
  affinityElement: null,
  owned: false,
  sort: 'level',
  dir: 'asc',
};

const KIND_TOKENS = new Set(['normal', 'element', 'mitama', 'special', 'fiend', 'evolution', 'recruit']);
const AFFINITIES = new Set<Affinity>(['weak', 'neutral', 'resist', 'null', 'repel', 'drain']);
const SORT_KEYS = new Set<DemonSortKey>(['name', 'race', 'level', 'strength', 'magic', 'vitality', 'agility', 'luck']);
const RACE_INDEX = new Map(RACE_ORDER.map((r, i) => [r, i] as const));

function matchesText(d: Demon, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return d.name.toLowerCase().includes(q) || d.race.includes(q);
}

function matchesAvailability(d: Demon, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return true;
  return tokens.some((t) => (KIND_TOKENS.has(t) ? d.kind === t : d.unlock?.group === t));
}

function matchesAffinity(d: Demon, relation: Affinity | null, element: ElementId | null): boolean {
  if (!relation) return true;
  if (element) return d.affinities[element] === relation;
  return ELEMENT_ORDER.some((el) => d.affinities[el] === relation);
}

/** Apply every active clause (ANDed). `ownedIds` comes from the compendium store. */
export function filterDemons(demons: readonly Demon[], f: DemonFilter, ownedIds?: ReadonlySet<string>): Demon[] {
  return demons.filter(
    (d) =>
      matchesText(d, f.search) &&
      (f.races.length === 0 || f.races.includes(d.race)) &&
      matchesAvailability(d, f.availability) &&
      f.inherits.every((c) => (d.inherits as readonly string[]).includes(c)) &&
      (f.levelMin === null || d.level >= f.levelMin) &&
      (f.levelMax === null || d.level <= f.levelMax) &&
      matchesAffinity(d, f.affinityRelation, f.affinityElement) &&
      (!f.owned || (ownedIds?.has(d.id) ?? false)),
  );
}

function sortValue(d: Demon, key: DemonSortKey): string | number {
  switch (key) {
    case 'name':
      return d.name;
    case 'race':
      return RACE_INDEX.get(d.race) ?? 99;
    case 'level':
      return d.level;
    default:
      return d.stats[key];
  }
}

/** Sort a copy; race sorts by compendium order, then level; name breaks ties. */
export function sortDemons(demons: readonly Demon[], f: DemonFilter): Demon[] {
  const sign = f.dir === 'desc' ? -1 : 1;
  return [...demons].sort((a, b) => {
    const av = sortValue(a, f.sort);
    const bv = sortValue(b, f.sort);
    let cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    if (cmp === 0 && f.sort === 'race') cmp = a.level - b.level;
    return cmp !== 0 ? sign * cmp : a.name.localeCompare(b.name);
  });
}

export function parseDemonFilter(params: ParamMap): DemonFilter {
  const relation = params.get('aff');
  const element = params.get('affel');
  const sort = params.get('sort');
  return {
    search: params.get('q') ?? '',
    races: parseList(params, 'race'),
    availability: parseList(params, 'avail'),
    inherits: parseList(params, 'inh'),
    levelMin: parseInt10(params, 'lmin'),
    levelMax: parseInt10(params, 'lmax'),
    affinityRelation: relation && AFFINITIES.has(relation as Affinity) ? (relation as Affinity) : null,
    affinityElement: element && (ELEMENT_ORDER as readonly string[]).includes(element) ? (element as ElementId) : null,
    owned: params.get('owned') === '1',
    sort: sort && SORT_KEYS.has(sort as DemonSortKey) ? (sort as DemonSortKey) : 'level',
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
  };
}

export function serializeDemonFilter(f: DemonFilter): Record<string, string | null> {
  return {
    q: f.search || null,
    race: serializeList(f.races),
    avail: serializeList(f.availability),
    inh: serializeList(f.inherits),
    lmin: f.levelMin === null ? null : String(f.levelMin),
    lmax: f.levelMax === null ? null : String(f.levelMax),
    aff: f.affinityRelation,
    affel: f.affinityRelation ? f.affinityElement : null,
    owned: f.owned ? '1' : null,
    sort: f.sort === 'level' ? null : f.sort,
    dir: f.dir === 'asc' ? null : f.dir,
  };
}

export function isDemonFilterActive(f: DemonFilter): boolean {
  return (
    f.search !== '' ||
    f.races.length > 0 ||
    f.availability.length > 0 ||
    f.inherits.length > 0 ||
    f.levelMin !== null ||
    f.levelMax !== null ||
    f.affinityRelation !== null ||
    f.owned
  );
}
