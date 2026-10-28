import type { ArcanaId, InheritTypeId, PersonaId, SkillElementId } from './ids';

type ArcanaGrid = Readonly<Record<string, Readonly<Partial<Record<ArcanaId, ArcanaId>>>>>;

/**
 * Golden's two arcana charts, each expanded to a symmetric map
 * (`grid[a][b] === grid[b][a]`; a missing cell means no result).
 */
export interface FusionChart {
  /** The 23 arcana the charts cover (World is special-only), in chart order. */
  readonly arcana: readonly ArcanaId[];
  /** Two-persona fusion. The diagonal is empty: same-arcana fusion has its own rule. */
  readonly normal: ArcanaGrid;
  /**
   * Triangle fusion: the highest-level persona's arcana × the arcana the other
   * two make together. The diagonal maps each arcana to itself.
   */
  readonly triple: ArcanaGrid;
}

/** A fixed recipe: all of these personas at once make the result. */
export interface SpecialRecipe {
  readonly resultId: PersonaId;
  readonly ingredientIds: readonly PersonaId[];
}

/** inheritType → skill element → may a persona of that type inherit it. */
export type InheritMatrix = Readonly<Record<InheritTypeId, Readonly<Record<SkillElementId, boolean>>>>;
