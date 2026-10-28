import type { StorageEnvelope } from '../../../core/storage/storage-envelope';
import type { CompendiumEntry, Profile } from '../model';

/**
 * Export / import of the compendium as a single versioned JSON file (§4.6,
 * §9.4, task 29). Pure — no Angular, no store, no I/O — so the two guarantees
 * that matter unit-test directly:
 *
 *  - the export file is the *same* envelope the app stores internally, so a
 *    file round-trips through storage unchanged; and
 *  - a malformed or future-versioned file is rejected with a readable message
 *    and **never partially applied** — {@link parseImport} either returns one
 *    fully-validated {@link Profile} or a single error, and the store applies
 *    the whole thing atomically or not at all.
 */

/** The schema version the compendium writes. Bump alongside a migration (§9.4). */
export const COMPENDIUM_SCHEMA_VERSION = 1;

export type ImportResult =
  | { readonly ok: true; readonly profile: Profile }
  | { readonly ok: false; readonly error: string };

/** Wrap a profile in the storage envelope and pretty-print it for download. */
export function serializeProfile(profile: Profile): string {
  const envelope: StorageEnvelope<Profile> = {
    schemaVersion: COMPENDIUM_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    data: profile,
  };
  return JSON.stringify(envelope, null, 2);
}

/** A filename safe across OSes: `megaten-compendium-<name>.json`. */
export function exportFilename(profile: Profile): string {
  const slug = profile.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `megaten-compendium${slug ? `-${slug}` : ''}.json`;
}

/**
 * Parse and fully validate an uploaded file into a {@link Profile}. Rejects, with
 * a message fit to show the user, anything that isn't a compendium this app can
 * apply whole: non-JSON, a non-envelope, a future schema version, the wrong game,
 * or an entry list with a malformed row.
 */
export function parseImport(text: string): ImportResult {
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
  if (version > COMPENDIUM_SCHEMA_VERSION) {
    return fail(
      `This file was saved by a newer version of the app (format v${version}, ` +
        `this app understands up to v${COMPENDIUM_SCHEMA_VERSION}). Update the app, then import again.`,
    );
  }
  // No historical versions exist yet; a gap here would mean a missing migration.
  if (version < COMPENDIUM_SCHEMA_VERSION) {
    return fail(`This file uses an older format (v${version}) this build can’t upgrade.`);
  }

  const data = parsed['data'];
  if (!isObject(data)) {
    return fail('The file’s compendium data is missing or unreadable.');
  }
  if ('gameId' in data && data['gameId'] !== 'p5r') {
    return fail(`This compendium is for a different game (“${String(data['gameId'])}”), not Persona 5 Royal.`);
  }
  const entries = parseEntries(data['entries']);
  if (typeof entries === 'string') return fail(entries);

  const profile: Profile = {
    id: strOr(data['id'], 'default'),
    name: strOr(data['name'], 'Imported compendium'),
    gameId: 'p5r',
    protagonistLevel: clampLevel(data['protagonistLevel']),
    entries,
    createdAt: strOr(data['createdAt'], new Date().toISOString()),
    updatedAt: strOr(data['updatedAt'], new Date().toISOString()),
  };
  return { ok: true, profile };
}

/**
 * Validate a raw entry list whole: the clean entries, or the first problem as a
 * readable message. Shared with the whole-app backup, which checks the stored
 * compendium with the same rules an import uses.
 */
export function parseEntries(list: unknown): CompendiumEntry[] | string {
  if (!Array.isArray(list)) return 'The file has no list of registered personas.';
  const entries: CompendiumEntry[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    const entry = validateEntry(list[i], i);
    if ('error' in entry) return entry.error;
    if (seen.has(entry.value.personaId)) {
      return `Entry ${i + 1} duplicates persona “${entry.value.personaId}”.`;
    }
    seen.add(entry.value.personaId);
    entries.push(entry.value);
  }
  return entries;
}

function validateEntry(
  raw: unknown,
  index: number,
): { value: CompendiumEntry } | { error: string } {
  const where = `Entry ${index + 1}`;
  if (!isObject(raw)) return { error: `${where} isn’t a valid record.` };
  if (typeof raw['personaId'] !== 'string' || raw['personaId'] === '') {
    return { error: `${where} is missing its persona id.` };
  }
  if (typeof raw['level'] !== 'number' || !Number.isFinite(raw['level'])) {
    return { error: `${where} (${raw['personaId']}) has an invalid level.` };
  }
  if (!Array.isArray(raw['skillIds']) || raw['skillIds'].some((s) => typeof s !== 'string')) {
    return { error: `${where} (${raw['personaId']}) has an invalid skill list.` };
  }
  const trait = raw['traitId'];
  if (trait !== null && typeof trait !== 'string') {
    return { error: `${where} (${raw['personaId']}) has an invalid trait.` };
  }
  return {
    value: {
      personaId: raw['personaId'],
      level: clampLevel(raw['level']),
      skillIds: raw['skillIds'] as string[],
      traitId: trait,
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
