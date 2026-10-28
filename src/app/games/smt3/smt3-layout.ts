import { ChangeDetectionStrategy, Component, HostListener, inject, ViewEncapsulation } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { Smt3DataService } from './data/smt3-data.service';
import { smt3Game } from './smt3.game';
import { Smt3DetailStyles } from './ui/smt3-detail-styles';
import { isTypingTarget, Smt3GlobalSearch } from './ui/smt3-global-search';

/**
 * Parent of every Nocturne route. Mirrors the P5R layout's two jobs — kick off
 * the one-time dataset load on first entry, and host the `/`-hotkey global
 * search — plus two more: it carries the shared page styles (`.smt3 …`) with
 * encapsulation off, so they load once with the game's lazy chunk; and, as the
 * COMP skin's terminal, it binds the digit keys to sections.
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
  private readonly router = inject(Router);

  constructor() {
    inject(Smt3DataService).load(smt3Game);
  }

  /**
   * 1–5 jump to the sections, in the order the shell's nav lists them (it
   * filters its fixed nav by the game's features, which share that order) —
   * the COMP skin numbers the nav links to match. Ignored while typing or with
   * a modifier held, so it never eats a keystroke meant for a field or the
   * browser.
   */
  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
    const section = smt3Game.features[Number(event.key) - 1];
    if (/^[1-9]$/.test(event.key) && section) {
      event.preventDefault();
      void this.router.navigate(['/', smt3Game.id, section]);
    }
  }
}
