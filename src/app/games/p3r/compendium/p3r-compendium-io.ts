import type { StorageEnvelope } from '../../../core/storage/storage-envelope';
import type { CompendiumEntry, Profile } from '../model';

/**
 * Export / import of the P3R compendium as one versioned JSON file. Pure,
 * like P5R's `compendium-io.ts`: the export is the same envelope the app
 * stores, and a malformed, future-versioned or other-game file is rejected with
 * a readable message and never partially applied.
 */
export const P3R_COMPENDIUM_SCHEMA_VERSION = 1;

export type ImportResult =
  | { readonly ok: true; readonly profile: Profile }
  | { readonly ok: false; readonly error: string };

export function serializeProfile(profile: Profile): string {
  const envelope: StorageEnvelope<Profile> = {
    schemaVersion: P3R_COMPENDIUM_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    data: profile,
  };
  return JSON.stringify(envelope, null, 2);
}

export function exportFilename(profile: Profile): string {
  const slug = profile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `p3r-compendium${slug ? `-${slug}` : ''}.json`;
}

export function parseImport(text: string, knownPersonaIds?: ReadonlySet<string>): ImportResult {
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
  if (version > P3R_COMPENDIUM_SCHEMA_VERSION) {
    return fail(
      `This file was saved by a newer version of the app (format v${version}, ` +
        `this app understands up to v${P3R_COMPENDIUM_SCHEMA_VERSION}). Update the app, then import again.`,
    );
  }
  if (version < P3R_COMPENDIUM_SCHEMA_VERSION) {
    return fail(`This file uses an older format (v${version}) this build can’t upgrade.`);
  }
  const data = parsed['data'];
  if (!isObject(data)) return fail('The file’s compendium data is missing or unreadable.');
  if (data['gameId'] !== 'p3r') {
    return fail(`This compendium is for a different game (“${String(data['gameId'] ?? 'unknown')}”), not Persona 3 Reload.`);
  }
  const entries = parseEntries(data['entries'], knownPersonaIds);
  if (typeof entries === 'string') return fail(entries);

  return {
    ok: true,
    profile: {
      id: strOr(data['id'], 'default'),
      name: strOr(data['name'], 'Imported compendium'),
      gameId: 'p3r',
      protagonistLevel: clampLevel(data['protagonistLevel']),
      entries,
      createdAt: strOr(data['createdAt'], new Date().toISOString()),
      updatedAt: strOr(data['updatedAt'], new Date().toISOString()),
    },
  };
}

/**
 * Validate a raw entry list whole: the clean entries, or the first problem as a
 * readable message. Shared with the whole-app backup.
 */
export function parseEntries(list: unknown, knownPersonaIds?: ReadonlySet<string>): CompendiumEntry[] | string {
  if (!Array.isArray(list)) return 'The file has no list of registered personas.';
  const entries: CompendiumEntry[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    const raw: unknown = list[i];
    const where = `Entry ${i + 1}`;
    if (!isObject(raw)) return `${where} isn’t a valid record.`;
    const id = raw['personaId'];
    if (typeof id !== 'string' || id === '') return `${where} is missing its persona id.`;
    if (knownPersonaIds && !knownPersonaIds.has(id)) return `${where} names an unknown persona “${id}”.`;
    if (typeof raw['level'] !== 'number' || !Number.isFinite(raw['level'])) return `${where} (${id}) has an invalid level.`;
    if (!Array.isArray(raw['skillIds']) || raw['skillIds'].some((s) => typeof s !== 'string')) {
      return `${where} (${id}) has an invalid skill list.`;
    }
    if (seen.has(id)) return `${where} duplicates persona “${id}”.`;
    seen.add(id);
    entries.push({ personaId: id, level: clampLevel(raw['level']), skillIds: raw['skillIds'] as string[] });
  }
  return entries;
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
