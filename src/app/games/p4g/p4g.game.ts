import type { GameDefinition } from '../game.model';
import { P4G_ROUTES } from './p4g.routes';
import { P4G_STORED_DATA } from './p4g.storage';

/** Committed static datasets, served from `public/data/p4g/`. */
const DATA_ROOT = 'data/p4g';

/**
 * Dataset name → asset path. Keys match `meta.json`'s `datasets` map so the data
 * service can cache-bust each one on the pinned upstream SHA. Relative paths, so
 * a base-href subpath deploy resolves.
 */
export const P4G_MANIFEST = {
  meta: `${DATA_ROOT}/meta.json`,
  personas: `${DATA_ROOT}/personas.json`,
  skills: `${DATA_ROOT}/skills.json`,
  shadows: `${DATA_ROOT}/shadows.json`,
  'fusion-chart': `${DATA_ROOT}/fusion-chart.json`,
  'special-recipes': `${DATA_ROOT}/special-recipes.json`,
  'inherit-matrix': `${DATA_ROOT}/inherit-matrix.json`,
} as const;

export const p4gGame: GameDefinition = {
  id: 'p4g',
  title: 'Persona 4 Golden',
  shortTitle: 'P4G',
  features: ['fusion', 'compendium', 'personas', 'shadows', 'skills'],
  // Inaba yellow: the series' colour for Persona 4, from the box art to the TV world.
  // Its skin is the Midnight Channel — the late-night broadcast that starts the story.
  theme: { primary: 'yellow', skin: 'midnight-channel' },
  dataManifest: P4G_MANIFEST,
  routes: P4G_ROUTES,
  storedData: P4G_STORED_DATA,
};
