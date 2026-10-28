/**
 * SMT III: Nocturne controlled vocabularies.
 *
 * The contract between `scripts/import/smt3/` and the app: the importer's
 * vocabulary (`scripts/import/smt3/vocab.mjs`) emits exactly these members, and
 * its validation gate refuses anything else, so a value that reaches
 * `public/data/smt3/` is assignable here.
 */

export type RaceId =
  | 'deity' | 'megami' | 'fury' | 'lady' | 'kishin' | 'holy' | 'yoma' | 'fairy'
  | 'divine' | 'fallen' | 'snake' | 'beast' | 'jirae' | 'brute' | 'femme' | 'vile'
  | 'tyrant' | 'night' | 'wilder' | 'haunt' | 'foul' | 'seraph' | 'wargod' | 'genma'
  | 'dragon' | 'avatar' | 'avian' | 'raptor' | 'entity' | 'fiend' | 'element' | 'mitama'
  | 'broker' | 'd-fiend' | 'summoner';

/** Upstream's race order, which is also the game's compendium order. */
export const RACE_ORDER: readonly RaceId[] = [
  'deity', 'megami', 'fury', 'lady', 'kishin', 'holy', 'yoma', 'fairy',
  'divine', 'fallen', 'snake', 'beast', 'jirae', 'brute', 'femme', 'vile',
  'tyrant', 'night', 'wilder', 'haunt', 'foul', 'seraph', 'wargod', 'genma',
  'dragon', 'avatar', 'avian', 'raptor', 'entity', 'fiend', 'element', 'mitama',
  'broker', 'd-fiend', 'summoner',
] as const;

/** The ten affinity axes, in upstream's `resistElems` order. */
export type ElementId =
  | 'phys' | 'fire' | 'ice' | 'elec' | 'force' | 'expel' | 'death' | 'mind' | 'nerve' | 'curse';

export const ELEMENT_ORDER: readonly ElementId[] = [
  'phys', 'fire', 'ice', 'elec', 'force', 'expel', 'death', 'mind', 'nerve', 'curse',
] as const;

/** Upstream's four ailment-resist axes. */
export type AilmentId = 'freeze' | 'shock' | 'hama' | 'mudo';

export const AILMENT_ORDER: readonly AilmentId[] = ['freeze', 'shock', 'hama', 'mudo'] as const;

/** Skill classification. `special` covers field/summon/scan utilities. */
export type SkillElementId =
  | 'phys' | 'fire' | 'ice' | 'elec' | 'force' | 'almighty' | 'expel' | 'death'
  | 'curse' | 'nerve' | 'mind' | 'healing' | 'support' | 'special' | 'passive' | 'talk';

export const SKILL_ELEMENT_ORDER: readonly SkillElementId[] = [
  'phys', 'fire', 'ice', 'elec', 'force', 'almighty', 'expel', 'death',
  'curse', 'nerve', 'mind', 'healing', 'support', 'special', 'passive', 'talk',
] as const;

/**
 * The nine body-type inheritance categories. A demon may inherit a gated skill
 * only if its own mask includes the skill's category; every other skill is
 * open to all (upstream's `hasNonelemInheritance`).
 */
export type InheritCategoryId =
  | 'thrust' | 'claw' | 'bite' | 'weapon' | 'mouth' | 'wings' | 'eye' | 'talk' | 'maiden';

export const INHERIT_ORDER: readonly InheritCategoryId[] = [
  'thrust', 'claw', 'bite', 'weapon', 'mouth', 'wings', 'eye', 'talk', 'maiden',
] as const;

export type Affinity = 'weak' | 'neutral' | 'resist' | 'null' | 'repel' | 'drain';

/** The three unlock toggles — upstream's `demon-unlocks.json` categories. All default on. */
export type UnlockGroup = 'story' | 'fiend' | 'amala';

export const UNLOCK_GROUPS: readonly UnlockGroup[] = ['story', 'fiend', 'amala'] as const;

export type DemonId = string;
export type SkillId = string;
export type MagatamaId = string;

export interface Stats {
  readonly hp: number;
  readonly mp: number;
  readonly strength: number;
  readonly magic: number;
  readonly vitality: number;
  readonly agility: number;
  readonly luck: number;
}

/** Magatama grant only the five core stats. */
export type CoreStats = Omit<Stats, 'hp' | 'mp'>;
