/**
 * The P3R fusion rules engine. Pure TypeScript — zero Angular, zero I/O.
 */
export { FusionEngine, buildResultsByArcana, nativeSkills, summonCost, unlockAllowed } from './engine';
export { SKILL_SLOT_CAPACITY } from './types';
export type {
  FusionContext,
  FusionData,
  FusionInvalid,
  FusionInvalidCode,
  FusionOutcome,
  FusionPath,
  FusionSuccess,
  Recipe,
  SkillEligibility,
} from './types';
