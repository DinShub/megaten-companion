import type { Acquisition, SkillCost, Stats } from '../model';
import { INHERIT_ELEMENT_ORDER } from '../model/ids';
import type { InheritElementId, InheritMatrix, InheritTypeId, SkillElementId } from '../model';

/**
 * Display helpers shared across the P5R reference pages (§4.1–§4.4). Pure
 * formatting — no Angular, no I/O — so they unit-test directly and keep the page
 * templates thin.
 */

/** `councillor` → `Councillor`, `hanged` → `Hanged`. */
export function titleCase(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

/** The five base stats in the fixed St/Ma/En/Ag/Lu order (§4.1). */
export const STAT_COLUMNS: readonly { key: keyof Stats; abbrev: string; label: string }[] = [
  { key: 'strength', abbrev: 'St', label: 'Strength' },
  { key: 'magic', abbrev: 'Ma', label: 'Magic' },
  { key: 'endurance', abbrev: 'En', label: 'Endurance' },
  { key: 'agility', abbrev: 'Ag', label: 'Agility' },
  { key: 'luck', abbrev: 'Lu', label: 'Luck' },
];

/** `{ type: 'sp', value: 4 }` → `4 SP`; hp-percent → `22% HP`; gauge → `Gauge`. */
export function formatSkillCost(cost: SkillCost | null): string {
  if (!cost) return '—';
  switch (cost.type) {
    case 'sp':
      return `${cost.value} SP`;
    case 'hp-percent':
      return `${cost.value}% HP`;
    case 'gauge':
      return 'Gauge';
  }
}

/** How a persona comes by a skill: innate, a level, or a non-level tag (Fa/Tk/…). */
export function formatAcquisition(acq: Acquisition): string {
  switch (acq.kind) {
    case 'innate':
      return 'Innate';
    case 'level':
      return `Lv ${acq.level}`;
    case 'tag':
      return acq.tag;
  }
}

/** Sort key so innate skills lead, then by level, then tagged acquisitions last. */
export function acquisitionOrder(acq: Acquisition): number {
  switch (acq.kind) {
    case 'innate':
      return acq.order; // 1, 2, 3… — innate list order
    case 'level':
      return 1000 + acq.level;
    case 'tag':
      return 100000;
  }
}

/**
 * The resolved inherit-permission row for a persona's inherit type: the 12
 * `elementId → boolean` axes the {@link InheritMask} renders. `none` (party
 * personas, treasure demons flagged so) inherits nothing.
 */
export function inheritRow(
  matrix: InheritMatrix,
  type: InheritTypeId,
): Readonly<Record<string, boolean>> {
  const row = matrix[type];
  if (!row) {
    const empty: Record<string, boolean> = {};
    for (const el of INHERIT_ELEMENT_ORDER) empty[el] = false;
    return empty;
  }
  return row;
}

/**
 * Which of the 14 inherit types can receive a skill of the given element (§4.3
 * "inheritance eligibility"). A skill with no `inheritElement` (almighty,
 * support, passive) or a `unique` skill is inheritable by none.
 */
export function typesThatInherit(
  matrix: InheritMatrix,
  inheritElement: string | null,
  unique: boolean,
): InheritTypeId[] {
  if (unique || !inheritElement) return [];
  const el = inheritElement as InheritElementId;
  const types: InheritTypeId[] = [];
  for (const type of Object.keys(matrix) as InheritTypeId[]) {
    if (matrix[type]?.[el]) types.push(type);
  }
  return types;
}

/** Human labels for skill classifications, reusing the shared vocabulary keys. */
export const SKILL_ELEMENT_NAMES: Readonly<Record<SkillElementId, string>> = {
  phys: 'Physical',
  gun: 'Gun',
  fire: 'Fire',
  ice: 'Ice',
  elec: 'Electric',
  wind: 'Wind',
  psy: 'Psy',
  nuke: 'Nuclear',
  bless: 'Bless',
  curse: 'Curse',
  almighty: 'Almighty',
  ailment: 'Ailment',
  support: 'Support',
  healing: 'Healing',
  passive: 'Passive',
};
