import type { GameDefinition } from '../game.model';
import { P3R_ROUTES } from './p3r.routes';
import { P3R_STORED_DATA } from './p3r.storage';

/** Committed static datasets, served from `public/data/p3r/`. */
const DATA_ROOT = 'data/p3r';

/**
 * Dataset name → asset path. Keys match `meta.json`'s `datasets` map so the data
 * service can cache-bust each one on the pinned upstream SHA. Relative paths, so
 * a base-href subpath deploy resolves.
 */
export const P3R_MANIFEST = {
  meta: `${DATA_ROOT}/meta.json`,
  personas: `${DATA_ROOT}/personas.json`,
  skills: `${DATA_ROOT}/skills.json`,
  shadows: `${DATA_ROOT}/shadows.json`,
  'fusion-chart': `${DATA_ROOT}/fusion-chart.json`,
  'special-recipes': `${DATA_ROOT}/special-recipes.json`,
  'inherit-matrix': `${DATA_ROOT}/inherit-matrix.json`,
} as const;

export const p3rGame: GameDefinition = {
  id: 'p3r',
  title: 'Persona 3 Reload',
  shortTitle: 'P3R',
  features: ['fusion', 'compendium', 'personas', 'shadows', 'skills'],
  // Reload's deep blue, from the menus to the box art. Its skin is the Abyss:
  // the deep-water look of the game's own menus, light coming down from the surface.
  theme: { primary: 'blue', skin: 'abyss' },
  dataManifest: P3R_MANIFEST,
  routes: P3R_ROUTES,
  storedData: P3R_STORED_DATA,
};
