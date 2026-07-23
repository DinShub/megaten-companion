import type { Profile } from '../model';
import {
  COMPENDIUM_SCHEMA_VERSION,
  exportFilename,
  parseImport,
  serializeProfile,
} from './compendium-io';

function sampleProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'default',
    name: 'My Compendium',
    gameId: 'p5r',
    protagonistLevel: 42,
    entries: [
      { personaId: 'jack-frost', level: 14, skillIds: ['bufu', 'mabufu'], traitId: 'cold-blooded' },
      { personaId: 'pixie', level: 3, skillIds: ['dia'], traitId: null },
    ],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('serializeProfile / parseImport round-trip', () => {
  it('exports the storage envelope and re-imports it unchanged', () => {
    const profile = sampleProfile();
    const text = serializeProfile(profile);

    const envelope = JSON.parse(text);
    expect(envelope.schemaVersion).toBe(COMPENDIUM_SCHEMA_VERSION);
    expect(typeof envelope.savedAt).toBe('string');

    const result = parseImport(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.entries).toEqual(profile.entries);
      expect(result.profile.protagonistLevel).toBe(42);
      expect(result.profile.name).toBe('My Compendium');
    }
  });
});

describe('exportFilename', () => {
  it('slugifies the profile name', () => {
    expect(exportFilename(sampleProfile({ name: 'Ren’s Run 2' }))).toBe('megaten-compendium-ren-s-run-2.json');
  });
  it('falls back when the name has no usable characters', () => {
    expect(exportFilename(sampleProfile({ name: '!!!' }))).toBe('megaten-compendium.json');
  });
});

describe('parseImport rejects bad files without partial application', () => {
  it('rejects non-JSON', () => {
    const r = parseImport('{ not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('valid JSON');
  });

  it('rejects a payload with no envelope', () => {
    const r = parseImport(JSON.stringify({ entries: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('version envelope');
  });

  it('refuses a future schema version rather than coercing it', () => {
    const r = parseImport(
      JSON.stringify({ schemaVersion: COMPENDIUM_SCHEMA_VERSION + 5, savedAt: 'x', data: sampleProfile() }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('newer version');
  });

  it('rejects a compendium for another game', () => {
    const r = parseImport(serializeProfile(sampleProfile({ gameId: 'smtv' as Profile['gameId'] })));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('different game');
  });

  it('rejects a malformed entry and reports which one', () => {
    const bad = {
      schemaVersion: COMPENDIUM_SCHEMA_VERSION,
      savedAt: 'x',
      data: { ...sampleProfile(), entries: [{ personaId: 'ok', level: 5, skillIds: [], traitId: null }, { level: 5 }] },
    };
    const r = parseImport(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Entry 2');
  });

  it('rejects a duplicate persona id', () => {
    const dup = {
      schemaVersion: COMPENDIUM_SCHEMA_VERSION,
      savedAt: 'x',
      data: {
        ...sampleProfile(),
        entries: [
          { personaId: 'pixie', level: 3, skillIds: [], traitId: null },
          { personaId: 'pixie', level: 4, skillIds: [], traitId: null },
        ],
      },
    };
    const r = parseImport(JSON.stringify(dup));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('duplicates');
  });

  it('clamps an out-of-range level on a valid import', () => {
    const r = parseImport(
      serializeProfile(sampleProfile({ entries: [{ personaId: 'p', level: 500, skillIds: [], traitId: null }] })),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.profile.entries[0].level).toBe(99);
  });
});
