import { checkFields, checkFlags, isRecord } from '../../core/backup/shape';
import type { StoredValue } from '../game.model';
import { parseEntries } from './compendium/p4g-compendium-io';

/**
 * What P4G persists — the single source of each storage key and schema
 * version, shared by the stores and the whole-app backup. Pure, like P5R's
 * `p5r.storage.ts`.
 */

export const P4G_SETTINGS: StoredValue = {
  key: 'p4g-settings',
  version: 1,
  label: 'P4G settings',
  validate: (data) => {
    const bad = checkFields(data, { protagonistLevel: 'number', enforceLevelCap: 'boolean' });
    return bad ?? checkFlags(data as Record<string, unknown>, 'unlockGroups');
  },
};

export const P4G_COMPENDIUM: StoredValue = {
  key: 'p4g-compendium',
  version: 1,
  label: 'P4G compendium',
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

export const P4G_STORED_DATA: readonly StoredValue[] = [P4G_COMPENDIUM, P4G_SETTINGS];
