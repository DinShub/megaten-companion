import type { ArcanaId, InheritElementId, InheritTypeId, PersonaId } from './ids';

/** Symmetric: `grid[a][b] === grid[b][a]`. Null ⇒ pairing impossible. */
export interface FusionChart {
  readonly grid: Readonly<Record<ArcanaId, Readonly<Record<ArcanaId, ArcanaId | null>>>>;
}

/** 2–6 named ingredients; identity matters, level does not (§6.2). */
export interface AdvancedRecipe {
  readonly resultId: PersonaId;
  readonly ingredientIds: readonly PersonaId[];
}

export interface AdvancedRecipes {
  readonly recipes: readonly AdvancedRecipe[];
  /**
   * The nine treasure demons. Upstream distinguishes them only by an empty
   * ingredient array in `roy-special-recipes.json` — there is no explicit flag.
   */
  readonly treasureIds: readonly PersonaId[];
}

/**
 * Rank offset applied within the partner's arcana when fusing with a treasure
 * demon (§6.1). Values in `{-2, -1, 1, 2}` — a treasure demon can shift a fusion
 * *downward*, which the UI must not present as an upgrade.
 */
export interface ElementChart {
  readonly offsets: Readonly<Record<ArcanaId, Readonly<Record<PersonaId, number>>>>;
}

/** `inheritMatrix[type][element]` — the §6.5 14 × 12 permission table. */
export type InheritMatrix = Readonly<
  Record<InheritTypeId, Readonly<Record<InheritElementId, boolean>>>
>;
