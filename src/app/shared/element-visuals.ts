/**
 * Shared visual vocabulary for the affinity / element / inherit displays (§10).
 *
 * These are universal Shin-Megami-Tensei concepts (the ten damage axes, the six
 * affinity outcomes), not one game's data — so they live in `shared/`, keeping
 * the shared components free of any `games/<id>/` import. A game's pages map
 * their model onto these plain shapes.
 *
 * Every readout pairs colour with a text code, never colour alone (§10, a11y).
 */

export type Affinity = 'weak' | 'neutral' | 'resist' | 'null' | 'repel' | 'drain';

export interface AffinityMeta {
  readonly label: string;
  /** Two-letter code shown in the cell — legible without colour. */
  readonly code: string;
  /** CSS modifier class carrying the colour. */
  readonly cls: string;
}

export const AFFINITY_META: Readonly<Record<Affinity, AffinityMeta>> = {
  weak: { label: 'Weak', code: 'Wk', cls: 'aff-weak' },
  neutral: { label: 'Neutral', code: '–', cls: 'aff-neutral' },
  resist: { label: 'Resist', code: 'Rs', cls: 'aff-resist' },
  null: { label: 'Null', code: 'Nu', cls: 'aff-null' },
  repel: { label: 'Repel', code: 'Rp', cls: 'aff-repel' },
  drain: { label: 'Drain', code: 'Dr', cls: 'aff-drain' },
};

export interface ElementVisual {
  readonly id: string;
  readonly label: string;
  /** Three-letter column header. */
  readonly abbrev: string;
}

/** The ten affinity axes, in fixed display order (§10). */
export const AFFINITY_ELEMENTS: readonly ElementVisual[] = [
  { id: 'phys', label: 'Physical', abbrev: 'Phy' },
  { id: 'gun', label: 'Gun', abbrev: 'Gun' },
  { id: 'fire', label: 'Fire', abbrev: 'Fir' },
  { id: 'ice', label: 'Ice', abbrev: 'Ice' },
  { id: 'elec', label: 'Electric', abbrev: 'Ele' },
  { id: 'wind', label: 'Wind', abbrev: 'Win' },
  { id: 'psy', label: 'Psy', abbrev: 'Psy' },
  { id: 'nuke', label: 'Nuclear', abbrev: 'Nuc' },
  { id: 'bless', label: 'Bless', abbrev: 'Bls' },
  { id: 'curse', label: 'Curse', abbrev: 'Cur' },
];

/** The twelve inherit axes (§6.5): the ten above plus ailment and healing. */
export const INHERIT_ELEMENTS: readonly ElementVisual[] = [
  ...AFFINITY_ELEMENTS,
  { id: 'ailment', label: 'Ailment', abbrev: 'Ail' },
  { id: 'healing', label: 'Healing', abbrev: 'Hea' },
];

/** Skill-classification → colour class, for the skill chip's element dot. */
export const SKILL_ELEMENT_CLS: Readonly<Record<string, string>> = {
  phys: 'el-phys',
  gun: 'el-gun',
  fire: 'el-fire',
  ice: 'el-ice',
  elec: 'el-elec',
  wind: 'el-wind',
  psy: 'el-psy',
  nuke: 'el-nuke',
  bless: 'el-bless',
  curse: 'el-curse',
  almighty: 'el-almighty',
  ailment: 'el-ailment',
  support: 'el-support',
  healing: 'el-healing',
  passive: 'el-passive',
  force: 'el-force',
  expel: 'el-expel',
  death: 'el-death',
  mind: 'el-mind',
  nerve: 'el-nerve',
  special: 'el-special',
  talk: 'el-talk',
  // P4G's and P3R's names for the same colours; P3R splits physical three ways.
  light: 'el-bless',
  dark: 'el-curse',
  recovery: 'el-healing',
  slash: 'el-phys',
  strike: 'el-phys',
  pierce: 'el-phys',
};

export const SKILL_ELEMENT_LABEL: Readonly<Record<string, string>> = {
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
  force: 'Force',
  expel: 'Expel',
  death: 'Death',
  mind: 'Mind',
  nerve: 'Nerve',
  special: 'Special',
  talk: 'Talk',
  light: 'Light',
  dark: 'Dark',
  recovery: 'Recovery',
  slash: 'Slash',
  strike: 'Strike',
  pierce: 'Pierce',
};
