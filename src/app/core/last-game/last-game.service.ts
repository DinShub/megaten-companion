import { inject, Injectable } from '@angular/core';

import type { StorageSchema } from '../storage/storage-envelope';
import { StorageService } from '../storage/storage.service';

const SCHEMA: StorageSchema<string> = { key: 'last-game', currentVersion: 1, migrations: {} };

/**
 * Remembers which game the user last had open, so `/` can reopen it. Game-
 * agnostic: it stores a bare id and never decides whether that id is valid —
 * the root redirect checks it against the registry and falls back to the
 * default game, so a stale or hand-edited value can't strand the user.
 */
@Injectable({ providedIn: 'root' })
export class LastGameService {
  private readonly storage = inject(StorageService);
  private last: string | null = this.load();

  /** The last game id written, or null when none has been recorded. */
  get(): string | null {
    return this.last;
  }

  /** Record `id` as the active game. A no-op when it is already the stored value. */
  remember(id: string): void {
    if (id === this.last) return;
    this.last = id;
    this.storage.write(SCHEMA, id);
  }

  private load(): string | null {
    const read = this.storage.read(SCHEMA);
    return read.status === 'ok' && typeof read.data === 'string' ? read.data : null;
  }
}
