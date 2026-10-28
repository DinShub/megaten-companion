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
  | 'classroom'
  | 'demons'
  | 'magatama';

/**
 * A primitive colour ramp from the base theme palette, naming the game's primary
 * accent (§4.8). Each SMT game has an iconic colour — P5R red, P3R blue — so the
 * accent is a per-game property here rather than a global constant. The theme
 * layer expands the name into the `--p-primary-*` ramp; nothing else needs to
 * know the concrete colour.
 *
 * `ember` is the one app-defined ramp (a burnt, dark orange — see app-preset);
 * the rest are Lara's base primitives.
 */
export type PrimaryColor =
  | 'ember'
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'emerald'
  | 'teal'
  | 'cyan'
  | 'sky'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'fuchsia'
  | 'pink'
  | 'rose';

/**
 * A game's whole visual language — typefaces, surfaces, panel shapes, motion —
 * not just its colour. Each game gets a skin designed for it; adding a game means
 * designing a new skin (a `theme/skins/` entry plus its `styles/skins/` partial).
 *
 * - `calling-card` — graphic pop: cut-corner paper panels, hard accent shadows,
 *   slanted tabs, halftone, ransom-letter titles (P5R).
 * - `comp` — the demon-summoning program: accent phosphor on a dark terminal,
 *   box-drawn panels, monospace data, a terse system voice (Nocturne).
 */
export type GameSkin = 'calling-card' | 'comp';

/** A game's visual identity (§4.8). */
export interface GameTheme {
  /** Drives the PrimeNG primary ramp and every `--p-primary-*` accent. */
  readonly primary: PrimaryColor;
  /** The skin the whole app wears while this game is active. */
  readonly skin: GameSkin;
}

export interface GameDefinition {
  /** URL segment and registry key (the game's short id). */
  readonly id: string;
  /** Full display name for the title bar. */
  readonly title: string;
  /** Compact label for tight spots (toolbar brand, chips). */
  readonly shortTitle: string;
  /** Which feature areas this game supports; drives the nav. */
  readonly features: readonly GameFeature[];
  /** The game's accent colour, applied when it becomes the active game. */
  readonly theme: GameTheme;
  /** Dataset name → static asset path (relative, so a base-href deploy works). */
  readonly dataManifest: Readonly<Record<string, string>>;
  /** The game's own child routes, mounted by the app under `/<id>/*`. */
  readonly routes: Routes;
}
