import type { ParamMap } from '@angular/router';

import { parseInt10, parseList, serializeList } from '../../../../shared/url-query';
import type { Affinity, Persona, ElementId } from '../../model';
import { ELEMENT_ORDER, ARCANA_ORDER } from '../../model/ids';

/**
 * Persona-list filter state, the pure functions that apply it, and its URL
 * mirror — kept out of the component so "a filtered URL restores on reload" is
 * a property of tested code, not template wiring.
 */
export type PersonaSortKey = 'name' | 'arcana' | 'level' | 'strength' | 'magic' | 'endurance' | 'agility' | 'luck';
export type SortDir = 'asc' | 'desc';

export interface PersonaFilter {
  readonly search: string;
  readonly arcana: readonly string[];
  /** Union of PersonaKind tokens and unlock groups. */
  readonly availability: readonly string[];
  /** The persona's inheritance type must be one of these. */
  readonly inherits: readonly string[];
  readonly levelMin: number | null;
  readonly levelMax: number | null;
  readonly affinityRelation: Affinity | null;
  readonly affinityElement: ElementId | null;
  readonly owned: boolean;
  readonly sort: PersonaSortKey;
  readonly dir: SortDir;
}

export const DEFAULT_PERSONA_FILTER: PersonaFilter = {
  search: '',
  arcana: [],
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

const KIND_TOKENS = new Set(['normal', 'special']);
const AFFINITIES = new Set<Affinity>(['weak', 'neutral', 'resist', 'null', 'repel', 'drain']);
const SORT_KEYS = new Set<PersonaSortKey>(['name', 'arcana', 'level', 'strength', 'magic', 'endurance', 'agility', 'luck']);
const ARCANA_INDEX = new Map(ARCANA_ORDER.map((r, i) => [r, i] as const));

function matchesText(d: Persona, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return d.name.toLowerCase().includes(q) || d.arcana.includes(q);
}

function matchesAvailability(d: Persona, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return true;
  return tokens.some((t) => (KIND_TOKENS.has(t) ? d.kind === t : d.unlock?.group === t));
}

function matchesAffinity(d: Persona, relation: Affinity | null, element: ElementId | null): boolean {
  if (!relation) return true;
  if (element) return d.affinities[element] === relation;
  return ELEMENT_ORDER.some((el) => d.affinities[el] === relation);
}

/** Apply every active clause (ANDed). `ownedIds` comes from the compendium store. */
export function filterPersonas(personas: readonly Persona[], f: PersonaFilter, ownedIds?: ReadonlySet<string>): Persona[] {
  return personas.filter(
    (d) =>
      matchesText(d, f.search) &&
      (f.arcana.length === 0 || f.arcana.includes(d.arcana)) &&
      matchesAvailability(d, f.availability) &&
      (f.inherits.length === 0 || f.inherits.includes(d.inheritType)) &&
      (f.levelMin === null || d.level >= f.levelMin) &&
      (f.levelMax === null || d.level <= f.levelMax) &&
      matchesAffinity(d, f.affinityRelation, f.affinityElement) &&
      (!f.owned || (ownedIds?.has(d.id) ?? false)),
  );
}

function sortValue(d: Persona, key: PersonaSortKey): string | number {
  switch (key) {
    case 'name':
      return d.name;
    case 'arcana':
      return ARCANA_INDEX.get(d.arcana) ?? 99;
    case 'level':
      return d.level;
    default:
      return d.stats[key];
  }
}

/** Sort a copy; arcana sorts by compendium order, then level; name breaks ties. */
export function sortPersonas(personas: readonly Persona[], f: PersonaFilter): Persona[] {
  const sign = f.dir === 'desc' ? -1 : 1;
  return [...personas].sort((a, b) => {
    const av = sortValue(a, f.sort);
    const bv = sortValue(b, f.sort);
    let cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    if (cmp === 0 && f.sort === 'arcana') cmp = a.level - b.level;
    return cmp !== 0 ? sign * cmp : a.name.localeCompare(b.name);
  });
}

export function parsePersonaFilter(params: ParamMap): PersonaFilter {
  const relation = params.get('aff');
  const element = params.get('affel');
  const sort = params.get('sort');
  return {
    search: params.get('q') ?? '',
    arcana: parseList(params, 'arcana'),
    availability: parseList(params, 'avail'),
    inherits: parseList(params, 'inh'),
    levelMin: parseInt10(params, 'lmin'),
    levelMax: parseInt10(params, 'lmax'),
    affinityRelation: relation && AFFINITIES.has(relation as Affinity) ? (relation as Affinity) : null,
    affinityElement: element && (ELEMENT_ORDER as readonly string[]).includes(element) ? (element as ElementId) : null,
    owned: params.get('owned') === '1',
    sort: sort && SORT_KEYS.has(sort as PersonaSortKey) ? (sort as PersonaSortKey) : 'level',
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
  };
}

export function serializePersonaFilter(f: PersonaFilter): Record<string, string | null> {
  return {
    q: f.search || null,
    arcana: serializeList(f.arcana),
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

export function isPersonaFilterActive(f: PersonaFilter): boolean {
  return (
    f.search !== '' ||
    f.arcana.length > 0 ||
    f.availability.length > 0 ||
    f.inherits.length > 0 ||
    f.levelMin !== null ||
    f.levelMax !== null ||
    f.affinityRelation !== null ||
    f.owned
  );
}
