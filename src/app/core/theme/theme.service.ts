import { computed, effect, inject, Injectable, signal } from '@angular/core';

import type { StorageSchema } from '../storage/storage-envelope';
import { StorageService } from '../storage/storage.service';

export type ThemeName = 'dark' | 'light';

/** Must match `darkModeSelector` in app.config.ts and the class on <html>. */
const DARK_CLASS = 'app-dark';

const SCHEMA: StorageSchema<ThemeName> = { key: 'theme', currentVersion: 1, migrations: {} };

/**
 * Global light/dark theme (task 17 / §4.8). Kept in `core` rather than the
 * game settings store because the app shell — which must not reference any one
 * game — owns the toggle, and because the choice outlives the active game.
 *
 * `index.html` ships `.app-dark` so the first paint is already dark; this
 * service reconciles the DOM to the persisted preference and keeps it in sync.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storage = inject(StorageService);

  readonly theme = signal<ThemeName>(this.load());
  readonly isDark = computed(() => this.theme() === 'dark');

  constructor() {
    effect(() => {
      const dark = this.theme() === 'dark';
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle(DARK_CLASS, dark);
      }
    });
  }

  set(theme: ThemeName): void {
    this.theme.set(theme);
    this.storage.write(SCHEMA, theme);
  }

  toggle(): void {
    this.set(this.isDark() ? 'light' : 'dark');
  }

  private load(): ThemeName {
    const read = this.storage.read(SCHEMA);
    return read.status === 'ok' && (read.data === 'dark' || read.data === 'light')
      ? read.data
      : 'dark';
  }
}
