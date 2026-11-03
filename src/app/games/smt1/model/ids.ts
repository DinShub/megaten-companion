/**
 * Shin Megami Tensei (PS1) controlled vocabularies.
 *
 * The contract between `scripts/import/smt1/` and the app: the importer's
 * vocabulary (`scripts/import/smt1/vocab.mjs`) emits exactly these members, and
 * its validation gate refuses anything else, so a value that reaches
 * `public/data/smt1/` is assignable here.
 */

export type RaceId =
  | 'deity' | 'megami'
  | 'tenma' | 'kishin' | 'femme' | 'vile'
  | 'tyrant' | 'yoma' | 'night' | 'fairy'
  | 'seraph' | 'divine' | 'fallen'
  | 'dragon' | 'snake' | 'drake'
  | 'avian' | 'flight' | 'raptor'
  | 'avatar' | 'holy' | 'beast' | 'wilder'
  | 'touki' | 'brute' | 'jirae' | 'jaki'
  | 'element'
  | 'haunt' | 'spirit' | 'undead'
  | 'foul'
  | 'therian' | 'messian' | 'gaean' | 'fiend'
  | 'machine';

/** Upstream's species order, each species' races in turn — also the game's compendium order. */
export const RACE_ORDER: readonly RaceId[] = [
  'deity', 'megami',
  'tenma', 'kishin', 'femme', 'vile',
  'tyrant', 'yoma', 'night', 'fairy',
  'seraph', 'divine', 'fallen',
  'dragon', 'snake', 'drake',
  'avian', 'flight', 'raptor',
  'avatar', 'holy', 'beast', 'wilder',
  'touki', 'brute', 'jirae', 'jaki',
  'element',
  'haunt', 'spirit', 'undead',
  'foul',
  'therian', 'messian', 'gaean', 'fiend',
  'machine',
] as const;

/** Upstream's thirteen species: the groups the chart and the triple chart work in. */
export type SpeciesId =
  | 'deities' | 'icons' | 'nethers' | 'aerials' | 'dragons' | 'avians' | 'beasts'
  | 'brutes' | 'elements' | 'spirits' | 'fouls' | 'humans' | 'machines';

/** The fourteen resistance axes, in upstream's `resistElems` order. */
export type ElementId =
  | 'sword' | 'gun' | 'fire' | 'ice' | 'elec' | 'force' | 'nerve'
  | 'expel' | 'death' | 'curse' | 'bind' | 'rush' | 'punch' | 'flying';

export const ELEMENT_ORDER: readonly ElementId[] = [
  'sword', 'gun', 'fire', 'ice', 'elec', 'force', 'nerve',
  'expel', 'death', 'curse', 'bind', 'rush', 'punch', 'flying',
] as const;

/** Skill elements: the resistance axes, then upstream's skill-only elements. */
export type SkillElementId = ElementId | 'almighty' | 'energy' | 'recovery' | 'support' | 'special';

export const SKILL_ELEMENT_ORDER: readonly SkillElementId[] = [
  ...ELEMENT_ORDER, 'almighty', 'energy', 'recovery', 'support', 'special',
] as const;

export type AffinityType = 'weak' | 'neutral' | 'resist' | 'null' | 'repel' | 'drain';

/**
 * One resistance. `percent` is the damage taken for resist, neutral and weak
 * (Shiva resists Gun at 37.5), and how much of the attack is stopped or returned
 * for null, repel and drain (100, or 50 for a half drain or repel).
 */
export interface Affinity {
  readonly type: AffinityType;
  readonly percent: number;
}

/** SMT1's two alignment axes. */
export type LightAxis = 'light' | 'neutral' | 'dark';
export type LawAxis = 'law' | 'neutral' | 'chaos';

export interface Alignment {
  readonly light: LightAxis;
  readonly law: LawAxis;
}

export type DemonId = string;
export type SkillId = string;

export interface Stats {
  readonly hp: number;
  readonly mp: number;
  readonly strength: number;
  readonly intelligence: number;
  readonly magic: number;
  readonly vitality: number;
  readonly agility: number;
  readonly luck: number;
}

/**
 * Upstream's eight combat values (`baseAtks`: CP, NoA, P.Atk, P.Hit, Def, Eva,
 * M.Atk, M.Hit). Upstream documents no meaning beyond the labels, so the app
 * shows them under those labels.
 */
export interface Combat {
  readonly cp: number;
  readonly noa: number;
  readonly physAttack: number;
  readonly physHit: number;
  readonly defense: number;
  readonly evasion: number;
  readonly magicAttack: number;
  readonly magicHit: number;
}
