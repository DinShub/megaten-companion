import type { CompendiumEntry } from '../model';

/**
 * Validation of a stored compendium entry list. Kept apart from the export /
 * import module because the whole-app backup (eager, via `smt1.storage.ts`)
 * needs it, and the rest of import/export should stay in the lazy chunks.
 */

/** Notes are the player's own text; long enough for a sentence or two. */
export const MAX_NOTE_LENGTH = 280;

/**
 * Validate a raw entry list whole: the clean entries, or the first problem as a
 * readable message.
 */
export function parseEntries(list: unknown, knownDemonIds?: ReadonlySet<string>): CompendiumEntry[] | string {
  if (!Array.isArray(list)) return 'The file has no list of owned demons.';
  const entries: CompendiumEntry[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    const raw: unknown = list[i];
    const where = `Entry ${i + 1}`;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return `${where} isn’t a valid record.`;
    const r = raw as Record<string, unknown>;
    const id = r['demonId'];
    if (typeof id !== 'string' || id === '') return `${where} is missing its demon id.`;
    if (knownDemonIds && !knownDemonIds.has(id)) return `${where} names an unknown demon “${id}”.`;
    if ('note' in r && typeof r['note'] !== 'string') return `${where} (${id}) has an invalid note.`;
    if (seen.has(id)) return `${where} duplicates demon “${id}”.`;
    seen.add(id);
    const addedAt = typeof r['addedAt'] === 'string' && r['addedAt'] !== '' ? r['addedAt'] : new Date().toISOString();
    entries.push(normalizeEntry({ demonId: id, note: (r['note'] as string | undefined) ?? '', addedAt }));
  }
  return entries;
}

export function normalizeEntry(entry: CompendiumEntry): CompendiumEntry {
  return { demonId: entry.demonId, note: entry.note.trim().slice(0, MAX_NOTE_LENGTH), addedAt: entry.addedAt };
}
