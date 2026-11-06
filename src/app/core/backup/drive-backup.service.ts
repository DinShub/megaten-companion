import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';

import { DriveError, type FetchFn, loadBackupFile, saveBackupFile } from '../cloud/drive-app-data';
import { GoogleAuth, GoogleAuthError } from '../cloud/google-auth';
import { BackupService, type ValidBackup } from './backup.service';

/** `fetch`, replaced in tests. */
export const DRIVE_FETCH = new InjectionToken<FetchFn>('DRIVE_FETCH', {
  providedIn: 'root',
  factory: () => (url, init) => fetch(url, init),
});

const IDLE = 'Your compendiums and settings for every game. Save here, then load on your other device.';

/**
 * Moves the whole-app backup through the user's Google Drive (SPEC §16). The
 * direction is the user's: Save always overwrites Drive, Load always offers to
 * replace local data, and nothing compares the two.
 *
 * Injected only by the settings pages, so the Google script is requested when
 * one of those renders and never at bootstrap.
 */
@Injectable({ providedIn: 'root' })
export class DriveBackupService {
  private readonly backup = inject(BackupService);
  private readonly auth = inject(GoogleAuth);
  private readonly fetchFn = inject(DRIVE_FETCH);

  /** True while a press is being worked on; the buttons disable themselves. */
  readonly busy = signal(false);
  /** Why the last press failed, ready to show. */
  readonly error = signal<string | null>(null);
  private readonly savedAt = signal<Date | null>(null);

  /** The line under the row's title. */
  readonly status = computed(() => {
    if (this.busy()) return 'Talking to Google Drive…';
    const saved = this.savedAt();
    return saved ? `Saved to Drive · ${saved.toLocaleTimeString()}` : IDLE;
  });

  constructor() {
    // Preloaded so the click can open the popup synchronously. A failure is
    // reported by the press that needs it, which also retries the load.
    this.auth.preload().catch(() => undefined);
  }

  /** Overwrite the Drive copy with what is stored now. Call from the click. */
  async save(): Promise<void> {
    this.start();
    try {
      const token = await this.auth.getToken();
      await saveBackupFile(this.fetchFn, token, this.backup.build());
      this.savedAt.set(new Date());
    } catch (err) {
      this.error.set(this.describe(err, 'save'));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Fetch and validate the Drive copy for the page's usual restore confirmation.
   * Nothing is applied here. Null when it failed, with {@link error} saying why.
   * Call from the click.
   */
  async load(): Promise<ValidBackup | null> {
    this.start();
    try {
      const token = await this.auth.getToken();
      const result = this.backup.parse(await loadBackupFile(this.fetchFn, token));
      if (result.ok) return result;
      this.error.set(result.error);
      return null;
    } catch (err) {
      this.error.set(this.describe(err, 'load'));
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  private start(): void {
    this.busy.set(true);
    this.error.set(null);
    this.savedAt.set(null);
  }

  private describe(err: unknown, action: 'save' | 'load'): string {
    if (err instanceof GoogleAuthError) {
      switch (err.kind) {
        case 'unreachable':
          return 'Couldn’t reach Google. Check your connection and try again.';
        case 'scope-denied':
          return 'Google Drive access wasn’t granted. Press the button again and allow Drive access on Google’s screen.';
        case 'cancelled':
          return 'Google sign-in was cancelled or blocked — allow pop-ups for this site and try again.';
      }
    }
    if (err instanceof DriveError) {
      switch (err.kind) {
        case 'unauthorized':
          this.auth.clearToken();
          return 'Your Google session expired — press the button again.';
        case 'forbidden':
          return `Google Drive refused access (${err.reason}).`;
        case 'not-found':
          if (action === 'load') return 'Nothing has been saved to Drive yet.';
      }
    }
    const reason = err instanceof Error ? err.message : String(err);
    return action === 'save'
      ? `Couldn’t save to Drive (${reason}). The Drive copy is unchanged.`
      : `Couldn’t load from Drive (${reason}). Your data is unchanged.`;
  }
}
