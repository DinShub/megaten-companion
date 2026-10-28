import type { StoredValue } from '../../games/game.model';
import type { StorageEnvelope } from '../storage/storage-envelope';
import { isRecord } from './shape';

/**
 * Whole-app backup: every game's stored values in one versioned file. Pure — no
 * Angular, no storage — so the guarantees unit-test directly:
 *
 *  - a value is copied as the exact envelope the app stores, so it restores
 *    byte-for-byte and the store's own migrations still apply on read; and
 *  - a malformed, future-versioned or unrecognised file is rejected with a
 *    readable message and **never partially applied** — {@link parseBackup}
 *    returns either the complete set of writes or one error.
 *
 * Game-agnostic: which keys exist, their versions and their validation come
 * from each game's {@link StoredValue} list.
 */

/** The backup file's own format version. */
export const BACKUP_SCHEMA_VERSION = 1;

/** Tells a backup apart from a single-compendium export, which shares the envelope. */
export const BACKUP_KIND = 'megaten-companion-backup';

interface BackupData {
  readonly kind: typeof BACKUP_KIND;
  /** Storage key → its stored envelope, or null when nothing was stored (restoring clears it). */
  readonly values: Readonly<Record<string, StorageEnvelope<unknown> | null>>;
}

/** One line of the restore summary. */
export interface BackupItem {
  readonly label: string;
  /** e.g. "12 personas"; "empty" for a value that wasn't stored; null when there's nothing to say. */
  readonly detail: string | null;
}

export type BackupParseResult =
  | {
      readonly ok: true;
      readonly savedAt: string;
      readonly items: readonly BackupItem[];
      /** Storage key → raw text to write, or null to remove. Applied as one step. */
      readonly writes: ReadonlyMap<string, string | null>;
    }
  | { readonly ok: false; readonly error: string };

/**
 * Build the backup file from the raw stored text of each known value. A key with
 * nothing (or nothing readable) stored is recorded as null, so restoring the
 * backup also clears data created after it was taken.
 */
export function serializeBackup(known: readonly StoredValue[], readRaw: (key: string) => string | null): string {
  const values: Record<string, StorageEnvelope<unknown> | null> = {};
  for (const { key } of known) {
    const raw = readRaw(key);
    let parsed: unknown = null;
    if (raw !== null) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
    }
    values[key] = isEnvelope(parsed) ? parsed : null;
  }
  const envelope: StorageEnvelope<BackupData> = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    data: { kind: BACKUP_KIND, values },
  };
  return JSON.stringify(envelope, null, 2);
}

/** `megaten-companion-backup-2026-10-28.json`, dated in local time. */
export function backupFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `megaten-companion-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/**
 * Parse and fully validate a backup file against the values this build knows.
 * Rejects non-JSON, non-backups (including single-compendium exports), future
 * versions, keys this build doesn't recognise, and any value its game's
 * validator refuses.
 */
export function parseBackup(text: string, known: readonly StoredValue[]): BackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('This file isn’t valid JSON. Make sure you picked a backup file.');
  }
  if (!isEnvelope(parsed)) {
    return fail('This file isn’t a Megaten Companion backup (missing its version envelope).');
  }
  if (parsed.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return fail(
      `This backup was made by a newer version of the app (format v${parsed.schemaVersion}, ` +
        `this app understands up to v${BACKUP_SCHEMA_VERSION}). Update the app, then restore again.`,
    );
  }
  if (parsed.schemaVersion < BACKUP_SCHEMA_VERSION) {
    return fail(`This backup uses an older format (v${parsed.schemaVersion}) this build can’t upgrade.`);
  }

  const data = parsed.data;
  if (!isRecord(data) || data['kind'] !== BACKUP_KIND) {
    if (isRecord(data) && 'entries' in data) {
      return fail('This is a single compendium export, not a full backup — import it from that game’s Compendium page.');
    }
    return fail('This file isn’t a Megaten Companion backup.');
  }
  const values = data['values'];
  if (!isRecord(values)) return fail('The backup’s data is missing or unreadable.');

  const byKey = new Map(known.map((v) => [v.key, v] as const));
  for (const key of Object.keys(values)) {
    if (!byKey.has(key)) {
      return fail(
        `This backup holds data this version of the app doesn’t recognise (“${key}”). ` +
          'Update the app, then restore again.',
      );
    }
  }

  const items: BackupItem[] = [];
  const writes = new Map<string, string | null>();
  // Known order, so the summary reads the same way every time.
  for (const value of known) {
    if (!(value.key in values)) continue;
    const stored = values[value.key];
    if (stored === null) {
      items.push({ label: value.label, detail: 'empty' });
      writes.set(value.key, null);
      continue;
    }
    if (!isEnvelope(stored)) return fail(`This backup’s ${value.label} can’t be loaded: it isn’t a stored value.`);
    if (stored.schemaVersion > value.version) {
      return fail(
        `This backup’s ${value.label} was saved by a newer version of the app ` +
          `(v${stored.schemaVersion}, this app understands up to v${value.version}). Update the app, then restore again.`,
      );
    }
    if (!Number.isInteger(stored.schemaVersion) || stored.schemaVersion < 1) {
      return fail(`This backup’s ${value.label} has an invalid version.`);
    }
    // Older versions are left to the store's migration chain on read; only the
    // current shape is checked here.
    if (stored.schemaVersion === value.version) {
      const reason = value.validate(stored.data);
      if (reason) return fail(`This backup’s ${value.label} can’t be loaded: ${reason}`);
    }
    items.push({ label: value.label, detail: value.summarize?.(stored.data) ?? null });
    writes.set(value.key, JSON.stringify(stored));
  }

  if (writes.size === 0) return fail('This backup is empty — there’s nothing to restore.');
  const savedAt = typeof parsed.savedAt === 'string' ? parsed.savedAt : '';
  return { ok: true, savedAt, items, writes };
}

function isEnvelope(value: unknown): value is StorageEnvelope<unknown> {
  return isRecord(value) && typeof value['schemaVersion'] === 'number' && 'data' in value;
}

function fail(error: string): BackupParseResult {
  return { ok: false, error };
}
