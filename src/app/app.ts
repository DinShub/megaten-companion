import { ChangeDetectionStrategy, Component, computed, inject, isDevMode, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PrimeNG } from 'primeng/config';
import { filter, map } from 'rxjs/operators';

import { PRIMEUI_LICENSE_KEY } from '../environments/license';
import { LastGameService } from './core/last-game/last-game.service';
import { StorageService } from './core/storage/storage.service';
import type { GameDefinition, GameFeature, GameTheme } from './games/game.model';
import { DEFAULT_GAME_ID, GAMES, getGame } from './games/game.registry';
import { FocusTrap } from './shared/a11y/focus-trap';
import { bootTheme, gamePreset, THEME_OPTIONS } from './theme/app-preset';
import { ensureSkinStylesheet } from './theme/skin-stylesheet';

/** One entry in the app-agnostic navigation tree (§10). */
interface NavEntry {
  readonly feature: GameFeature;
  readonly label: string;
  readonly icon: string;
  /** Primary destination, relative to `/<gameId>`. */
  readonly segments: readonly string[];
  /** Shown in the mobile bottom tab bar. */
  readonly primary?: boolean;
}

/**
 * The §10 nav tree, keyed by feature. Game-agnostic: a game shows the entries
 * whose feature it declares in `GameDefinition.features`, and links are built
 * from the game's id — nothing here names a game.
 *
 * Multi-page features (Fusion, Shadows) link to their landing page only; their
 * sub-pages live in an on-page tab strip (SectionLayout), not a nav dropdown.
 */
const NAV: readonly NavEntry[] = [
  { feature: 'fusion', label: 'Fusion', icon: 'pi pi-bolt', segments: ['fusion'], primary: true },
  { feature: 'compendium', label: 'Compendium', icon: 'pi pi-book', segments: ['compendium'], primary: true },
  { feature: 'demons', label: 'Demons', icon: 'pi pi-users', segments: ['demons'], primary: true },
  { feature: 'magatama', label: 'Magatama', icon: 'pi pi-circle', segments: ['magatama'], primary: true },
  { feature: 'personas', label: 'Personas', icon: 'pi pi-users', segments: ['personas'], primary: true },
  { feature: 'shadows', label: 'Shadows', icon: 'pi pi-eye', segments: ['shadows'], primary: true },
  { feature: 'skills', label: 'Skills', icon: 'pi pi-sparkles', segments: ['skills'] },
  { feature: 'classroom', label: 'Classroom', icon: 'pi pi-graduation-cap', segments: ['classroom'] },
];

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Deliberately no PrimeNG components here: the shell is always in the initial
  // bundle, so its nav, drawer, buttons and banners are hand-rolled to keep that
  // bundle under budget (§8.5 / task 15). PrimeNG loads lazily with feature pages.
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FocusTrap],
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  private readonly storage = inject(StorageService);
  private readonly primeng = inject(PrimeNG);
  private readonly lastGame = inject(LastGameService);

  /**
   * The game theme currently applied. Seeded to the booting game's theme, which
   * the bootstrap `AppPreset` already baked in — so the first navigation is a
   * no-op and doesn't re-inject the theme, while a switch to another game
   * triggers exactly one re-render.
   */
  private lastTheme: GameTheme = bootTheme();

  /** Last committed URL, as a signal, so nav highlighting stays current. */
  private readonly navUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** The active game, resolved from the first URL segment. */
  protected readonly game = computed<GameDefinition>(() => this.gameFromUrl(this.navUrl()));

  /** The nav entries the active game declares (desktop nav + drawer). */
  protected readonly navEntries = computed(() =>
    NAV.filter((entry) => this.game().features.includes(entry.feature)),
  );

  /** Mobile bottom tab bar: the primary destinations. */
  protected readonly primaryNav = computed(() => this.navEntries().filter((e) => e.primary));

  /** Every shipped game, for the switcher (§9.2). Only shown when there's a choice. */
  protected readonly games = GAMES;
  protected readonly hasMultipleGames = GAMES.length > 1;

  protected readonly settingsLink = computed(() => ['/', this.game().id, 'settings']);
  protected readonly aboutLink = computed(() => ['/', this.game().id, 'about']);

  protected readonly drawerOpen = signal(false);

  /** Persistent storage-failure banner (§9.4). */
  protected readonly storageFailure = this.storage.failure;

  /**
   * Dev-only hint: it names a source file, so it's useless to end users and must
   * not appear on a deployed build. `isDevMode()` is false in production, so this
   * only shows under `ng serve` when the key is still empty.
   */
  protected readonly licenseMissing = isDevMode() && PRIMEUI_LICENSE_KEY.trim().length === 0;

  constructor() {
    // Mark the skin before the first render so the shell paints in it at once.
    setSkin(this.lastTheme);
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        // Close the mobile drawer whenever navigation completes.
        this.drawerOpen.set(false);
        // Re-point the accent and skin at the active game's (§4.8).
        this.applyGameTheme(this.gameFromUrl(e.urlAfterRedirects).theme);
        // Remember a real game visit so `/` reopens it next time. A not-found URL
        // has no game segment and must not overwrite the last good one.
        const visited = getGame(firstSegment(e.urlAfterRedirects));
        if (visited) this.lastGame.remember(visited.id);
      });
  }

  /** Resolve the active game from a URL's first path segment (fallback: default). */
  private gameFromUrl(url: string): GameDefinition {
    return getGame(firstSegment(url)) ?? getGame(DEFAULT_GAME_ID) ?? GAMES[0];
  }

  /**
   * Swap the PrimeNG preset to the active game's colour and skin, and mark the
   * skin on `<html>` for the skin stylesheets. Goes through
   * `PrimeNG.setThemeConfig` — the raw `@primeuix/themes` palette helpers only
   * update the token model and PrimeNG deliberately ignores the resulting event,
   * so the common theme is re-injected (its `--p-*` variables regenerated) only
   * via the config service. Skipped when the theme is unchanged so a same-game
   * navigation doesn't needlessly re-render the stylesheet.
   */
  private applyGameTheme(theme: GameTheme): void {
    if (theme.primary === this.lastTheme.primary && theme.skin === this.lastTheme.skin) return;
    this.lastTheme = theme;
    // The new game's skin sheet may not be loaded yet; it applies when it lands.
    void ensureSkinStylesheet(theme.skin);
    setSkin(theme);
    this.primeng.setThemeConfig({ theme: { preset: gamePreset(theme), options: THEME_OPTIONS } });
  }

  protected link(segments: readonly string[]): unknown[] {
    return ['/', this.game().id, ...segments];
  }

  protected switchGame(id: string): void {
    if (id !== this.game().id) {
      void this.router.navigate(['/', id]);
    }
  }

  protected dismissStorageBanner(): void {
    this.storage.clearFailure();
  }
}

/** Every skin stylesheet scopes itself under `:root[data-skin='<skin>']`. */
function setSkin(theme: GameTheme): void {
  if (typeof document !== 'undefined') document.documentElement.dataset['skin'] = theme.skin;
}

/** A URL's first path segment — the game id for every game route. */
function firstSegment(url: string): string | undefined {
  return url.split(/[?#]/)[0].split('/').filter(Boolean)[0];
}
