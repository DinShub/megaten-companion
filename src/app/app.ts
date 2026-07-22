import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs/operators';

import { PRIMEUI_LICENSE_KEY } from '../environments/license';
import { StorageService } from './core/storage/storage.service';
import { ThemeService } from './core/theme/theme.service';
import type { GameDefinition, GameFeature } from './games/game.model';
import { DEFAULT_GAME_ID, GAMES, getGame } from './games/game.registry';

/** One entry in the app-agnostic navigation tree (§10). */
interface NavEntry {
  readonly feature: GameFeature;
  readonly label: string;
  readonly icon: string;
  /** Primary destination, relative to `/<gameId>`. */
  readonly segments: readonly string[];
  /** Sub-destinations for a submenu / drawer group. */
  readonly children?: readonly { readonly label: string; readonly segments: readonly string[] }[];
  /** Shown in the mobile bottom tab bar. */
  readonly primary?: boolean;
}

/**
 * The §10 nav tree, keyed by feature. Game-agnostic: a game shows the entries
 * whose feature it declares in `GameDefinition.features`, and links are built
 * from the game's id — nothing here names a game.
 */
const NAV: readonly NavEntry[] = [
  {
    feature: 'fusion',
    label: 'Fusion',
    icon: 'pi pi-bolt',
    segments: ['fusion', 'calculator'],
    primary: true,
    children: [
      { label: 'Calculator', segments: ['fusion', 'calculator'] },
      { label: 'Route finder', segments: ['fusion', 'route'] },
      { label: 'Itemization', segments: ['fusion', 'itemization'] },
    ],
  },
  { feature: 'compendium', label: 'Compendium', icon: 'pi pi-book', segments: ['compendium'], primary: true },
  { feature: 'personas', label: 'Personas', icon: 'pi pi-users', segments: ['personas'], primary: true },
  {
    feature: 'shadows',
    label: 'Shadows',
    icon: 'pi pi-eye',
    segments: ['shadows'],
    primary: true,
    children: [
      { label: 'Shadows', segments: ['shadows'] },
      { label: 'Sub-bosses', segments: ['shadows', 'subbosses'] },
      { label: 'Drops', segments: ['shadows', 'drops'] },
    ],
  },
  { feature: 'skills', label: 'Skills', icon: 'pi pi-sparkles', segments: ['skills'] },
  { feature: 'classroom', label: 'Classroom', icon: 'pi pi-graduation-cap', segments: ['classroom'] },
];

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Deliberately no PrimeNG components here: the shell is always in the initial
  // bundle, so its nav, drawer, buttons and banners are hand-rolled to keep that
  // bundle under budget (§8.5 / task 15). PrimeNG loads lazily with feature pages.
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);
  private readonly storage = inject(StorageService);

  /** Last committed URL, as a signal, so nav highlighting stays current. */
  private readonly navUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** The active game, resolved from the first URL segment. */
  protected readonly game = computed<GameDefinition>(() => {
    const first = this.navUrl().split(/[?#]/)[0].split('/').filter(Boolean)[0];
    return getGame(first) ?? getGame(DEFAULT_GAME_ID) ?? GAMES[0];
  });

  /** The nav entries the active game declares (desktop nav + drawer). */
  protected readonly navEntries = computed(() =>
    NAV.filter((entry) => this.game().features.includes(entry.feature)),
  );

  /** Mobile bottom tab bar: the primary destinations. */
  protected readonly primaryNav = computed(() => this.navEntries().filter((e) => e.primary));

  /** Full drawer tree for mobile: every entry, children flattened under it. */
  protected readonly drawerNav = computed(() => this.navEntries());

  protected readonly settingsLink = computed(() => ['/', this.game().id, 'settings']);

  protected readonly drawerOpen = signal(false);

  /** Persistent storage-failure banner (§9.4). */
  protected readonly storageFailure = this.storage.failure;

  /** Dev hint: clears once a PrimeUI licence key is filled in. */
  protected readonly licenseMissing = PRIMEUI_LICENSE_KEY.trim().length === 0;

  constructor() {
    // Close the mobile drawer whenever navigation completes.
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.drawerOpen.set(false));
  }

  protected link(segments: readonly string[]): unknown[] {
    return ['/', this.game().id, ...segments];
  }

  protected dismissStorageBanner(): void {
    this.storage.clearFailure();
  }
}
