import { P5R_COMPENDIUM, P5R_SETTINGS, P5R_STORED_DATA } from '../../games/p5r/p5r.storage';
import { SMT3_STORED_DATA } from '../../games/smt3/smt3.storage';
import { BACKUP_KIND, BACKUP_SCHEMA_VERSION, backupFilename, parseBackup, serializeBackup } from './backup';

const KNOWN = [...P5R_STORED_DATA, ...SMT3_STORED_DATA];

const env = (data: unknown, schemaVersion = 1) => ({ schemaVersion, savedAt: '2026-10-28T10:00:00.000Z', data });

const P5R_COMP = env({
  id: 'default',
  name: 'Run 1',
  entries: [
    { personaId: 'arsene', level: 3, skillIds: ['eiha'], traitId: null },
    { personaId: 'pixie', level: 2, skillIds: [], traitId: null },
  ],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
});
const P5R_SET = env({ protagonistLevel: 40, enforceLevelCap: true, unlockGroups: { story: true, confidant: true, dlc: true }, alarm: false });
const SMT3_COMP = env({ id: 'default', name: 'NG+', entries: [{ demonId: 'pixie', level: 4, skillIds: ['zio'] }], createdAt: 'x', updatedAt: 'y' });

/** Raw storage as the app would hold it: key → stored envelope text. */
function raw(values: Record<string, unknown>): (key: string) => string | null {
  return (key) => (key in values ? JSON.stringify(values[key]) : null);
}

/** A backup file with the given values, bypassing `serializeBackup`. */
function file(values: Record<string, unknown>, schemaVersion = BACKUP_SCHEMA_VERSION): string {
  return JSON.stringify(env({ kind: BACKUP_KIND, values }, schemaVersion));
}

describe('whole-app backup', () => {
  it('round-trips every stored value exactly, and records missing ones as null', () => {
    const text = serializeBackup(KNOWN, raw({ compendium: P5R_COMP, settings: P5R_SET, 'smt3-compendium': SMT3_COMP }));
    const result = parseBackup(text, KNOWN);
    if (!result.ok) throw new Error(result.error);

    expect(JSON.parse(result.writes.get('compendium') as string)).toEqual(P5R_COMP);
    expect(JSON.parse(result.writes.get('settings') as string)).toEqual(P5R_SET);
    expect(JSON.parse(result.writes.get('smt3-compendium') as string)).toEqual(SMT3_COMP);
    // Nocturne settings were never stored: restoring clears them back to defaults.
    expect(result.writes.has('smt3-settings')).toBe(true);
    expect(result.writes.get('smt3-settings')).toBeNull();
  });

  it('summarises what it holds in a fixed order', () => {
    const result = parseBackup(serializeBackup(KNOWN, raw({ compendium: P5R_COMP, 'smt3-compendium': SMT3_COMP })), KNOWN);
    if (!result.ok) throw new Error(result.error);
    expect(result.items).toEqual([
      { label: 'P5R compendium', detail: '2 personas' },
      { label: 'P5R settings', detail: 'empty' },
      { label: 'Nocturne compendium', detail: '1 demon' },
      { label: 'Nocturne settings', detail: 'empty' },
    ]);
  });

  it('records an unreadable stored value as null rather than copying garbage', () => {
    const text = serializeBackup(KNOWN, (key) => (key === 'settings' ? '{not json' : null));
    expect(JSON.parse(text).data.values.settings).toBeNull();
  });

  it('touches only the keys the file holds', () => {
    const result = parseBackup(file({ settings: P5R_SET }), KNOWN);
    if (!result.ok) throw new Error(result.error);
    expect([...result.writes.keys()]).toEqual(['settings']);
  });

  it('rejects non-JSON, non-backups and other format versions', () => {
    expect(parseBackup('nope', KNOWN)).toEqual({ ok: false, error: expect.stringContaining('valid JSON') });
    expect(parseBackup('{"values": {}}', KNOWN)).toEqual({ ok: false, error: expect.stringContaining('version envelope') });
    expect(parseBackup(file({ settings: P5R_SET }, 2), KNOWN)).toEqual({ ok: false, error: expect.stringContaining('newer version') });
    expect(parseBackup(file({ settings: P5R_SET }, 0), KNOWN)).toEqual({ ok: false, error: expect.stringContaining('older format') });
    expect(parseBackup(JSON.stringify(env({ kind: 'other', values: {} })), KNOWN).ok).toBe(false);
  });

  it('points a single-compendium export at the Compendium page', () => {
    const exported = JSON.stringify(env({ gameId: 'p5r', entries: [] }));
    expect(parseBackup(exported, KNOWN)).toEqual({ ok: false, error: expect.stringContaining('Compendium page') });
  });

  it('refuses a key this build does not recognise, applying nothing', () => {
    const result = parseBackup(file({ settings: P5R_SET, 'p3r-compendium': env({}) }), KNOWN);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('“p3r-compendium”') });
  });

  it('refuses a value saved at a newer version than its store understands', () => {
    const result = parseBackup(file({ compendium: P5R_COMP, settings: env({}, P5R_SETTINGS.version + 1) }), KNOWN);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('P5R settings was saved by a newer version') });
  });

  it('runs each game’s validator, naming the value and the problem', () => {
    const badEntry = env({ entries: [{ personaId: 'arsene', level: 'high', skillIds: [], traitId: null }] });
    expect(parseBackup(file({ [P5R_COMPENDIUM.key]: badEntry }), KNOWN)).toEqual({
      ok: false,
      error: 'This backup’s P5R compendium can’t be loaded: Entry 1 (arsene) has an invalid level.',
    });
    expect(parseBackup(file({ settings: env({ alarm: 'yes' }) }), KNOWN)).toEqual({
      ok: false,
      error: 'This backup’s P5R settings can’t be loaded: “alarm” is invalid.',
    });
    expect(parseBackup(file({ 'smt3-settings': env({ unlockGroups: { story: 1 } }) }), KNOWN).ok).toBe(false);
    expect(parseBackup(file({ 'smt3-compendium': env({ entries: [{ level: 1, skillIds: [] }] }) }), KNOWN).ok).toBe(false);
    expect(parseBackup(file({ settings: 'not an envelope' }), KNOWN).ok).toBe(false);
  });

  it('refuses an empty backup', () => {
    expect(parseBackup(file({}), KNOWN)).toEqual({ ok: false, error: expect.stringContaining('empty') });
  });

  it('dates the filename in local time', () => {
    expect(backupFilename(new Date(2026, 9, 28, 23, 59))).toBe('megaten-companion-backup-2026-10-28.json');
  });
});
