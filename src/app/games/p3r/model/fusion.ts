import type { ArcanaId, InheritTypeId, PersonaId, SkillElementId } from './ids';

type ArcanaGrid = Readonly<Record<string, Readonly<Partial<Record<ArcanaId, ArcanaId>>>>>;

/**
 * Reload's arcana chart, expanded to a symmetric map
 * (`normal[a][b] === normal[b][a]`; a missing cell means no result). Reload has
 * no triangle (three-persona) chart.
 */
export interface FusionChart {
  /** The 22 arcana the chart covers, in chart order. */
  readonly arcana: readonly ArcanaId[];
  /** Two-persona fusion. The diagonal is empty: same-arcana fusion has its own rule. */
  readonly normal: ArcanaGrid;
}

/** A fixed recipe: all of these personas at once make the result. */
export interface SpecialRecipe {
  readonly resultId: PersonaId;
  readonly ingredientIds: readonly PersonaId[];
}

/** inheritType → skill element → may a persona of that type inherit it. */
export type InheritMatrix = Readonly<Record<InheritTypeId, Readonly<Record<SkillElementId, boolean>>>>;
