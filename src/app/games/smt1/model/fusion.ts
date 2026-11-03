import type { DemonId, RaceId, SpeciesId } from './ids';

/**
 * A pair-chart cell: a race; a species (any race of it: the result is looked
 * up across the species' light and neutral races together); or, on the
 * diagonal, the element two demons of one race make.
 */
export type ChartResult =
  | { readonly kind: 'race'; readonly id: RaceId }
  | { readonly kind: 'species'; readonly id: SpeciesId }
  | { readonly kind: 'element'; readonly id: DemonId };

/** The pair chart, expanded to a full symmetric map. A missing cell is no result. */
export interface FusionChart {
  /** The 22 races the chart covers (none of them dark), in chart order. */
  readonly races: readonly RaceId[];
  readonly normal: Readonly<Partial<Record<RaceId, Readonly<Partial<Record<RaceId, ChartResult>>>>>>;
}

/**
 * The triple chart, in species. Each row is a pair of different species (the two
 * lower demons), each column the species of the highest-level demon.
 */
export interface TripleChart {
  readonly species: readonly SpeciesId[];
  readonly rows: readonly {
    readonly pair: readonly [SpeciesId, SpeciesId];
    readonly results: Readonly<Partial<Record<SpeciesId, RaceId>>>;
  }[];
}

/** Element fusion: a demon of a listed race fused with an element moves this many ranks within its race. */
export interface ElementChart {
  readonly elementIds: readonly DemonId[];
  readonly races: readonly RaceId[];
  readonly shifts: Readonly<Partial<Record<RaceId, Readonly<Record<DemonId, number>>>>>;
}

export interface SpecialRecipe {
  readonly resultId: DemonId;
  /** Two or three named demons. */
  readonly ingredientIds: readonly DemonId[];
}

export interface SpecialRecipes {
  readonly recipes: readonly SpecialRecipe[];
  /** A condition upstream records as text only (Corpses: "Undead x Undead x Undead"). */
  readonly prereqs: readonly { readonly resultId: DemonId; readonly text: string }[];
}
