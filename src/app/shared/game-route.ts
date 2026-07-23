import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs/operators';

/**
 * Reactive helper for building links relative to the active game's mount point
 * (`/<gameId>/…`). Game-agnostic — the id is read from the first URL segment, so
 * feature pages never hard-code it and copy across to another game unchanged.
 *
 * Mirrors the shell's own game resolution (`App#game`) but exposed for feature
 * pages, which need to cross-link between features (persona → shadow, skill →
 * persona) without naming the game.
 */
@Injectable({ providedIn: 'root' })
export class GameRouteContext {
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** The active game's URL segment, e.g. `p5r`. */
  readonly gameId = computed(() => this.url().split(/[?#]/)[0].split('/').filter(Boolean)[0] ?? '');

  /** An absolute `routerLink` array under the active game: `link('personas', id)`. */
  link(...segments: (string | number)[]): unknown[] {
    return ['/', this.gameId(), ...segments];
  }
}
