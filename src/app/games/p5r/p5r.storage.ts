import { checkFields, checkFlags, isRecord } from '../../core/backup/shape';
import type { StoredValue } from '../game.model';
import { parseEntries } from './compendium/compendium-io';

/**
 * What P5R persists — the single source of each storage key and schema version.
 * The stores build their `StorageSchema` from these, and the game definition
 * hands them to the whole-app backup, so the two can't drift apart. Pure: no
 * store, no Angular, safe in the eager game definition.
 */

export const P5R_SETTINGS: StoredValue = {
  key: 'settings',
  version: 1,
  label: 'P5R settings',
  validate: (data) => {
    const bad = checkFields(data, { protagonistLevel: 'number', enforceLevelCap: 'boolean', alarm: 'boolean' });
    return bad ?? checkFlags(data as Record<string, unknown>, 'unlockGroups');
  },
};

export const P5R_COMPENDIUM: StoredValue = {
  key: 'compendium',
  version: 1,
  label: 'P5R compendium',
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

export const P5R_STORED_DATA: readonly StoredValue[] = [P5R_COMPENDIUM, P5R_SETTINGS];
