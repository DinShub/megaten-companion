import type { ElementVisual } from '../../../shared/element-visuals';
import type {
  Acquisition,
  AilmentId,
  CoreStats,
  Demon,
  DemonKind,
  InheritCategoryId,
  RaceId,
  SkillCost,
  SkillElementId,
  UnlockGroup,
} from '../model';
import { INHERIT_ORDER } from '../model/ids';

/**
 * Display helpers for the Nocturne pages. Pure formatting — no Angular, no I/O —
 * so they unit-test directly and keep the templates thin.
 */

const RACE_LABEL_OVERRIDES: Partial<Record<RaceId, string>> = { 'd-fiend': 'D-Fiend' };

/** `deity` → `Deity`, `d-fiend` → `D-Fiend`. */
export function raceLabel(race: RaceId | string): string {
  return RACE_LABEL_OVERRIDES[race as RaceId] ?? (race ? race[0].toUpperCase() + race.slice(1) : race);
}

/** The ten Nocturne affinity axes, for the shared AffinityGrid. */
export const SMT3_AFFINITY_ELEMENTS: readonly ElementVisual[] = [
  { id: 'phys', label: 'Physical', abbrev: 'Phy' },
  { id: 'fire', label: 'Fire', abbrev: 'Fir' },
  { id: 'ice', label: 'Ice', abbrev: 'Ice' },
  { id: 'elec', label: 'Electric', abbrev: 'Ele' },
  { id: 'force', label: 'Force', abbrev: 'For' },
  { id: 'expel', label: 'Expel', abbrev: 'Exp' },
  { id: 'death', label: 'Death', abbrev: 'Dea' },
  { id: 'mind', label: 'Mind', abbrev: 'Min' },
  { id: 'nerve', label: 'Nerve', abbrev: 'Ner' },
  { id: 'curse', label: 'Curse', abbrev: 'Cur' },
];

export const INHERIT_LABEL: Readonly<Record<InheritCategoryId, string>> = {
  thrust: 'Thrust',
  claw: 'Claw',
  bite: 'Bite',
  weapon: 'Weapon',
  mouth: 'Mouth',
  wings: 'Wings',
  eye: 'Eye',
  talk: 'Talk',
  maiden: 'Maiden',
};

/** The nine inheritance categories, for the shared InheritMask. */
export const SMT3_INHERIT_ELEMENTS: readonly ElementVisual[] = INHERIT_ORDER.map((id) => ({
  id,
  label: INHERIT_LABEL[id],
  abbrev: INHERIT_LABEL[id].slice(0, 3),
}));

/** A demon's mask as the `category → allowed` row the InheritMask renders. */
export function inheritRow(demon: Pick<Demon, 'inherits'>): Readonly<Record<string, boolean>> {
  return Object.fromEntries(INHERIT_ORDER.map((c) => [c, demon.inherits.includes(c)]));
}

export const SKILL_ELEMENT_LABEL: Readonly<Record<SkillElementId, string>> = {
  phys: 'Physical',
  fire: 'Fire',
  ice: 'Ice',
  elec: 'Electric',
  force: 'Force',
  almighty: 'Almighty',
  expel: 'Expel',
  death: 'Death',
  curse: 'Curse',
  nerve: 'Nerve',
  mind: 'Mind',
  healing: 'Healing',
  support: 'Support',
  special: 'Special',
  passive: 'Passive',
  talk: 'Talk',
};

export const AILMENT_LABEL: Readonly<Record<AilmentId, string>> = {
  freeze: 'Freeze',
  shock: 'Shock',
  hama: 'Hama',
  mudo: 'Mudo',
};

export const KIND_LABEL: Readonly<Record<DemonKind, string>> = {
  normal: 'Fusable',
  element: 'Element',
  mitama: 'Mitama',
  special: 'Special fusion',
  fiend: 'Fiend (Deathstone)',
  evolution: 'Evolution only',
  recruit: 'Recruit only',
};

export const UNLOCK_LABEL: Readonly<Record<UnlockGroup, string>> = {
  story: 'Story progression',
  fiend: 'Fiend encounters',
  amala: 'Labyrinth of Amala',
};

/** The five core stats in Nocturne's St/Ma/Vi/Ag/Lu order. */
export const STAT_COLUMNS: readonly { key: keyof CoreStats; abbrev: string; label: string }[] = [
  { key: 'strength', abbrev: 'St', label: 'Strength' },
  { key: 'magic', abbrev: 'Ma', label: 'Magic' },
  { key: 'vitality', abbrev: 'Vi', label: 'Vitality' },
  { key: 'agility', abbrev: 'Ag', label: 'Agility' },
  { key: 'luck', abbrev: 'Lu', label: 'Luck' },
];

/** `{ type: 'mp', value: 6 }` → `6 MP`; hp-percent → `12% HP`. */
export function formatSkillCost(cost: SkillCost | null): string {
  if (!cost) return '—';
  return cost.type === 'mp' ? `${cost.value} MP` : `${cost.value}% HP`;
}

export function formatAcquisition(acq: Acquisition): string {
  return acq.kind === 'innate' ? 'Innate' : `Lv ${acq.level}`;
}

/** `12500` → `12,500` without pulling DecimalPipe into a chunk. */
export function formatNumber(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '—';
}

/**
 * The greyed label for a skill a fusion result can't take: the blocking
 * category, else the reason word, else null (eligible).
 */
export function inheritNote(
  reason: 'unique' | 'blocked-category' | 'already-known' | undefined,
  blocking: InheritCategoryId | undefined,
): string | null {
  switch (reason) {
    case 'unique':
      return 'Unique';
    case 'already-known':
      return 'Already known';
    case 'blocked-category':
      return blocking ? `Needs ${INHERIT_LABEL[blocking]}` : 'Blocked';
    default:
      return null;
  }
}
