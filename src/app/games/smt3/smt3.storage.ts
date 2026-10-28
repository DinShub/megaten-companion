import { checkFields, checkFlags, isRecord } from '../../core/backup/shape';
import type { StoredValue } from '../game.model';
import { parseEntries } from './compendium/smt3-compendium-io';

/**
 * What Nocturne persists — the single source of each storage key and schema
 * version, shared by the stores and the whole-app backup. Pure, like P5R's
 * `p5r.storage.ts`.
 */

export const SMT3_SETTINGS: StoredValue = {
  key: 'smt3-settings',
  version: 1,
  label: 'Nocturne settings',
  validate: (data) => {
    const bad = checkFields(data, { protagonistLevel: 'number', enforceLevelCap: 'boolean' });
    return bad ?? checkFlags(data as Record<string, unknown>, 'unlockGroups');
  },
};

export const SMT3_COMPENDIUM: StoredValue = {
  key: 'smt3-compendium',
  version: 1,
  label: 'Nocturne compendium',
  validate: (data) => {
    const bad = checkFields(data, { id: 'string', name: 'string', createdAt: 'string', updatedAt: 'string' });
    if (bad) return bad;
    const entries = parseEntries((data as Record<string, unknown>)['entries']);
    return typeof entries === 'string' ? entries : null;
  },
  summarize: (data) => {
    const n = isRecord(data) && Array.isArray(data['entries']) ? data['entries'].length : 0;
    return `${n} ${n === 1 ? 'demon' : 'demons'}`;
  },
};

export const SMT3_STORED_DATA: readonly StoredValue[] = [SMT3_COMPENDIUM, SMT3_SETTINGS];
