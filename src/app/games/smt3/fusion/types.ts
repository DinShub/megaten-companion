/**
 * Nocturne fusion engine — public types. Like the P5R engine, everything under
 * `fusion/` is pure TypeScript: zero Angular, zero I/O. The Angular seam
 * (`pages/fusion/fusion.store.ts`) constructs the engine and threads a context.
 */
import type { LoadedSmt3Data } from '../data/game-data';
import type { CompendiumEntry, DemonId, InheritCategoryId, RaceId, SkillId, UnlockGroup } from '../model';

/** The datasets the engine reads. */
export type FusionData = Pick<LoadedSmt3Data, 'demons' | 'skills' | 'fusionChart' | 'elementChart' | 'specialRecipes'>;

export interface FusionContext {
  /** The Demi-fiend's level; a result above it cannot be fused. */
  readonly protagonistLevel: number;
  /** When false, {@link FusionSuccess.blockedByLevel} is always false. */
  readonly enforceLevelCap: boolean;
  readonly unlockGroups: Readonly<Record<UnlockGroup, boolean>>;
  /** Registered demons — their recorded skills feed inheritance. */
  readonly compendium: ReadonlyMap<DemonId, CompendiumEntry>;
}

/**
 * Which rule produced a result:
 *  - `normal`    — two races, chart lookup, level rounded up within the result race;
 *  - `same-race` — two demons of one race → that race's Element;
 *  - `element`   — an Element shifts its partner one rank within the partner's race;
 *  - `mitama`    — two different Elements → a Mitama;
 *  - `special`   — a fixed two-demon recipe, checked before every other rule.
 */
export type FusionPath = 'normal' | 'same-race' | 'element' | 'mitama' | 'special';

export type FusionInvalidCode =
  | 'too-few-parents'
  | 'too-many-parents'
  | 'unknown-demon'
  | 'duplicate-parents'
  | 'no-race-result' // the chart has no cell for these races (or no element on the diagonal)
  | 'empty-race-pool' // the result race has no fusable demon (all gated off)
  | 'element-no-shift' // the partner's race doesn't react with this element
  | 'element-out-of-range' // the rank shift falls off the end of the race
  | 'mitama-ingredient' // a Mitama has no chart result with another demon
  | 'result-locked'; // a special result whose unlock group is switched off

export interface FusionSuccess {
  readonly ok: true;
  readonly resultId: DemonId;
  readonly path: FusionPath;
  /** `(a + b) / 2 + 1` for the normal path; null otherwise. */
  readonly targetLevel: number | null;
  /** The target overshot the race's top demon and was clamped to it. */
  readonly clampedToCeiling: boolean;
  /** The result was one of the ingredients, so the next demon up the race was taken. */
  readonly bumped: boolean;
  /** Result base level exceeds the Demi-fiend's, honouring `enforceLevelCap`. */
  readonly blockedByLevel: boolean;
  /**
   * Deathstone Fiends whose race matches this result's race: fusing this pair
   * while holding a Deathstone in the Fiend's Kagutsuchi phase yields the Fiend
   * instead. Empty for non-normal paths.
   */
  readonly deathstoneIds: readonly DemonId[];
  /** Upstream's cursed-chart race for this race pair (reference only); null when none. */
  readonly cursedRace: RaceId | null;
}

export interface FusionInvalid {
  readonly ok: false;
  readonly code: FusionInvalidCode;
  readonly message: string;
}

export type FusionOutcome = FusionSuccess | FusionInvalid;

/**
 * Total skill capacity. The game's per-fusion inheritance count is not
 * modelled upstream, so — as for P5R — only the 8-slot capacity is enforced and
 * the UI footnotes it rather than inventing a rule.
 */
export const SKILL_SLOT_CAPACITY = 8;

export interface SkillEligibility {
  readonly skillId: SkillId;
  readonly eligible: boolean;
  readonly reason?: 'unique' | 'blocked-category' | 'already-known';
  /** For `blocked-category`: the body-type category the result lacks. */
  readonly blockingCategory?: InheritCategoryId;
}

/** One way to produce a target (reverse fusion). */
export interface Recipe {
  readonly resultId: DemonId;
  readonly ingredientIds: readonly [DemonId, DemonId];
  readonly path: FusionPath;
}
