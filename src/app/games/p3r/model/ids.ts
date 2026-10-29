/**
 * Persona 3 Reload controlled vocabularies.
 *
 * The contract between `scripts/import/p3r/` and the app: the importer's
 * vocabulary (`scripts/import/p3r/vocab.mjs`) emits exactly these members, and
 * its validation gate refuses anything else, so a value that reaches
 * `public/data/p3r/` is assignable here.
 */

export type ArcanaId =
  | 'fool' | 'magician' | 'priestess' | 'empress' | 'emperor' | 'hierophant'
  | 'lovers' | 'chariot' | 'justice' | 'hermit' | 'fortune' | 'strength'
  | 'hanged' | 'death' | 'temperance' | 'devil' | 'tower' | 'star'
  | 'moon' | 'sun' | 'judgement' | 'aeon';

/** Upstream's arcana order, which is also the game's compendium order. */
export const ARCANA_ORDER: readonly ArcanaId[] = [
  'fool', 'magician', 'priestess', 'empress', 'emperor', 'hierophant',
  'lovers', 'chariot', 'justice', 'hermit', 'fortune', 'strength',
  'hanged', 'death', 'temperance', 'devil', 'tower', 'star',
  'moon', 'sun', 'judgement', 'aeon',
] as const;

/** The ten affinity axes, in upstream's `resistElems` order. Almighty matters only for shadows. */
export type ElementId = 'slash' | 'strike' | 'pierce' | 'fire' | 'ice' | 'elec' | 'wind' | 'light' | 'dark' | 'almighty';

export const ELEMENT_ORDER: readonly ElementId[] = [
  'slash', 'strike', 'pierce', 'fire', 'ice', 'elec', 'wind', 'light', 'dark', 'almighty',
] as const;

export type SkillElementId = ElementId | 'ailment' | 'recovery' | 'support' | 'special' | 'passive';

export const SKILL_ELEMENT_ORDER: readonly SkillElementId[] = [
  ...ELEMENT_ORDER, 'ailment', 'recovery', 'support', 'special', 'passive',
] as const;

/**
 * A persona's inheritance type — upstream's own key (`fireD`, `lidarkA`, …).
 * Each names a mask over the skill elements; the inherit matrix
 * (`public/data/p3r/inherit-matrix.json`) says what each type may take.
 */
export type InheritTypeId = string;

export type Affinity = 'weak' | 'neutral' | 'resist' | 'null' | 'repel' | 'drain';

/**
 * The four unlock toggles — upstream's `demon-unlocks.json` categories. DLC
 * defaults off (upstream ships it locked), the other three on.
 */
export type UnlockGroup = 'story' | 'social-link' | 'teammate-link' | 'dlc';

export const UNLOCK_GROUPS: readonly UnlockGroup[] = ['story', 'social-link', 'teammate-link', 'dlc'] as const;

export type PersonaId = string;
export type SkillId = string;
export type ShadowId = string;

/** The five core stats, in P3R's St/Ma/En/Ag/Lu order. */
export interface Stats {
  readonly strength: number;
  readonly magic: number;
  readonly endurance: number;
  readonly agility: number;
  readonly luck: number;
}
