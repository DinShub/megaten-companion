import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Smt3DataService } from './data/smt3-data.service';
import { smt3Game } from './smt3.game';
import { Smt3DetailStyles } from './ui/smt3-detail-styles';
import { Smt3GlobalSearch } from './ui/smt3-global-search';

/**
 * Parent of every Nocturne route. Mirrors the P5R layout's two jobs — kick off
 * the one-time dataset load on first entry, and host the `/`-hotkey global
 * search — plus a third: it carries the shared page styles (`.smt3 …`) with
 * encapsulation off, so they load once with the game's lazy chunk.
 */
@Component({
  selector: 'app-smt3-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [RouterOutlet, Smt3GlobalSearch, Smt3DetailStyles],
  host: { class: 'smt3' },
  template: `
    <router-outlet />
    <app-smt3-global-search />
    <app-smt3-detail-styles />
  `,
  styleUrl: './smt3-layout.scss',
})
export class Smt3Layout {
  constructor() {
    inject(Smt3DataService).load(smt3Game);
  }
}
