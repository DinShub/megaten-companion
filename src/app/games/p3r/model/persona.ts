import type {
  Affinity,
  ArcanaId,
  ElementId,
  InheritTypeId,
  PersonaId,
  ShadowId,
  SkillId,
  Stats,
  UnlockGroup,
} from './ids';

/**
 * How a persona comes by a skill: innate (upstream order kept), learned at a
 * level, or a Theurgy it grants the protagonist while it is in the stock.
 */
export type Acquisition =
  | { readonly kind: 'innate'; readonly order: number }
  | { readonly kind: 'level'; readonly level: number }
  | { readonly kind: 'theurgy' };

export type LearnedSkill = { readonly skillId: SkillId } & Acquisition;

/**
 * How a persona is obtained:
 *  - `normal`  — the arcana chart (two-persona fusion) can produce it;
 *  - `special` — only by its fixed multi-persona recipe.
 */
export type PersonaKind = 'normal' | 'special';

export interface PersonaUnlock {
  readonly group: UnlockGroup;
  readonly condition: string;
}

/** The item a persona gives once it reaches `level`. */
export interface HeartItem {
  readonly name: string;
  readonly level: number;
}

export interface Persona {
  readonly id: PersonaId;
  readonly name: string;
  readonly arcana: ArcanaId;
  /** Base level. Compendium entries may register a higher one. */
  readonly level: number;
  readonly inheritType: InheritTypeId;
  readonly stats: Stats;
  readonly affinities: Readonly<Record<ElementId, Affinity>>;
  readonly learnedSkills: readonly LearnedSkill[];
  readonly kind: PersonaKind;
  readonly unlock: PersonaUnlock | null;
  readonly heartItem: HeartItem | null;
}

export interface ShadowDrop {
  readonly item: string;
  /** Drop rate, percent. */
  readonly chance: number;
}

export interface Shadow {
  readonly id: ShadowId;
  readonly name: string;
  /** Null for the few bosses upstream files under "Unknown". */
  readonly arcana: ArcanaId | null;
  /** Full Moon Operations, Elizabeth, the Reapers and other bosses (upstream's `boss` flag). */
  readonly boss: boolean;
  readonly level: number;
  readonly hp: number;
  readonly sp: number;
  readonly stats: Stats;
  readonly exp: number;
  readonly affinities: Readonly<Record<ElementId, Affinity>>;
  readonly skillIds: readonly SkillId[];
  readonly drops: readonly ShadowDrop[];
  /** Where it appears, as upstream words it; null when unrecorded. */
  readonly area: string | null;
}
