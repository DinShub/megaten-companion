import { ChangeDetectionStrategy, Component, HostListener, inject, ViewEncapsulation } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { P4gDataService } from './data/p4g-data.service';
import { p4gGame } from './p4g.game';
import { P4gDetailStyles } from './ui/p4g-detail-styles';
import { isTypingTarget, P4gGlobalSearch } from './ui/p4g-global-search';

/**
 * Parent of every P4G route. Mirrors the P5R layout's two jobs — kick off
 * the one-time dataset load on first entry, and host the `/`-hotkey global
 * search — plus two more: it carries the shared page styles (`.p4g …`) with
 * encapsulation off, so they load once with the game's lazy chunk; and, as the
 * Midnight Channel's remote, it binds the digit keys to sections (channels).
 */
@Component({
  selector: 'app-p4g-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [RouterOutlet, P4gGlobalSearch, P4gDetailStyles],
  host: { class: 'p4g' },
  template: `
    <router-outlet />
    <app-p4g-global-search />
    <app-p4g-detail-styles />
  `,
  styleUrl: './p4g-layout.scss',
})
export class P4gLayout {
  private readonly router = inject(Router);

  constructor() {
    inject(P4gDataService).load(p4gGame);
  }

  /**
   * 1–5 jump to the sections, in the order the shell's nav lists them (it
   * filters its fixed nav by the game's features, which share that order) —
   * the Midnight Channel skin numbers the nav links as channels to match. Ignored while typing or with
   * a modifier held, so it never eats a keystroke meant for a field or the
   * browser.
   */
  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
    const section = p4gGame.features[Number(event.key) - 1];
    if (/^[1-9]$/.test(event.key) && section) {
      event.preventDefault();
      void this.router.navigate(['/', p4gGame.id, section]);
    }
  }
}
