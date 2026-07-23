import type { ParamMap } from '@angular/router';

import type { Affinity, ElementId, Persona } from '../../model';
import { parseInt10, parseList, serializeList } from '../../../../shared/url-query';

/**
 * Persona-list filter state and the pure functions that apply it and mirror it
 * to the URL (§4.1). Kept out of the component so the real logic unit-tests
 * without a DOM, and so the "filtered URL restores on reload" guarantee (task 19)
 * is a property of tested code, not template wiring.
 */
export type PersonaSortKey =
  | 'name'
  | 'arcana'
  | 'level'
  | 'inherit'
  | 'strength'
  | 'magic'
  | 'endurance'
  | 'agility'
  | 'luck';

export type SortDir = 'asc' | 'desc';

export interface PersonaFilter {
  readonly search: string;
  readonly arcana: readonly string[];
  readonly inherit: readonly string[];
  /** Union of kind tokens (normal/special/treasure/party) and unlock groups. */
  readonly availability: readonly string[];
  readonly levelMin: number | null;
  readonly levelMax: number | null;
  readonly affinityRelation: Affinity | null;
  readonly affinityElement: ElementId | null;
  /** "In my compendium" — restricts to registered personas (task 30). */
  readonly owned: boolean;
  readonly sort: PersonaSortKey;
  readonly dir: SortDir;
}

export const DEFAULT_PERSONA_FILTER: PersonaFilter = {
  search: '',
  arcana: [],
  inherit: [],
  availability: [],
  levelMin: null,
  levelMax: null,
  affinityRelation: null,
  affinityElement: null,
  owned: false,
  sort: 'level',
  dir: 'asc',
};

const KIND_TOKENS = new Set(['normal', 'special', 'treasure', 'party']);
const AFFINITIES = new Set<Affinity>(['weak', 'neutral', 'resist', 'null', 'repel', 'drain']);
const SORT_KEYS = new Set<PersonaSortKey>([
  'name', 'arcana', 'level', 'inherit',
  'strength', 'magic', 'endurance', 'agility', 'luck',
]);

/** Case-insensitive: does `query` appear in name or arcana? */
function matchesText(persona: Persona, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return persona.name.toLowerCase().includes(q) || persona.arcana.toLowerCase().includes(q);
}

function matchesAvailability(persona: Persona, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return true;
  for (const token of tokens) {
    if (KIND_TOKENS.has(token)) {
      if (persona.kind === token) return true;
    } else if (persona.unlock && persona.unlock.group === token) {
      return true;
    }
  }
  return false;
}

function matchesAffinity(persona: Persona, relation: Affinity | null, element: ElementId | null): boolean {
  if (!relation) return true;
  if (element) return persona.affinities[element] === relation;
  return Object.values(persona.affinities).some((a) => a === relation);
}

/**
 * Apply every active filter. Order-independent; each clause is ANDed. The
 * "in my compendium" clause needs the set of owned persona ids, which the page
 * supplies from the compendium store (task 30) — pure code, no store import.
 */
export function filterPersonas(
  personas: readonly Persona[],
  f: PersonaFilter,
  ownedIds?: ReadonlySet<string>,
): Persona[] {
  return personas.filter(
    (p) =>
      matchesText(p, f.search) &&
      (f.arcana.length === 0 || f.arcana.includes(p.arcana)) &&
      (f.inherit.length === 0 || f.inherit.includes(p.inheritType)) &&
      matchesAvailability(p, f.availability) &&
      (f.levelMin === null || p.level >= f.levelMin) &&
      (f.levelMax === null || p.level <= f.levelMax) &&
      matchesAffinity(p, f.affinityRelation, f.affinityElement) &&
      (!f.owned || (ownedIds?.has(p.id) ?? false)),
  );
}

function sortValue(persona: Persona, key: PersonaSortKey): string | number {
  switch (key) {
    case 'name':
      return persona.name;
    case 'arcana':
      return persona.arcana;
    case 'level':
      return persona.level;
    case 'inherit':
      return persona.inheritType;
    default:
      return persona.stats[key];
  }
}

/** Sort a copy; name is the deterministic tie-break so order is stable. */
export function sortPersonas(personas: readonly Persona[], f: PersonaFilter): Persona[] {
  const sign = f.dir === 'desc' ? -1 : 1;
  return [...personas].sort((a, b) => {
    const av = sortValue(a, f.sort);
    const bv = sortValue(b, f.sort);
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv));
    return cmp !== 0 ? sign * cmp : a.name.localeCompare(b.name);
  });
}

// ---- URL serialization (task 19) ----------------------------------------

export function parsePersonaFilter(params: ParamMap): PersonaFilter {
  const relation = params.get('aff');
  const sort = params.get('sort');
  const dir = params.get('dir');
  return {
    search: params.get('q') ?? '',
    arcana: parseList(params, 'arcana'),
    inherit: parseList(params, 'inherit'),
    availability: parseList(params, 'avail'),
    levelMin: parseInt10(params, 'lmin'),
    levelMax: parseInt10(params, 'lmax'),
    affinityRelation: relation && AFFINITIES.has(relation as Affinity) ? (relation as Affinity) : null,
    affinityElement: (params.get('affel') as ElementId | null) || null,
    owned: params.get('owned') === '1',
    sort: sort && SORT_KEYS.has(sort as PersonaSortKey) ? (sort as PersonaSortKey) : 'level',
    dir: dir === 'desc' ? 'desc' : 'asc',
  };
}

export function serializePersonaFilter(f: PersonaFilter): Record<string, string | null> {
  return {
    q: f.search || null,
    arcana: serializeList(f.arcana),
    inherit: serializeList(f.inherit),
    avail: serializeList(f.availability),
    lmin: f.levelMin === null ? null : String(f.levelMin),
    lmax: f.levelMax === null ? null : String(f.levelMax),
    aff: f.affinityRelation,
    affel: f.affinityRelation ? f.affinityElement : null,
    owned: f.owned ? '1' : null,
    sort: f.sort === 'level' ? null : f.sort,
    dir: f.dir === 'asc' ? null : f.dir,
  };
}

/** True when any filter deviates from the default (drives the "clear" button). */
export function isPersonaFilterActive(f: PersonaFilter): boolean {
  return (
    f.search !== '' ||
    f.arcana.length > 0 ||
    f.inherit.length > 0 ||
    f.availability.length > 0 ||
    f.levelMin !== null ||
    f.levelMax !== null ||
    f.affinityRelation !== null ||
    f.owned
  );
}
