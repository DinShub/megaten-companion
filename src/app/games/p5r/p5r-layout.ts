import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { GameDataService } from './data/game-data.service';
import { p5rGame } from './p5r.game';
import { GlobalSearch } from './ui/global-search';

/**
 * Parent of every P5R feature route. Two jobs the game-agnostic app shell can't
 * do without naming the game:
 *
 *  1. Kick off the one-time dataset load (task 12) on first entry into the P5R
 *     area — idempotent, so it's a no-op once loading or ready. Pages render
 *     their own loading/error chrome from the service signals.
 *  2. Host the `/`-hotkey global search (task 24), which spans this game's
 *     personas, shadows and skills.
 *
 * It adds no URL segment (`path: ''`), so it doesn't shift the depth the section
 * tabs compute their links from.
 */
@Component({
  selector: 'app-p5r-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, GlobalSearch],
  template: `
    <router-outlet />
    <app-global-search />
  `,
})
export class P5rLayout {
  constructor() {
    inject(GameDataService).load(p5rGame);
  }
}
