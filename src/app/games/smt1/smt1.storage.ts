import { checkFields, isRecord } from '../../core/backup/shape';
import type { StoredValue } from '../game.model';
import { parseEntries } from './compendium/smt1-entries';

/**
 * What SMT1 persists — the single source of each storage key and schema
 * version, shared by the stores and the whole-app backup. Pure, like the other
 * games' `*.storage.ts`.
 */

export const SMT1_SETTINGS: StoredValue = {
  key: 'smt1-settings',
  version: 1,
  label: 'SMT1 settings',
  validate: (data) => checkFields(data, { heroLevel: 'number', enforceLevelCap: 'boolean' }),
};

export const SMT1_COMPENDIUM: StoredValue = {
  key: 'smt1-compendium',
  version: 1,
  label: 'SMT1 compendium',
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

export const SMT1_STORED_DATA: readonly StoredValue[] = [SMT1_COMPENDIUM, SMT1_SETTINGS];
