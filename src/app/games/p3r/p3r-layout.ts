import { ChangeDetectionStrategy, Component, HostListener, inject, ViewEncapsulation } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { P3rDataService } from './data/p3r-data.service';
import { p3rGame } from './p3r.game';
import { P3rDetailStyles } from './ui/p3r-detail-styles';
import { isTypingTarget, P3rGlobalSearch } from './ui/p3r-global-search';

/**
 * Parent of every P3R route. Mirrors the P5R layout's two jobs — kick off
 * the one-time dataset load on first entry, and host the `/`-hotkey global
 * search — plus two more: it carries the shared page styles (`.p3r …`) with
 * encapsulation off, so they load once with the game's lazy chunk; and it binds
 * the digit keys to sections.
 */
@Component({
  selector: 'app-p3r-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [RouterOutlet, P3rGlobalSearch, P3rDetailStyles],
  host: { class: 'p3r' },
  template: `
    <router-outlet />
    <app-p3r-global-search />
    <app-p3r-detail-styles />
  `,
  styleUrl: './p3r-layout.scss',
})
export class P3rLayout {
  private readonly router = inject(Router);

  constructor() {
    inject(P3rDataService).load(p3rGame);
  }

  /**
   * 1–5 jump to the sections, in the order the shell's nav lists them (it
   * filters its fixed nav by the game's features, which share that order). Ignored while typing or with
   * a modifier held, so it never eats a keystroke meant for a field or the
   * browser.
   */
  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
    const section = p3rGame.features[Number(event.key) - 1];
    if (/^[1-9]$/.test(event.key) && section) {
      event.preventDefault();
      void this.router.navigate(['/', p3rGame.id, section]);
    }
  }
}
