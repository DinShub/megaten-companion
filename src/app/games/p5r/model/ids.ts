/**
 * P5R controlled vocabularies (§5).
 *
 * These unions are the contract between `scripts/import/` and the app: the
 * importer's mirror validator (`scripts/import/schema.mjs`) enforces exactly
 * these members, so a value that reaches the committed JSON is assignable here.
 */

export type ArcanaId =
  | 'fool' | 'magician' | 'priestess' | 'empress' | 'emperor' | 'hierophant'
  | 'lovers' | 'chariot' | 'justice' | 'hermit' | 'fortune' | 'strength'
  | 'hanged' | 'death' | 'temperance' | 'devil' | 'tower' | 'star'
  | 'moon' | 'sun' | 'judgement' | 'faith' | 'councillor' | 'world';

/** Arcana in upstream's chart order, which is also the game's display order. */
export const ARCANA_ORDER: readonly ArcanaId[] = [
  'fool', 'magician', 'priestess', 'empress', 'emperor', 'hierophant',
  'lovers', 'chariot', 'justice', 'hermit', 'fortune', 'strength',
  'hanged', 'death', 'temperance', 'devil', 'tower', 'star',
  'moon', 'sun', 'judgement', 'faith', 'councillor', 'world',
] as const;

/** Affinity axes, in fixed display order. */
export type ElementId =
  | 'phys' | 'gun' | 'fire' | 'ice' | 'elec' | 'wind' | 'psy' | 'nuke' | 'bless' | 'curse';

export const ELEMENT_ORDER: readonly ElementId[] = [
  'phys', 'gun', 'fire', 'ice', 'elec', 'wind', 'psy', 'nuke', 'bless', 'curse',
] as const;

/** Skill classification — a superset of ElementId. */
export type SkillElementId = ElementId | 'almighty' | 'ailment' | 'support' | 'healing' | 'passive';

/** The 12 axes an inherit type grants or denies (§6.5). */
export type InheritElementId =
  | 'phys' | 'gun' | 'fire' | 'ice' | 'elec' | 'wind'
  | 'psy' | 'nuke' | 'bless' | 'curse' | 'ailment' | 'healing';

export const INHERIT_ELEMENT_ORDER: readonly InheritElementId[] = [
  'phys', 'gun', 'fire', 'ice', 'elec', 'wind',
  'psy', 'nuke', 'bless', 'curse', 'ailment', 'healing',
] as const;

export type InheritTypeId =
  | 'phys' | 'fire' | 'ice' | 'elec' | 'wind' | 'psy' | 'nuke'
  | 'bless' | 'curse' | 'ailment' | 'healing' | 'support' | 'almighty' | 'none';

export const INHERIT_TYPE_ORDER: readonly InheritTypeId[] = [
  'phys', 'fire', 'ice', 'elec', 'wind', 'psy', 'nuke',
  'bless', 'curse', 'ailment', 'healing', 'support', 'almighty', 'none',
] as const;

export type Affinity = 'weak' | 'neutral' | 'resist' | 'null' | 'repel' | 'drain';

/**
 * Ailment axes. Not enumerated in §5; taken from upstream's `ailmentElems`,
 * whose order matches the packed-string indices `[2,3,4,8,9,10,12,17,18,19]`.
 * `other` covers the residual flag upstream sets only when every ailment is
 * resisted.
 */
export type AilmentId =
  | 'burn' | 'freeze' | 'shock' | 'hama' | 'mudo'
  | 'dizzy' | 'fear' | 'despair' | 'brainwash' | 'other';

export const AILMENT_ORDER: readonly AilmentId[] = [
  'burn', 'freeze', 'shock', 'hama', 'mudo',
  'dizzy', 'fear', 'despair', 'brainwash', 'other',
] as const;

/** The three unlock toggles (§15). DLC defaults off, the other two on. */
export type UnlockGroup = 'story' | 'confidant' | 'dlc';

export const UNLOCK_GROUPS: readonly UnlockGroup[] = ['story', 'confidant', 'dlc'] as const;

export type PersonaId = string;
export type SkillId = string;
export type TraitId = string;
export type ShadowId = string;

export interface Stats {
  strength: number;
  magic: number;
  endurance: number;
  agility: number;
  luck: number;
}
