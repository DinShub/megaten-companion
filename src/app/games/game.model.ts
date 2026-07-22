import type { Routes } from '@angular/router';

/**
 * The multi-game seam (§9.2). Shared UI — the app shell, routing, the data
 * service — reads only this interface; nothing outside `games/<id>/` names a
 * specific game. Adding P4G means a new folder, new data, and a registry entry,
 * with no change to shared code.
 *
 * The seam is intentionally thin: interfaces and namespacing only. The fusion
 * engine factory (§9.2 sketch) is added here in Phase 5, against a real engine.
 */
export type GameFeature =
  | 'fusion'
  | 'compendium'
  | 'personas'
  | 'shadows'
  | 'skills'
  | 'classroom';

export interface GameDefinition {
  /** URL segment and registry key (the game's short id). */
  readonly id: string;
  /** Full display name for the title bar. */
  readonly title: string;
  /** Compact label for tight spots (toolbar brand, chips). */
  readonly shortTitle: string;
  /** Which feature areas this game supports; drives the nav. */
  readonly features: readonly GameFeature[];
  /** Dataset name → static asset path (relative, so a base-href deploy works). */
  readonly dataManifest: Readonly<Record<string, string>>;
  /** The game's own child routes, mounted by the app under `/<id>/*`. */
  readonly routes: Routes;
}
