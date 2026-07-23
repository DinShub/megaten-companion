/**
 * The P5R fusion rules engine (§6, Phase 5). Pure TypeScript — zero Angular,
 * zero I/O. The Angular layer (Phase 6) constructs a {@link FusionEngine} from
 * the loaded datasets and threads a {@link FusionContext} built from settings and
 * the compendium.
 */
export { FusionEngine } from './engine';
export { canInherit, skillEligibility } from './inherit';
export { summonCost } from './summon-cost';
export { resolvePool } from './pool';
export { SKILL_SLOT_CAPACITY } from './types';
export type {
  FusionContext,
  FusionData,
  FusionInvalid,
  FusionInvalidCode,
  FusionOutcome,
  FusionPath,
  FusionSuccess,
  PoolMode,
  PoolMember,
  Recipe,
  ResolvedPool,
  SkillEligibility,
} from './types';
