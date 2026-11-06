import type { GameDefinition } from '../game.model';
import { SMT1_ROUTES } from './smt1.routes';
import { SMT1_STORED_DATA } from './smt1.storage';

/** Committed static datasets, served from `public/data/smt1/`. */
const DATA_ROOT = 'data/smt1';

/**
 * Dataset name → asset path. Keys match `meta.json`'s `datasets` map so the data
 * service can cache-bust each one on the pinned upstream SHA. Relative paths, so
 * a base-href subpath deploy resolves.
 */
export const SMT1_MANIFEST = {
  meta: `${DATA_ROOT}/meta.json`,
  demons: `${DATA_ROOT}/demons.json`,
  skills: `${DATA_ROOT}/skills.json`,
  races: `${DATA_ROOT}/races.json`,
  'fusion-chart': `${DATA_ROOT}/fusion-chart.json`,
  'triple-chart': `${DATA_ROOT}/triple-chart.json`,
  'element-chart': `${DATA_ROOT}/element-chart.json`,
  'special-recipes': `${DATA_ROOT}/special-recipes.json`,
} as const;

export const smt1Game: GameDefinition = {
  id: 'smt1',
  title: 'Shin Megami Tensei (PS1)',
  shortTitle: 'SMT',
  features: ['fusion', 'compendium', 'demons', 'skills', 'chat'],
  // Spot blue: the second ink of a two-colour Japanese strategy guide, since the
  // PS1 release was Japan-only. Its skin is that guide (Guidebook).
  theme: { primary: 'spot', skin: 'guidebook' },
  dataManifest: SMT1_MANIFEST,
  routes: SMT1_ROUTES,
  storedData: SMT1_STORED_DATA,
};
