import type { GameDefinition } from '../game.model';
import { P5R_ROUTES } from './p5r.routes';
import { P5R_STORED_DATA } from './p5r.storage';

/** Committed static datasets (§8.5), served from `public/data/p5r/`. */
const DATA_ROOT = 'data/p5r';

/**
 * Dataset name → asset path. Keys match `meta.json`'s `datasets` map so the
 * data service can cache-bust each one on the pinned upstream SHA (§8.5).
 * Paths are relative (no leading slash) so a base-href subpath deploy resolves.
 */
export const P5R_MANIFEST = {
  meta: `${DATA_ROOT}/meta.json`,
  personas: `${DATA_ROOT}/personas.json`,
  skills: `${DATA_ROOT}/skills.json`,
  traits: `${DATA_ROOT}/traits.json`,
  shadows: `${DATA_ROOT}/shadows.json`,
  accessories: `${DATA_ROOT}/accessories.json`,
  'fusion-chart': `${DATA_ROOT}/fusion-chart.json`,
  'advanced-recipes': `${DATA_ROOT}/advanced-recipes.json`,
  'element-chart': `${DATA_ROOT}/element-chart.json`,
  'inherit-matrix': `${DATA_ROOT}/inherit-matrix.json`,
  classroom: `${DATA_ROOT}/classroom.json`,
} as const;

export type P5rDatasetName = keyof typeof P5R_MANIFEST;

export const p5rGame: GameDefinition = {
  id: 'p5r',
  title: 'Persona 5 Royal',
  shortTitle: 'P5R',
  features: ['fusion', 'compendium', 'personas', 'shadows', 'skills', 'classroom'],
  // P5R's signature colour (its UI, logo and All-Out Attack splash are red).
  theme: { primary: 'red', skin: 'calling-card' },
  dataManifest: P5R_MANIFEST,
  routes: P5R_ROUTES,
  storedData: P5R_STORED_DATA,
};
