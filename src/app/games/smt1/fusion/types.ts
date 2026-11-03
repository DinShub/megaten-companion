/**
 * SMT1 fusion engine — public types. Like the other engines, everything under
 * `fusion/` is pure TypeScript: zero Angular, zero I/O. The Angular seam
 * (`pages/fusion/smt1-fusion.store.ts`) constructs the engine and threads a context.
 */
import type { LoadedSmt1Data } from '../data/game-data';
import type { DemonId, RaceId, SpeciesId } from '../model';

/** The datasets the engine reads. */
export type FusionData = Pick<LoadedSmt1Data, 'demons' | 'races' | 'fusionChart' | 'tripleChart' | 'elementChart' | 'specialRecipes'>;

export interface FusionContext {
  /** The hero's level; a result above it is flagged. */
  readonly heroLevel: number;
  /** When false, {@link FusionSuccess.blockedByLevel} is always false. */
  readonly enforceLevelCap: boolean;
}

/**
 * Which rule produced a result:
 *  - `special`   — a fixed recipe of two or three named demons, checked first;
 *  - `element`   — an element moves its partner up or down within the partner's race;
 *  - `dark`      — a dark-race demon moves a light or neutral partner within its race,
 *                  by the 7 / 5 / 3 rule on their levels;
 *  - `same-race` — two demons of one race make that race's element;
 *  - `normal`    — the chart gives a race; the result is the first of that race at or
 *                  above `(a + b) / 2 + 1.5`;
 *  - `species`   — the chart gives a species; the same level rule over its races together;
 *  - `triple`    — three demons: the triple chart gives a race from the highest demon's
 *                  species and the other two's species pair.
 */
export type FusionPath = 'special' | 'element' | 'dark' | 'same-race' | 'normal' | 'species' | 'triple';

export type FusionInvalidCode =
  | 'too-few-parents'
  | 'too-many-parents'
  | 'unknown-demon'
  | 'duplicate-parents'
  | 'no-race-result' // the chart has no cell for these races
  | 'empty-race-pool' // the result race has no fusable demon
  | 'element-pair' // two elements make nothing unless a special recipe says so
  | 'element-no-shift' // the partner's race doesn't react with this element
  | 'element-out-of-range' // the rank shift falls off the end of the race
  | 'dark-pair' // two dark demons have no rule
  | 'dark-no-rule' // the 7 / 5 / 3 rule doesn't apply to these levels
  | 'triple-tie' // the triple rule needs one demon strictly higher than the other two
  | 'no-triple-result' // the triple chart has no cell for these species
  | 'result-is-ingredient'; // the only candidate is one of the ingredients

export interface FusionSuccess {
  readonly ok: true;
  readonly resultId: DemonId;
  readonly path: FusionPath;
  /** The level the rule aims at (normal, species, triple); null otherwise. */
  readonly targetLevel: number | null;
  /** The target overshot the race's top demon and was clamped to it (pair rules only). */
  readonly clampedToCeiling: boolean;
  /** The first candidate was an ingredient, so the next one up was taken. */
  readonly bumped: boolean;
  /** Result level exceeds the hero's, honouring `enforceLevelCap`. */
  readonly blockedByLevel: boolean;
  /** What the chart alone says for this pair, when a special recipe overrides it. */
  readonly chartSays: { readonly kind: 'race'; readonly id: RaceId } | { readonly kind: 'species'; readonly id: SpeciesId } | { readonly kind: 'element'; readonly id: DemonId } | null;
}

export interface FusionInvalid {
  readonly ok: false;
  readonly code: FusionInvalidCode;
  readonly message: string;
}

export type FusionOutcome = FusionSuccess | FusionInvalid;

/** One way to produce a target (reverse fusion). */
export interface Recipe {
  readonly resultId: DemonId;
  /** Two ingredients, or three for triple and three-demon special recipes. */
  readonly ingredientIds: readonly DemonId[];
  readonly path: FusionPath;
}
