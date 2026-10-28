/**
 * P4G fusion engine — public types. Like the other engines, everything under
 * `fusion/` is pure TypeScript: zero Angular, zero I/O. The Angular seam
 * (`pages/fusion/p4g-fusion.store.ts`) constructs the engine and threads a context.
 */
import type { LoadedP4gData } from '../data/game-data';
import type { ArcanaId, CompendiumEntry, PersonaId, SkillElementId, SkillId, UnlockGroup } from '../model';

/** The datasets the engine reads. */
export type FusionData = Pick<LoadedP4gData, 'personas' | 'skills' | 'fusionChart' | 'specialRecipes' | 'inheritMatrix'>;

export interface FusionContext {
  /** The protagonist's level; a result above it cannot be fused. */
  readonly protagonistLevel: number;
  /** When false, {@link FusionSuccess.blockedByLevel} is always false. */
  readonly enforceLevelCap: boolean;
  readonly unlockGroups: Readonly<Record<UnlockGroup, boolean>>;
  /** Registered personas — their recorded skills feed inheritance. */
  readonly compendium: ReadonlyMap<PersonaId, CompendiumEntry>;
}

/**
 * Which rule produced a result:
 *  - `normal`      — two arcana, chart lookup, level rounded up within the result arcana;
 *  - `same-arcana` — two personas of one arcana → a lower persona of that arcana;
 *  - `triangle`    — three personas: the other two's arcana × the highest-level one's;
 *  - `special`     — a fixed recipe of two or more personas, checked before every other rule.
 */
export type FusionPath = 'normal' | 'same-arcana' | 'triangle' | 'special';

export type FusionInvalidCode =
  | 'too-few-parents'
  | 'no-special-recipe' // four or more personas that are not a special recipe
  | 'unknown-persona'
  | 'duplicate-parents'
  | 'no-arcana-result' // the chart has no cell for these arcana
  | 'empty-arcana-pool' // no fusable persona of the result arcana fits
  | 'result-locked'; // a special result whose unlock group is switched off

export interface FusionSuccess {
  readonly ok: true;
  readonly resultId: PersonaId;
  readonly path: FusionPath;
  /** The level the rule aimed at: `(a + b) / 2 + 0.5`, `(a + b) / 2 + 1` or `(a + b + c) / 3 + 4.25`; null for specials. */
  readonly targetLevel: number | null;
  /** Triangle only: the arcana the two lower personas make, crossed with the highest one's. */
  readonly intermediateArcana: ArcanaId | null;
  /** Triangle only: the persona whose arcana leads the triangle chart lookup. */
  readonly leadId: PersonaId | null;
  /** The target overshot the arcana's top persona and was clamped to it (two-persona fusion only). */
  readonly clampedToCeiling: boolean;
  /** The result was one of the ingredients, so the next persona of the arcana was taken. */
  readonly bumped: boolean;
  /** Result base level exceeds the protagonist's, honouring `enforceLevelCap`. */
  readonly blockedByLevel: boolean;
}

export interface FusionInvalid {
  readonly ok: false;
  readonly code: FusionInvalidCode;
  readonly message: string;
}

export type FusionOutcome = FusionSuccess | FusionInvalid;

/** P4G personas carry at most eight skills. */
export const SKILL_SLOT_CAPACITY = 8;

export interface SkillEligibility {
  readonly skillId: SkillId;
  readonly eligible: boolean;
  readonly reason?: 'unique' | 'blocked-element' | 'already-known';
  /** For `blocked-element`: the skill element the result's inherit type refuses. */
  readonly blockingElement?: SkillElementId;
}

/** One way to produce a target (reverse fusion). */
export interface Recipe {
  readonly resultId: PersonaId;
  /** Two for normal and same-arcana pairs, three for triangles, two or more for specials. */
  readonly ingredientIds: readonly PersonaId[];
  readonly path: FusionPath;
}
