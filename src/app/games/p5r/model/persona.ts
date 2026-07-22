import type {
  Affinity,
  ArcanaId,
  ElementId,
  InheritTypeId,
  PersonaId,
  SkillId,
  Stats,
  TraitId,
  UnlockGroup,
} from './ids';

/**
 * How a persona comes by a skill or trait.
 *
 * §5 models this as `level: number | 'innate'`, which cannot represent the
 * `≥ 120` sentinels upstream uses for acquisitions that are not level-ups —
 * `Fa` (Fusion Alarm itemization), `Tk` (negotiation) and `C1`–`Cy` (party
 * Confidant ranks and the third awakening). A discriminated union covers all
 * three cases without an in-band sentinel.
 */
export type Acquisition =
  | { readonly kind: 'innate'; readonly order: number }
  | { readonly kind: 'level'; readonly level: number }
  | { readonly kind: 'tag'; readonly tag: string };

export type LearnedSkill = { readonly skillId: SkillId } & Acquisition;

/**
 * A trait the persona can carry beyond its innate one. Every treasure demon
 * offers three; a party persona's third awakening (tag `Cy`) supplies one.
 */
export type LearnedTrait = { readonly traitId: TraitId } & Acquisition;

/**
 * The result of itemising a persona.
 *
 * `skillId` is set only when the result is a skill card — 236 of the 464
 * upstream `item`/`itemr` values are accessories or weapons instead, and those
 * keep their name on `item` with a null `skillId`.
 */
export interface Itemization {
  readonly normal: SkillId | null;
  readonly alarm: SkillId | null;
  readonly normalItem: string | null;
  readonly alarmItem: string | null;
}

export interface PersonaUnlock {
  readonly group: UnlockGroup;
  readonly condition: string;
}

export interface Persona {
  readonly id: PersonaId;
  readonly name: string;
  readonly arcana: ArcanaId;
  /** Base level. Compendium entries may register a higher one. */
  readonly level: number;
  readonly inheritType: InheritTypeId;
  readonly traitId: TraitId | null;
  readonly stats: Stats;
  /** Upstream `steps`. Null for party personas, which have no growth data. */
  readonly growth: Stats | null;
  /** Upstream `statsm` — level-99 maxima. Party personas only. */
  readonly maxStats: Stats | null;
  readonly affinities: Readonly<Record<ElementId, Affinity>>;
  readonly learnedSkills: readonly LearnedSkill[];
  readonly learnedTraits: readonly LearnedTrait[];
  readonly kind: 'normal' | 'special' | 'treasure' | 'party';
  readonly unlock: PersonaUnlock | null;
  /** Treasure-demon recruit location. */
  readonly prereq: string | null;
  readonly itemization: Itemization;
}
