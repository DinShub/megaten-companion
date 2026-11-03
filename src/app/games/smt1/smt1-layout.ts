import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, DOCUMENT, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { Smt1DataService } from './data/smt1-data.service';
import { smt1Game } from './smt1.game';
import { Smt1GlobalSearch } from './ui/smt1-global-search';
import { createPageTurn } from './ui/smt1-page-turn';
import { playPressRun } from './ui/smt1-press-run';

/**
 * Parent of every SMT1 route: kicks off the one-time dataset load on first
 * entry, hosts the `/`-hotkey global search, and drives the Guidebook's two
 * motions — the press run once the first page has rendered, and the page turn
 * between routes. Every visual rule lives in the lazy Guidebook skin sheet
 * (styles/skins/_guidebook.scss), scoped under `.smt1`.
 */
@Component({
  selector: 'app-smt1-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Smt1GlobalSearch],
  host: { class: 'smt1' },
  template: `
    <router-outlet />
    <app-smt1-global-search />
  `,
})
export class Smt1Layout {
  constructor() {
    inject(Smt1DataService).load(smt1Game);
    const destroyRef = inject(DestroyRef);
    const doc = inject(DOCUMENT);
    const turns = inject(Router).events.subscribe(createPageTurn(doc, smt1Game.id));
    destroyRef.onDestroy(() => turns.unsubscribe());
    afterNextRender(() => {
      const stop = playPressRun(doc);
      destroyRef.onDestroy(stop);
    });
  }
}
