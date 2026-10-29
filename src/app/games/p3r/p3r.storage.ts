import { checkFields, checkFlags, isRecord } from '../../core/backup/shape';
import type { StoredValue } from '../game.model';
import { parseEntries } from './compendium/p3r-compendium-io';

/**
 * What P3R persists — the single source of each storage key and schema
 * version, shared by the stores and the whole-app backup. Pure, like P5R's
 * `p5r.storage.ts`.
 */

export const P3R_SETTINGS: StoredValue = {
  key: 'p3r-settings',
  version: 1,
  label: 'P3R settings',
  validate: (data) => {
    const bad = checkFields(data, { protagonistLevel: 'number', enforceLevelCap: 'boolean' });
    return bad ?? checkFlags(data as Record<string, unknown>, 'unlockGroups');
  },
};

export const P3R_COMPENDIUM: StoredValue = {
  key: 'p3r-compendium',
  version: 1,
  label: 'P3R compendium',
  validate: (data) => {
    const bad = checkFields(data, { id: 'string', name: 'string', createdAt: 'string', updatedAt: 'string' });
    if (bad) return bad;
    const entries = parseEntries((data as Record<string, unknown>)['entries']);
    return typeof entries === 'string' ? entries : null;
  },
  summarize: (data) => {
    const n = isRecord(data) && Array.isArray(data['entries']) ? data['entries'].length : 0;
    return `${n} ${n === 1 ? 'persona' : 'personas'}`;
  },
};

export const P3R_STORED_DATA: readonly StoredValue[] = [P3R_COMPENDIUM, P3R_SETTINGS];
