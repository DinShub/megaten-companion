import type { GameDefinition } from '../game.model';
import { SMT3_ROUTES } from './smt3.routes';

/** Committed static datasets, served from `public/data/smt3/`. */
const DATA_ROOT = 'data/smt3';

/**
 * Dataset name → asset path. Keys match `meta.json`'s `datasets` map so the data
 * service can cache-bust each one on the pinned upstream SHA. Relative paths, so
 * a base-href subpath deploy resolves.
 */
export const SMT3_MANIFEST = {
  meta: `${DATA_ROOT}/meta.json`,
  demons: `${DATA_ROOT}/demons.json`,
  skills: `${DATA_ROOT}/skills.json`,
  magatama: `${DATA_ROOT}/magatama.json`,
  'fusion-chart': `${DATA_ROOT}/fusion-chart.json`,
  'element-chart': `${DATA_ROOT}/element-chart.json`,
  'special-recipes': `${DATA_ROOT}/special-recipes.json`,
} as const;

export const smt3Game: GameDefinition = {
  id: 'smt3',
  title: 'Shin Megami Tensei III: Nocturne',
  shortTitle: 'Nocturne',
  features: ['fusion', 'compendium', 'demons', 'magatama', 'skills'],
  // Burnt dark orange: the Vortex World's scorched, sunset-lit Tokyo and Kagutsuchi's glow.
  theme: { primary: 'ember' },
  dataManifest: SMT3_MANIFEST,
  routes: SMT3_ROUTES,
};
