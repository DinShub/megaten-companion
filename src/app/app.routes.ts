import { inject } from '@angular/core';
import type { Routes } from '@angular/router';

import { LastGameService } from './core/last-game/last-game.service';
import { DEFAULT_GAME_ID, GAMES, getGame } from './games/game.registry';

/**
 * Where `/` lands: the game the user last had open, if it is still a registered
 * game, else the default. Runs in the route's injection context.
 */
export function rootRedirect(): string {
  const last = inject(LastGameService).get();
  return getGame(last)?.id ?? DEFAULT_GAME_ID;
}

/**
 * Top-level routes. Built from the game registry (§9.2) — `/` reopens the last
 * game (default for a first visit), and each game mounts its own child routes
 * under `/<id>/*`. Nothing here names a specific game; adding one is a registry
 * entry, not a route edit.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: rootRedirect },

  ...GAMES.map((game) => ({ path: game.id, children: game.routes })),

  {
    path: '**',
    loadComponent: () => import('./shared/not-found/not-found').then((m) => m.NotFound),
  },
];
