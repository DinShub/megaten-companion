import { TestBed } from '@angular/core/testing';

import type { StorageBackend } from '../../../core/storage/storage-envelope';
import { STORAGE_BACKEND, StorageService } from '../../../core/storage/storage.service';
import { Smt1SettingsStore } from '../settings/smt1-settings.store';
import { MAX_NOTE_LENGTH, parseImport, serializeProfile } from './smt1-compendium-io';
import { Smt1CompendiumStore } from './smt1-compendium.store';

class FakeBackend implements StorageBackend {
  readonly store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

function boot(backend: StorageBackend) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: STORAGE_BACKEND, useValue: backend }] });
  return {
    compendium: TestBed.inject(Smt1CompendiumStore),
    settings: TestBed.inject(Smt1SettingsStore),
    storage: TestBed.inject(StorageService),
  };
}

describe('Smt1CompendiumStore', () => {
  it('ticks, notes and unticks a demon', () => {
    const { compendium } = boot(new FakeBackend());
    compendium.setOwned('pixie', true);
    compendium.setNote('pixie', '  Recruited in Shinjuku  ');
    expect(compendium.entryFor('pixie')?.note).toBe('Recruited in Shinjuku');
    compendium.setOwned('pixie', false);
    expect(compendium.has('pixie')).toBe(false);
    expect(compendium.count()).toBe(0);
  });

  it('caps notes', () => {
    const { compendium } = boot(new FakeBackend());
    compendium.setOwned('pixie', true);
    compendium.setNote('pixie', 'x'.repeat(MAX_NOTE_LENGTH + 50));
    expect(compendium.entryFor('pixie')?.note.length).toBe(MAX_NOTE_LENGTH);
  });

  it('persists across a reload', () => {
    const backend = new FakeBackend();
    const first = boot(backend);
    first.compendium.setOwned('barong', true);
    first.storage.flushWrites();
    expect(boot(backend).compendium.has('barong')).toBe(true);
  });

  it('round-trips an export and merges or replaces on import', () => {
    const { compendium, settings } = boot(new FakeBackend());
    settings.setHeroLevel(40);
    compendium.setOwned('barong', true);
    compendium.setNote('barong', 'For Shiva');
    const parsed = parseImport(serializeProfile(compendium.buildProfile()), new Set(['barong', 'rangda']));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.profile.heroLevel).toBe(40);
    expect(parsed.profile.entries[0].note).toBe('For Shiva');

    compendium.clear();
    compendium.setOwned('rangda', true);
    compendium.applyImport(parsed.profile, 'merge');
    expect([...compendium.ownedIds()].sort()).toEqual(['barong', 'rangda']);
    compendium.applyImport(parsed.profile, 'replace');
    expect([...compendium.ownedIds()]).toEqual(['barong']);
  });

  it('refuses another game’s file and unknown demons', () => {
    const other = JSON.stringify({ schemaVersion: 1, data: { gameId: 'smt3', entries: [] } });
    expect(parseImport(other)).toEqual({ ok: false, error: expect.stringMatching(/different game/) });
    const unknown = JSON.stringify({ schemaVersion: 1, data: { gameId: 'smt1', entries: [{ demonId: 'nobody', note: '' }] } });
    expect(parseImport(unknown, new Set(['pixie']))).toEqual({ ok: false, error: expect.stringMatching(/unknown demon/) });
  });
});
