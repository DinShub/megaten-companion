import { DOCUMENT, inject, Injectable, InjectionToken } from '@angular/core';

import { GAMES } from '../../games/game.registry';
import type { StoredValue } from '../../games/game.model';
import { StorageService } from '../storage/storage.service';
import { backupFilename, type BackupParseResult, parseBackup, serializeBackup } from './backup';

/** Every value the shipped games persist. Tests override it with a fixed list. */
export const BACKUP_VALUES = new InjectionToken<readonly StoredValue[]>('BACKUP_VALUES', {
  providedIn: 'root',
  factory: () => GAMES.flatMap((game) => game.storedData),
});

/**
 * Reloads the app after a restore. The stores read storage once, at
 * construction, so a reload is the one way to make every store — including
 * other games' — pick up the restored values. Tests override it.
 */
export const PAGE_RELOAD = new InjectionToken<() => void>('PAGE_RELOAD', {
  providedIn: 'root',
  factory: () => {
    const doc = inject(DOCUMENT);
    return () => doc.defaultView?.location.reload();
  },
});

/** A backup that passed validation, ready to restore. */
export type ValidBackup = Extract<BackupParseResult, { ok: true }>;

/**
 * Whole-app backup and restore — every game's compendium and settings in one
 * file. The file format and its validation live in the pure `backup.ts`; this
 * service only connects them to storage, the download and the reload.
 */
@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly storage = inject(StorageService);
  private readonly document = inject(DOCUMENT);
  private readonly reload = inject(PAGE_RELOAD);
  private readonly values = inject(BACKUP_VALUES);

  /** The backup file's text, built from what is stored right now. */
  build(): string {
    return serializeBackup(this.values, (key) => this.storage.readRaw(key));
  }

  /** Save a backup of everything as a JSON download. */
  download(): void {
    const url = URL.createObjectURL(new Blob([this.build()], { type: 'application/json' }));
    const a = this.document.createElement('a');
    a.href = url;
    a.download = backupFilename();
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Validate a backup file's text. Nothing is applied. */
  parse(text: string): BackupParseResult {
    return parseBackup(text, this.values);
  }

  /**
   * Replace stored data with the backup's, all at once, then reload so every
   * store re-reads it. Returns the reason when the write failed — in which case
   * nothing changed and no reload happens — or null.
   */
  restore(backup: ValidBackup): string | null {
    const error = this.storage.replaceRaw(backup.writes);
    if (error) return `Couldn’t restore the backup (${error}). Your current data is unchanged.`;
    this.reload();
    return null;
  }
}
