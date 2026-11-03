import type { FusionPath } from '../fusion';
import type { Affinity, Alignment, Demon, DemonKind, ElementId, RaceId, Skill, SkillElementId, SpeciesId } from '../model';
import { displayLevel } from '../model';

/**
 * Display helpers for the SMT1 pages. Pure formatting — no Angular, no I/O — so
 * they unit-test directly and keep the templates thin.
 */

/** `deity` → `Deity`. */
export function raceLabel(race: RaceId | string): string {
  return race ? race[0].toUpperCase() + race.slice(1) : race;
}

/** `deities` → `Deities`. */
export const speciesLabel = (s: SpeciesId | string): string => raceLabel(s);

/** The fourteen resistance axes, as the guide prints them. */
export const ELEMENT_LABEL: Readonly<Record<ElementId, { readonly name: string; readonly abbrev: string }>> = {
  sword: { name: 'Sword', abbrev: 'Sw' },
  gun: { name: 'Gun', abbrev: 'Gn' },
  fire: { name: 'Fire', abbrev: 'Fi' },
  ice: { name: 'Ice', abbrev: 'Ic' },
  elec: { name: 'Elec', abbrev: 'El' },
  force: { name: 'Force', abbrev: 'Fo' },
  nerve: { name: 'Nerve', abbrev: 'Nv' },
  expel: { name: 'Expel', abbrev: 'Ex' },
  death: { name: 'Death', abbrev: 'Dt' },
  curse: { name: 'Curse', abbrev: 'Cu' },
  bind: { name: 'Bind', abbrev: 'Bd' },
  rush: { name: 'Rush', abbrev: 'Ru' },
  punch: { name: 'Punch', abbrev: 'Pu' },
  flying: { name: 'Flying', abbrev: 'Fl' },
};

export const SKILL_ELEMENT_LABEL: Readonly<Record<SkillElementId, string>> = {
  ...Object.fromEntries(Object.entries(ELEMENT_LABEL).map(([k, v]) => [k, v.name])),
  almighty: 'Almighty',
  energy: 'Energy',
  recovery: 'Recovery',
  support: 'Support',
  special: 'Special',
} as Record<SkillElementId, string>;

/** One printed resistance cell: a short code, a class, and what a screen reader says. */
export interface AffinityCell {
  readonly kind: 'wk' | 'rs' | 'n' | 'nu' | 'rp' | 'dr';
  readonly text: string;
  readonly say: string;
}

export function affinityCell(a: Affinity): AffinityCell {
  const half = a.percent < 100 ? ` ${a.percent}%` : '';
  switch (a.type) {
    case 'weak':
      return { kind: 'wk', text: 'Wk', say: `weak, takes ${a.percent}%` };
    case 'resist':
      return { kind: 'rs', text: String(Math.floor(a.percent)), say: `resists, takes ${a.percent}%` };
    case 'null':
      return { kind: 'nu', text: 'Nu', say: 'nulls' };
    case 'repel':
      return { kind: 'rp', text: 'Rp', say: `repels${half}` };
    case 'drain':
      return { kind: 'dr', text: 'Dr', say: `drains${half}` };
    default:
      return { kind: 'n', text: '–', say: 'neutral' };
  }
}

export const alignmentLabel = (a: Alignment): string => `${raceLabel(a.light)}, ${raceLabel(a.law)}`;

/** "Tenma, Lv 88". */
export const demonMeta = (d: Demon): string => `${raceLabel(d.race)}, Lv ${displayLevel(d)}`;

export const KIND_LABEL: Readonly<Record<DemonKind, string>> = {
  normal: 'Fusable',
  recruit: 'Recruit only',
  enemy: 'Enemy only',
};

export const PATH_LABEL: Readonly<Record<FusionPath, string>> = {
  special: 'Special recipe',
  element: 'Element fusion',
  dark: 'Dark fusion',
  'same-race': 'Same race',
  normal: 'Race chart',
  species: 'Species chart',
  triple: 'Triple fusion',
};

/** The one-line description a skill row prints under its name. */
export function skillSummary(s: Skill): string {
  return [SKILL_ELEMENT_LABEL[s.element], s.target, s.power ? `power ${s.power}` : '', s.effect].filter(Boolean).join(', ');
}

export const mpLabel = (s: Skill): string => (s.mp ? `${s.mp} MP` : 'no MP');

/** The eight stats, in the guide's order. */
export const STAT_COLUMNS: readonly { readonly key: keyof Demon['stats']; readonly label: string }[] = [
  { key: 'hp', label: 'HP' },
  { key: 'mp', label: 'MP' },
  { key: 'strength', label: 'St' },
  { key: 'intelligence', label: 'In' },
  { key: 'magic', label: 'Ma' },
  { key: 'vitality', label: 'Vi' },
  { key: 'agility', label: 'Ag' },
  { key: 'luck', label: 'Lu' },
];

/** Upstream's combat values, under upstream's labels (CP and NoA are left out: upstream doesn't say what they are). */
export const COMBAT_COLUMNS: readonly { readonly key: keyof Demon['combat']; readonly label: string }[] = [
  { key: 'physAttack', label: 'P.Atk' },
  { key: 'physHit', label: 'P.Hit' },
  { key: 'defense', label: 'Def' },
  { key: 'evasion', label: 'Eva' },
  { key: 'magicAttack', label: 'M.Atk' },
  { key: 'magicHit', label: 'M.Hit' },
];
