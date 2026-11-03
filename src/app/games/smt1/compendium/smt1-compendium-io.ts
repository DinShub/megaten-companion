import type { StorageEnvelope } from '../../../core/storage/storage-envelope';
import type { Profile } from '../model';
import { parseEntries } from './smt1-entries';

export { MAX_NOTE_LENGTH, normalizeEntry, parseEntries } from './smt1-entries';

/**
 * Export / import of the SMT1 compendium as one versioned JSON file. Pure, like
 * Nocturne's: the export is the same envelope the app stores, and a malformed,
 * future-versioned or other-game file is rejected with a readable message and
 * never partially applied.
 */
export const SMT1_COMPENDIUM_SCHEMA_VERSION = 1;


export type ImportResult =
  | { readonly ok: true; readonly profile: Profile }
  | { readonly ok: false; readonly error: string };

export function serializeProfile(profile: Profile): string {
  const envelope: StorageEnvelope<Profile> = {
    schemaVersion: SMT1_COMPENDIUM_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    data: profile,
  };
  return JSON.stringify(envelope, null, 2);
}

export function exportFilename(profile: Profile): string {
  const slug = profile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `smt1-compendium${slug ? `-${slug}` : ''}.json`;
}

export function parseImport(text: string, knownDemonIds?: ReadonlySet<string>): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('This file isn’t valid JSON. Make sure you picked a compendium export.');
  }
  if (!isObject(parsed) || typeof parsed['schemaVersion'] !== 'number' || !('data' in parsed)) {
    return fail('This file isn’t a compendium export (missing its version envelope).');
  }
  const version = parsed['schemaVersion'] as number;
  if (version > SMT1_COMPENDIUM_SCHEMA_VERSION) {
    return fail(
      `This file was saved by a newer version of the app (format v${version}, ` +
        `this app understands up to v${SMT1_COMPENDIUM_SCHEMA_VERSION}). Update the app, then import again.`,
    );
  }
  if (version < SMT1_COMPENDIUM_SCHEMA_VERSION) {
    return fail(`This file uses an older format (v${version}) this build can’t upgrade.`);
  }
  const data = parsed['data'];
  if (!isObject(data)) return fail('The file’s compendium data is missing or unreadable.');
  if (data['gameId'] !== 'smt1') {
    return fail(`This compendium is for a different game (“${String(data['gameId'] ?? 'unknown')}”), not Shin Megami Tensei.`);
  }
  const entries = parseEntries(data['entries'], knownDemonIds);
  if (typeof entries === 'string') return fail(entries);

  return {
    ok: true,
    profile: {
      id: strOr(data['id'], 'default'),
      name: strOr(data['name'], 'Imported compendium'),
      gameId: 'smt1',
      heroLevel: clampLevel(data['heroLevel']),
      entries,
      createdAt: strOr(data['createdAt'], new Date().toISOString()),
      updatedAt: strOr(data['updatedAt'], new Date().toISOString()),
    },
  };
}


function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

function clampLevel(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.min(99, Math.max(1, n));
}

function fail(error: string): ImportResult {
  return { ok: false, error };
}
