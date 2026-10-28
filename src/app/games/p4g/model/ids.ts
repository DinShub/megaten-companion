/**
 * Persona 4 Golden controlled vocabularies.
 *
 * The contract between `scripts/import/p4g/` and the app: the importer's
 * vocabulary (`scripts/import/p4g/vocab.mjs`) emits exactly these members, and
 * its validation gate refuses anything else, so a value that reaches
 * `public/data/p4g/` is assignable here.
 */

export type ArcanaId =
  | 'fool' | 'magician' | 'priestess' | 'empress' | 'emperor' | 'hierophant'
  | 'lovers' | 'chariot' | 'justice' | 'hermit' | 'fortune' | 'strength'
  | 'hanged' | 'death' | 'temperance' | 'devil' | 'tower' | 'star'
  | 'moon' | 'sun' | 'judgement' | 'aeon' | 'jester' | 'world';

/** Upstream's arcana order, which is also the game's compendium order. */
export const ARCANA_ORDER: readonly ArcanaId[] = [
  'fool', 'magician', 'priestess', 'empress', 'emperor', 'hierophant',
  'lovers', 'chariot', 'justice', 'hermit', 'fortune', 'strength',
  'hanged', 'death', 'temperance', 'devil', 'tower', 'star',
  'moon', 'sun', 'judgement', 'aeon', 'jester', 'world',
] as const;

/** The eight affinity axes, in upstream's `resistElems` order. Almighty matters only for shadows. */
export type ElementId = 'phys' | 'fire' | 'ice' | 'elec' | 'wind' | 'light' | 'dark' | 'almighty';

export const ELEMENT_ORDER: readonly ElementId[] = [
  'phys', 'fire', 'ice', 'elec', 'wind', 'light', 'dark', 'almighty',
] as const;

export type SkillElementId =
  | 'phys' | 'fire' | 'ice' | 'elec' | 'wind' | 'light' | 'dark' | 'almighty'
  | 'ailment' | 'recovery' | 'support' | 'special' | 'passive';

export const SKILL_ELEMENT_ORDER: readonly SkillElementId[] = [
  'phys', 'fire', 'ice', 'elec', 'wind', 'light', 'dark', 'almighty',
  'ailment', 'recovery', 'support', 'special', 'passive',
] as const;

/**
 * A persona's inheritance type. Each type may inherit only the skill elements
 * the inherit matrix allows (`public/data/p4g/inherit-matrix.json`).
 */
export type InheritTypeId =
  | 'phys' | 'fire' | 'ice' | 'elec' | 'wind' | 'light' | 'dark' | 'almighty'
  | 'ailment' | 'recovery' | 'support';

export const INHERIT_TYPE_ORDER: readonly InheritTypeId[] = [
  'phys', 'fire', 'ice', 'elec', 'wind', 'light', 'dark', 'almighty', 'ailment', 'recovery', 'support',
] as const;

export type Affinity = 'weak' | 'neutral' | 'resist' | 'null' | 'repel' | 'drain';

/** The two unlock toggles — upstream's `golden-demon-unlocks.json` categories. Both default on. */
export type UnlockGroup = 'story' | 'social-link';

export const UNLOCK_GROUPS: readonly UnlockGroup[] = ['story', 'social-link'] as const;

export type PersonaId = string;
export type SkillId = string;
export type ShadowId = string;

/** The five core stats, in P4G's St/Ma/En/Ag/Lu order. */
export interface Stats {
  readonly strength: number;
  readonly magic: number;
  readonly endurance: number;
  readonly agility: number;
  readonly luck: number;
}
