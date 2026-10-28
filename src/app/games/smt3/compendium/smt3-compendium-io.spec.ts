import type { Profile } from '../model';
import { exportFilename, parseImport, serializeProfile, SMT3_COMPENDIUM_SCHEMA_VERSION } from './smt3-compendium-io';

const PROFILE: Profile = {
  id: 'default',
  name: 'My Run',
  gameId: 'smt3',
  protagonistLevel: 42,
  entries: [
    { demonId: 'pixie', level: 20, skillIds: ['dia', 'agidyne'] },
    { demonId: 'jack-frost', level: 7, skillIds: ['bufu'] },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const envelope = (data: unknown, schemaVersion = SMT3_COMPENDIUM_SCHEMA_VERSION) =>
  JSON.stringify({ schemaVersion, savedAt: 'x', data });

describe('Nocturne compendium export / import', () => {
  it('round-trips a profile exactly', () => {
    const result = parseImport(serializeProfile(PROFILE), new Set(['pixie', 'jack-frost']));
    expect(result).toEqual({ ok: true, profile: PROFILE });
  });

  it('names the file after the game and profile', () => {
    expect(exportFilename(PROFILE)).toBe('nocturne-compendium-my-run.json');
  });

  it('rejects non-JSON, a bare object and a future version', () => {
    expect(parseImport('nope').ok).toBe(false);
    expect(parseImport('{"entries": []}').ok).toBe(false);
    const future = parseImport(envelope(PROFILE, 99));
    expect(!future.ok && future.error).toContain('newer version');
  });

  it('rejects a P5R compendium (and one with no game id)', () => {
    const p5r = parseImport(envelope({ ...PROFILE, gameId: 'p5r' }));
    expect(!p5r.ok && p5r.error).toContain('different game');
    const { gameId: _drop, ...noGame } = PROFILE;
    expect(parseImport(envelope(noGame)).ok).toBe(false);
  });

  it('rejects unknown demons, duplicates and malformed rows, applying nothing', () => {
    const unknown = parseImport(envelope({ ...PROFILE, entries: [{ demonId: 'nobody', level: 1, skillIds: [] }] }), new Set(['pixie']));
    expect(!unknown.ok && unknown.error).toContain('unknown demon');
    const dup = parseImport(envelope({ ...PROFILE, entries: [PROFILE.entries[0], PROFILE.entries[0]] }));
    expect(!dup.ok && dup.error).toContain('duplicates');
    const bad = parseImport(envelope({ ...PROFILE, entries: [{ demonId: 'pixie', level: 'high', skillIds: [] }] }));
    expect(!bad.ok && bad.error).toContain('invalid level');
  });

  it('clamps levels into 1–99', () => {
    const result = parseImport(envelope({ ...PROFILE, protagonistLevel: 500, entries: [{ demonId: 'pixie', level: 0, skillIds: [] }] }));
    expect(result.ok && result.profile.protagonistLevel).toBe(99);
    expect(result.ok && result.profile.entries[0].level).toBe(1);
  });
});
