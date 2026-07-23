/**
 * Fusion rules engine — public types (§6.9, Phase 5).
 *
 * This module and everything else under `fusion/` is **pure TypeScript**: zero
 * Angular imports, zero I/O. It takes the loaded §5 datasets plus a
 * {@link FusionContext} and returns plain results. The Angular layer (Phase 6)
 * wraps it; the engine itself never reaches for a service or the DOM, which is
 * what makes the golden suite (§12, task 40) cheap and deterministic.
 */
import type { LoadedGameData } from '../data/game-data';
import type { CompendiumEntry } from '../model';
import type { InheritElementId, PersonaId, SkillId, UnlockGroup } from '../model/ids';

/** The datasets the engine reads. A narrow slice of {@link LoadedGameData}. */
export type FusionData = Pick<
  LoadedGameData,
  'personas' | 'skills' | 'fusionChart' | 'advancedRecipes' | 'elementChart' | 'inheritMatrix'
>;

export type PoolMode = 'compendium' | 'obtainable';

/** Inputs that vary per search, mirroring the §6.9 sketch. */
export interface FusionContext {
  readonly pool: PoolMode;
  readonly protagonistLevel: number;
  /** When false, {@link FusionSuccess.blockedByLevel} is always false (§6.3). */
  readonly enforceLevelCap: boolean;
  readonly unlockGroups: Readonly<Record<UnlockGroup, boolean>>;
  readonly alarm: boolean;
  /** Registered personas, keyed by id — the compendium pool and skill sources. */
  readonly compendium: ReadonlyMap<PersonaId, CompendiumEntry>;
}

/** Which of the four §6.1/§6.2 rules produced a result. */
export type FusionPath = 'different-arcana' | 'same-arcana' | 'treasure' | 'advanced';

/**
 * Why a pairing produces nothing. These map onto the §4.7.1 invalidity messages
 * the forward calculator surfaces ("same persona twice", "no arcana result", …).
 */
export type FusionInvalidCode =
  | 'too-few-parents' // fewer than two ingredients
  | 'unknown-persona' // an id absent from the dataset
  | 'duplicate-parents' // the same persona (species) used twice — §6.1 same-arcana rule 5
  | 'party-ingredient' // a party persona can never be fusion material — §6.4
  | 'no-arcana-result' // fusionChart.grid[a][b] === null
  | 'empty-arcana-pool' // no fusable persona in the result arcana (all gated off)
  | 'treasure-out-of-range' // the element-chart shift fell outside the arcana list
  | 'treasure-pair' // two treasure demons — unsupported (§6.1 leaves the rule unstated)
  | 'treasure-partner-unfusable' // the non-treasure parent is not a fusable result in its arcana
  | 'no-advanced-recipe'; // more than two ingredients but no exact recipe match

export interface FusionSuccess {
  readonly ok: true;
  readonly resultId: PersonaId;
  readonly path: FusionPath;
  /** Computed target level for the normal paths; null for advanced/treasure. */
  readonly targetLevel: number | null;
  /** True when the arcana ceiling clamped a normal result (§6.1 different-arcana step 4). */
  readonly clampedToCeiling: boolean;
  /**
   * Result base level exceeds the protagonist's, honouring `enforceLevelCap`
   * (§6.3). The UI reads `resultId`'s base level to phrase "available at level N";
   * the route finder treats a blocked fusion as unusable.
   */
  readonly blockedByLevel: boolean;
}

export interface FusionInvalid {
  readonly ok: false;
  readonly code: FusionInvalidCode;
  readonly message: string;
}

export type FusionOutcome = FusionSuccess | FusionInvalid;

/**
 * A persona's total skill capacity (§6.5). The real game caps *inherited* skills
 * at 2–4 by result level, but that rule is modelled nowhere upstream and unsourced,
 * so per principle 5 we do **not** invent it (§14 Q2). The only cap the engine
 * applies is this total capacity; a fusion's selectable skills fill the slots left
 * after the result's native skills. Consequence: the calculator may show a set
 * slightly more generous than one fusion delivers — the UI says so in a footnote.
 * Adding a real cap later is a one-constant change here.
 */
export const SKILL_SLOT_CAPACITY = 8;

/** One skill's inheritance verdict for a given result persona (§6.5, task 37). */
export interface SkillEligibility {
  readonly skillId: SkillId;
  readonly eligible: boolean;
  /** Set only when ineligible. */
  readonly reason?: 'unique' | 'blocked-element';
  /** For `blocked-element`: the axis the result's inherit type rejects. */
  readonly blockingElement?: InheritElementId;
}

/** A single way to produce a target persona (reverse fusion, §4.7.2, task 39). */
export interface Recipe {
  readonly resultId: PersonaId;
  /** Two ids for normal/same/treasure, 2–6 for advanced. */
  readonly ingredientIds: readonly PersonaId[];
  readonly path: FusionPath;
}

/** A persona available as raw fusion material in a resolved pool (§6.4, task 31). */
export interface PoolMember {
  readonly personaId: PersonaId;
  /** Registered level when owned, else the persona's base level. */
  readonly level: number;
  /** In the compendium — costs a re-summon, not an acquisition (§6.4). */
  readonly owned: boolean;
}

export interface ResolvedPool {
  readonly mode: PoolMode;
  readonly members: readonly PoolMember[];
  readonly byId: ReadonlyMap<PersonaId, PoolMember>;
}
