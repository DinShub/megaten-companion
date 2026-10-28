import type { ElementVisual } from '../../../shared/element-visuals';
import type {
  Acquisition,
  ArcanaId,
  InheritMatrix,
  InheritTypeId,
  PersonaKind,
  SkillCost,
  SkillElementId,
  Stats,
  UnlockGroup,
} from '../model';

/**
 * Display helpers for the P4G pages. Pure formatting — no Angular, no I/O —
 * so they unit-test directly and keep the templates thin.
 */

/** `hanged` → `Hanged Man`, the rest capitalised. */
export function arcanaLabel(arcana: ArcanaId | string): string {
  if (arcana === 'hanged') return 'Hanged Man';
  return arcana ? arcana[0].toUpperCase() + arcana.slice(1) : arcana;
}

/** The seven affinity axes personas show. Almighty is neutral on every persona, so it is left off. */
export const P4G_AFFINITY_ELEMENTS: readonly ElementVisual[] = [
  { id: 'phys', label: 'Physical', abbrev: 'Phy' },
  { id: 'fire', label: 'Fire', abbrev: 'Fir' },
  { id: 'ice', label: 'Ice', abbrev: 'Ice' },
  { id: 'elec', label: 'Electric', abbrev: 'Ele' },
  { id: 'wind', label: 'Wind', abbrev: 'Win' },
  { id: 'light', label: 'Light', abbrev: 'Lig' },
  { id: 'dark', label: 'Dark', abbrev: 'Drk' },
];

/** Shadows add the Almighty axis — a few of them resist it. */
export const P4G_SHADOW_AFFINITY_ELEMENTS: readonly ElementVisual[] = [
  ...P4G_AFFINITY_ELEMENTS,
  { id: 'almighty', label: 'Almighty', abbrev: 'Alm' },
];

export const SKILL_ELEMENT_LABEL: Readonly<Record<SkillElementId, string>> = {
  phys: 'Physical',
  fire: 'Fire',
  ice: 'Ice',
  elec: 'Electric',
  wind: 'Wind',
  light: 'Light',
  dark: 'Dark',
  almighty: 'Almighty',
  ailment: 'Ailment',
  recovery: 'Recovery',
  support: 'Support',
  special: 'Special',
  passive: 'Passive',
};

export const INHERIT_TYPE_LABEL: Readonly<Record<InheritTypeId, string>> = {
  phys: 'Physical',
  fire: 'Fire',
  ice: 'Ice',
  elec: 'Electric',
  wind: 'Wind',
  light: 'Light',
  dark: 'Dark',
  almighty: 'Almighty',
  ailment: 'Ailment',
  recovery: 'Recovery',
  support: 'Support',
};

/** The skill elements an inherit type can be refused, as InheritMask columns. Passives are always open, so they are left off. */
export const P4G_INHERIT_ELEMENTS: readonly ElementVisual[] = (
  ['phys', 'fire', 'ice', 'elec', 'wind', 'light', 'dark', 'almighty', 'ailment', 'recovery', 'support', 'special'] as const
).map((id) => ({ id, label: SKILL_ELEMENT_LABEL[id], abbrev: SKILL_ELEMENT_LABEL[id].slice(0, 3) }));

/** An inherit type's row of the matrix, as the `element → allowed` map the InheritMask renders. */
export function inheritRow(matrix: InheritMatrix, type: InheritTypeId): Readonly<Record<string, boolean>> {
  return matrix[type] ?? {};
}

export const KIND_LABEL: Readonly<Record<PersonaKind, string>> = {
  normal: 'Fusable',
  special: 'Special fusion',
};

export const UNLOCK_LABEL: Readonly<Record<UnlockGroup, string>> = {
  story: 'Story progression',
  'social-link': 'Maxed Social Links',
};

/** The five core stats in P4G's St/Ma/En/Ag/Lu order. */
export const STAT_COLUMNS: readonly { key: keyof Stats; abbrev: string; label: string }[] = [
  { key: 'strength', abbrev: 'St', label: 'Strength' },
  { key: 'magic', abbrev: 'Ma', label: 'Magic' },
  { key: 'endurance', abbrev: 'En', label: 'Endurance' },
  { key: 'agility', abbrev: 'Ag', label: 'Agility' },
  { key: 'luck', abbrev: 'Lu', label: 'Luck' },
];

/** `{ type: 'sp', value: 6 }` → `6 SP`; hp-percent → `12% HP`. */
export function formatSkillCost(cost: SkillCost | null): string {
  if (!cost) return '—';
  return cost.type === 'sp' ? `${cost.value} SP` : `${cost.value}% HP`;
}

export function formatAcquisition(acq: Acquisition): string {
  return acq.kind === 'innate' ? 'Innate' : `Lv ${acq.level}`;
}

/** `12500` → `12,500` without pulling DecimalPipe into a chunk. */
export function formatNumber(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '—';
}

/** `5.916…` → `5.92`, `10` → `10`. */
export function formatLevel(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * The greyed label for a skill a fusion result can't take: the refused
 * element, else the reason word, else null (eligible).
 */
export function inheritNote(
  reason: 'unique' | 'blocked-element' | 'already-known' | undefined,
  blocking: SkillElementId | undefined,
): string | null {
  switch (reason) {
    case 'unique':
      return 'Unique';
    case 'already-known':
      return 'Already known';
    case 'blocked-element':
      return blocking ? `Can't take ${SKILL_ELEMENT_LABEL[blocking]}` : 'Blocked';
    default:
      return null;
  }
}
