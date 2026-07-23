/**
 * The P5R route finder (§7, Phase 7). Pure TypeScript — zero Angular, zero I/O,
 * like the fusion engine it drives. {@link findRoutes} runs inside a Web Worker
 * (`route-finder.worker.ts`); the Angular seam is `pages/fusion/route-finder.store.ts`.
 */
export { findRoutes } from './route-finder';
export {
  DEFAULT_LIMITS,
  DEFAULT_MAX_DEPTH,
  OBJECTIVES,
} from './types';
export type {
  Diagnostic,
  DiagnosticCode,
  Objective,
  Route,
  RouteLeaf,
  RouteNode,
  RouteRequest,
  RouteSearchLimits,
  RouteSearchResult,
  RouteStep,
  RouteWorkerRequest,
  RouteWorkerResponse,
  SkillAssignment,
  SkillVia,
} from './types';
