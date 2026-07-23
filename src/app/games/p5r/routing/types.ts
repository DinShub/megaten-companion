/**
 * Route finder — public types (§7, Phase 7, task 44).
 *
 * The route finder is the headline feature (§4.7.3): given a target persona and
 * zero or more desired skills, it returns a **ranked list of fusion trees**, each
 * annotated with per-step skill-carry plans, the three ranking metrics, ownership
 * badges, and typed gap diagnostics for any skill it could not deliver.
 *
 * Like `fusion/`, everything under `routing/` is **pure TypeScript** — zero
 * Angular, zero I/O. The pure search ({@link route-finder}) runs inside a Web
 * Worker (task 51) so a deep search never blocks a frame; the Angular seam
 * (`pages/fusion/route-finder.store.ts`) owns the worker lifecycle.
 */
import type { CardSource } from '../model';
import type { PersonaId, ShadowId, SkillId } from '../model/ids';
import type { FusionContext, FusionData, FusionPath } from '../fusion';

/** The three §7.3 ranking objectives, selectable per search. */
export type Objective = 'fewest-steps' | 'cheapest' | 'fewest-unowned';

export const OBJECTIVES: readonly Objective[] = [
  'fewest-steps',
  'cheapest',
  'fewest-unowned',
] as const;

/** A single route-finder query (§4.7.3 inputs; the pool/level/unlock inputs ride on {@link FusionContext}). */
export interface RouteRequest {
  readonly targetId: PersonaId;
  /** Desired skills the result must end up carrying. Empty ⇒ "just make it". */
  readonly skillIds: readonly SkillId[];
  readonly objective: Objective;
  /** Max fusion depth (default 3). Raisable, with a warning search time grows sharply. */
  readonly maxDepth: number;
}

// ---- the fusion tree --------------------------------------------------------

/**
 * A leaf of a route: a persona taken straight from the pool (§6.4) — owned
 * (a compendium re-summon) or, in `obtainable` mode, an unregistered persona at
 * or below the protagonist's level (an acquisition).
 */
export interface RouteLeaf {
  readonly kind: 'leaf';
  readonly personaId: PersonaId;
  /** Registered level when owned, else the persona's base level. */
  readonly level: number;
  /** In the compendium — a re-summon rather than a fresh acquisition (§7.2 step 1). */
  readonly owned: boolean;
  /** Re-summon cost (§6.8) — the `cheapest` objective sums these over the leaves. */
  readonly summonCost: number;
  /** Requested skills this leaf is the source of (assigned during skill routing). */
  readonly supplies: readonly SkillId[];
}

/**
 * An internal node: one fusion producing `resultId` from its children (two for
 * the normal/same/treasure paths, 2–6 for advanced).
 */
export interface RouteStep {
  readonly kind: 'fusion';
  readonly resultId: PersonaId;
  readonly path: FusionPath;
  readonly level: number;
  readonly children: readonly RouteNode[];
  /** Requested skills riding *through* this fusion — the §4.7.3 per-step carry plan. */
  readonly carries: readonly SkillId[];
}

export type RouteNode = RouteLeaf | RouteStep;

// ---- skill routing (§7.2 step 4, tasks 46–47) -------------------------------

/** How a requested skill reaches the target. */
export type SkillVia =
  | 'native' // the target learns it on its own at its level — no inheritance needed
  | 'inherited' // sourced at a leaf and carried up the chain, passing every inherit mask
  | 'card'; // a skill card teaches it directly, bypassing inherit restrictions (§6.6)

/** One requested skill's resolution against a route (§7.2 step 4). */
export interface SkillAssignment {
  readonly skillId: SkillId;
  readonly satisfied: boolean;
  /** How it was delivered; null when unsatisfied (see {@link diagnostic}). */
  readonly via: SkillVia | null;
  /** For `inherited`: the source leaf. For `native`: the target itself. */
  readonly sourcePersonaId?: PersonaId;
  /** For `card`: which of the three §6.6 card origins, and where it comes from. */
  readonly cardKind?: CardSource['kind'];
  readonly cardFrom?: PersonaId | ShadowId;
  /** Set only when unsatisfied — the typed reason (§7.4). */
  readonly diagnostic?: Diagnostic;
}

// ---- gap diagnostics (§7.4, task 49) ----------------------------------------

/** The six typed §7.4 reasons a skill (or the whole search) could not be delivered. */
export type DiagnosticCode =
  | 'NOT_INHERITABLE' // the skill is `unique: true`
  | 'INHERIT_TYPE_BLOCKED' // the result's inherit mask excludes the element, and no card exists
  | 'NO_SOURCE_IN_POOL' // nothing in the pool knows it
  | 'SLOT_OVERFLOW' // the target would exceed its 8-skill capacity (§6.5)
  | 'LEVEL_CAPPED' // a needed fusion sits above the protagonist's level (§6.3)
  | 'DEPTH_EXCEEDED'; // no route within the depth bound

export interface Diagnostic {
  readonly code: DiagnosticCode;
  /** The offending skill, when the diagnostic is per-skill. */
  readonly skillId?: SkillId;
  /** Human-readable, already naming the offending step and (where meaningful) the fix. */
  readonly message: string;
}

// ---- a ranked route ---------------------------------------------------------

export interface Route {
  readonly tree: RouteNode;
  /** Number of fusions (internal nodes) — the `fewest-steps` metric. */
  readonly steps: number;
  /** Total re-summon yen over the leaves (§6.8) — the `cheapest` metric. */
  readonly cost: number;
  /** Leaves not in the compendium — the `fewest-unowned` metric. */
  readonly unowned: number;
  /** One entry per requested skill, in request order. */
  readonly assignments: readonly SkillAssignment[];
  /** How many requested skills this route delivers. */
  readonly satisfiedCount: number;
  /** Every requested skill delivered — complete routes rank above partial ones (§7.2 step 6). */
  readonly complete: boolean;
  /** The diagnostics of the unsatisfied skills, lifted for convenient display. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * The full result of a search. `routes` are ranked (complete first, then by the
 * chosen objective); `diagnostics` at this level explain a *search-wide* failure
 * (target unfusable, nothing within depth). `incomplete` flags a budget/node-cap
 * cutoff — the best-so-far, never a silent truncation (§7.2 budget).
 */
export interface RouteSearchResult {
  readonly routes: readonly Route[];
  readonly diagnostics: readonly Diagnostic[];
  /** The search hit its wall-clock or node-cap budget and returned best-so-far. */
  readonly incomplete: boolean;
  /** More candidate routes existed than were returned (ranked out below the top N). */
  readonly truncated: boolean;
  readonly nodesExpanded: number;
  readonly elapsedMs: number;
}

/** Tuning knobs for the search, defaulted in {@link route-finder}. */
export interface RouteSearchLimits {
  /** Routes returned (§7.2 step 6 default 10). */
  readonly maxRoutes: number;
  /** Wall-clock budget in ms (§7.2 default 3000). */
  readonly timeBudgetMs: number;
  /** Hard cap on expansion operations, the companion to the wall clock. */
  readonly nodeCap: number;
}

export const DEFAULT_LIMITS: RouteSearchLimits = {
  maxRoutes: 10,
  timeBudgetMs: 3000,
  nodeCap: 200_000,
};

export const DEFAULT_MAX_DEPTH = 3;

// ---- worker protocol (task 51) ---------------------------------------------

/**
 * Main thread → worker. Carries the datasets so the worker owns its own engine;
 * `structuredClone` handles the plain data and the context's compendium `Map`
 * natively, so nothing needs hand-serialising.
 */
export interface RouteWorkerRequest {
  readonly reqId: number;
  readonly data: FusionData;
  readonly request: RouteRequest;
  readonly ctx: FusionContext;
}

/** Worker → main thread. */
export type RouteWorkerResponse =
  | { readonly reqId: number; readonly ok: true; readonly result: RouteSearchResult }
  | { readonly reqId: number; readonly ok: false; readonly error: string };
