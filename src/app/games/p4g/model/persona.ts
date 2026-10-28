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

/** Innate skills keep their upstream order; the rest are learned at a level. */
export type Acquisition =
  | { readonly kind: 'innate'; readonly order: number }
  | { readonly kind: 'level'; readonly level: number };

export type LearnedSkill = { readonly skillId: SkillId } & Acquisition;

/**
 * How a persona is obtained:
 *  - `normal`  — the arcana charts (two- or three-persona fusion) can produce it;
 *  - `special` — only by its fixed multi-persona recipe.
 */
export type PersonaKind = 'normal' | 'special';

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
  readonly stats: Stats;
  readonly affinities: Readonly<Record<ElementId, Affinity>>;
  readonly learnedSkills: readonly LearnedSkill[];
  readonly kind: PersonaKind;
  readonly unlock: PersonaUnlock | null;
}

export interface ShadowDrop {
  readonly item: string;
  /** Drop rate, percent. */
  readonly chance: number;
}

export interface Shadow {
  readonly id: ShadowId;
  readonly name: string;
  readonly arcana: ArcanaId;
  /** Dungeon bosses and Shadow Selves (upstream's ` P` arcana suffix). */
  readonly boss: boolean;
  readonly level: number;
  readonly hp: number;
  readonly sp: number;
  readonly stats: Stats;
  readonly exp: number;
  readonly yen: number;
  readonly affinities: Readonly<Record<ElementId, Affinity>>;
  readonly skillIds: readonly SkillId[];
  readonly drops: readonly ShadowDrop[];
  /** Where it appears, as upstream words it; null when unrecorded. */
  readonly area: string | null;
}
