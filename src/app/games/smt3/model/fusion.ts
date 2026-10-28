import type { DemonId, RaceId } from './ids';

type RaceGrid = Readonly<Record<string, Readonly<Partial<Record<RaceId, RaceId>>>>>;

/**
 * The two-race fusion chart, expanded to a full symmetric map
 * (`normal[a][b] === normal[b][a]`; a missing cell means no result).
 */
export interface FusionChart {
  /** The 30 races the chart covers, in chart order. */
  readonly races: readonly RaceId[];
  readonly normal: RaceGrid;
  /** Same-race fusion → the Element demon it yields (the chart's diagonal). */
  readonly sameRace: Readonly<Partial<Record<RaceId, DemonId>>>;
  /**
   * Upstream's cursed chart (Full Kagutsuchi). Shipped upstream but not wired
   * into upstream's own calculator — reference only, and labelled as such.
   */
  readonly cursed: RaceGrid;
}

/** An element ± a demon shifts it one rank within its race; two elements make a Mitama. */
export interface ElementChart {
  readonly elementIds: readonly DemonId[];
  /** The races element fusion applies to. */
  readonly races: readonly RaceId[];
  /** `shifts[race][elementId]` — +1 up a rank, −1 down. */
  readonly shifts: Readonly<Partial<Record<RaceId, Readonly<Record<DemonId, number>>>>>;
  readonly mitama: readonly { readonly resultId: DemonId; readonly ingredientIds: readonly [DemonId, DemonId] }[];
}

export interface SpecialRecipe {
  readonly resultId: DemonId;
  readonly ingredientIds: readonly [DemonId, DemonId];
}

/**
 * A Deathstone Fiend: any fusion that would yield `race`, made while holding a
 * Deathstone during the right Kagutsuchi phase (the demon's unlock condition
 * names the phase), produces the Fiend instead.
 */
export interface DeathstoneRecipe {
  readonly resultId: DemonId;
  readonly race: RaceId;
}

export interface SpecialRecipes {
  readonly pairs: readonly SpecialRecipe[];
  readonly deathstone: readonly DeathstoneRecipe[];
}
