import { inject, Injectable, InjectionToken, signal } from '@angular/core';

import type {
  ReadResult,
  StorageBackend,
  StorageEnvelope,
  StorageSchema,
} from './storage-envelope';

/** All keys live under one namespace so `clearAll` can find them (§9.4). */
export const STORAGE_KEY_PREFIX = 'megaten-companion:v1:';

/** Writes settle after this idle gap; a burst of edits produces one write. */
export const WRITE_DEBOUNCE_MS = 400;

/** In-memory fallback for environments without `localStorage` (SSR, locked-down browsers). */
class MemoryStorage implements StorageBackend {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/**
 * The backing store. Defaults to `localStorage` where available and to an
 * in-memory map otherwise. Tests override this to simulate a quota failure.
 */
export const STORAGE_BACKEND = new InjectionToken<StorageBackend>('STORAGE_BACKEND', {
  providedIn: 'root',
  factory: () => {
    try {
      if (typeof localStorage !== 'undefined') {
        // Touch it: private-mode Safari exposes the object but throws on write.
        const probe = `${STORAGE_KEY_PREFIX}__probe__`;
        localStorage.setItem(probe, '1');
        localStorage.removeItem(probe);
        return localStorage;
      }
    } catch {
      /* fall through to memory */
    }
    return new MemoryStorage();
  },
});

/**
 * Versioned `localStorage` adapter (task 16 / §9.4).
 *
 * - Reads unwrap the envelope, refuse future versions, and run the migration
 *   chain up to `currentVersion`.
 * - Writes are debounced and never throw: a quota or private-mode failure sets
 *   {@link failure}, which the app shell renders as a persistent banner rather
 *   than letting a hand-typed compendium vanish silently.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly backend = inject(STORAGE_BACKEND);

  /** Non-null once a write has failed; a human-readable reason for the banner. */
  readonly failure = signal<string | null>(null);

  private readonly pending = new Map<string, string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    // Best effort: don't lose a debounced write to a tab close.
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flushWrites());
    }
  }

  private fullKey(key: string): string {
    return `${STORAGE_KEY_PREFIX}${key}`;
  }

  read<T>(schema: StorageSchema<T>): ReadResult<T> {
    let raw: string | null;
    try {
      raw = this.backend.getItem(this.fullKey(schema.key));
    } catch (err) {
      return { status: 'error', reason: 'corrupt', message: describe(err) };
    }
    if (raw === null) return { status: 'empty' };

    let envelope: StorageEnvelope<unknown>;
    try {
      envelope = JSON.parse(raw) as StorageEnvelope<unknown>;
    } catch (err) {
      return { status: 'error', reason: 'corrupt', message: `not JSON: ${describe(err)}` };
    }
    if (
      envelope === null ||
      typeof envelope !== 'object' ||
      typeof envelope.schemaVersion !== 'number' ||
      !('data' in envelope)
    ) {
      return { status: 'error', reason: 'corrupt', message: 'not a storage envelope' };
    }

    if (envelope.schemaVersion > schema.currentVersion) {
      return {
        status: 'error',
        reason: 'future-version',
        message: `stored v${envelope.schemaVersion} is newer than supported v${schema.currentVersion}`,
      };
    }

    let data: unknown = envelope.data;
    for (let v = envelope.schemaVersion; v < schema.currentVersion; v++) {
      const migrate = schema.migrations[v];
      if (!migrate) {
        return {
          status: 'error',
          reason: 'migration-failed',
          message: `no migration from v${v} to v${v + 1}`,
        };
      }
      try {
        data = migrate(data);
      } catch (err) {
        return {
          status: 'error',
          reason: 'migration-failed',
          message: `migration v${v}→v${v + 1} threw: ${describe(err)}`,
        };
      }
    }
    return { status: 'ok', data: data as T };
  }

  /** Wrap and schedule a debounced write. Never throws. */
  write<T>(schema: StorageSchema<T>, data: T): void {
    const envelope: StorageEnvelope<T> = {
      schemaVersion: schema.currentVersion,
      savedAt: new Date().toISOString(),
      data,
    };
    const key = this.fullKey(schema.key);
    this.pending.set(key, JSON.stringify(envelope));

    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    this.timers.set(
      key,
      setTimeout(() => this.commit(key), WRITE_DEBOUNCE_MS),
    );
  }

  /** Force every pending write out synchronously (tests, tab close). */
  flushWrites(): void {
    for (const key of [...this.pending.keys()]) this.commit(key);
  }

  private commit(key: string): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    const value = this.pending.get(key);
    if (value === undefined) return;
    this.pending.delete(key);
    try {
      this.backend.setItem(key, value);
    } catch (err) {
      this.failure.set(
        `Couldn't save your data (${describe(err)}). Changes this session may be lost. ` +
          'Check that the browser allows local storage and has free space.',
      );
    }
  }

  remove(key: string): void {
    const full = this.fullKey(key);
    this.pending.delete(full);
    const timer = this.timers.get(full);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(full);
    }
    try {
      this.backend.removeItem(full);
    } catch {
      /* removal failures are not worth a banner */
    }
  }

  /** Dismiss the failure banner once the user has acknowledged it. */
  clearFailure(): void {
    this.failure.set(null);
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.name === 'Error' ? err.message : err.name;
  return String(err);
}
