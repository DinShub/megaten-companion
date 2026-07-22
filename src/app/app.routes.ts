import type { Routes } from '@angular/router';

import { DEFAULT_GAME_ID, GAMES } from './games/game.registry';

/**
 * Top-level routes. Built from the game registry (§9.2) — `/` redirects to the
 * only game, and each game mounts its own child routes under `/<id>/*`. Nothing
 * here names a specific game; adding one is a registry entry, not a route edit.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: DEFAULT_GAME_ID },

  ...GAMES.map((game) => ({ path: game.id, children: game.routes })),

  {
    path: '**',
    loadComponent: () => import('./shared/not-found/not-found').then((m) => m.NotFound),
  },
];
