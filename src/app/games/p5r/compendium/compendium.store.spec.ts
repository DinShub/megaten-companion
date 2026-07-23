import { TestBed } from '@angular/core/testing';

import type { StorageBackend } from '../../../core/storage/storage-envelope';
import { STORAGE_BACKEND, StorageService } from '../../../core/storage/storage.service';
import type { CompendiumEntry, Profile } from '../model';
import { SettingsStore } from '../settings/settings.store';
import { CompendiumStore } from './compendium.store';

class FakeBackend implements StorageBackend {
  readonly store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

interface Boot {
  compendium: CompendiumStore;
  settings: SettingsStore;
  storage: StorageService;
}

/** Build fresh stores over a given backend, as if the app had just started. */
function boot(backend: StorageBackend): Boot {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: STORAGE_BACKEND, useValue: backend }] });
  return {
    compendium: TestBed.inject(CompendiumStore),
    settings: TestBed.inject(SettingsStore),
    storage: TestBed.inject(StorageService),
  };
}

const JACK: CompendiumEntry = { personaId: 'jack-frost', level: 14, skillIds: ['bufu'], traitId: 'cold-blooded' };
const PIXIE: CompendiumEntry = { personaId: 'pixie', level: 3, skillIds: ['dia'], traitId: null };

describe('CompendiumStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts empty', () => {
    const { compendium } = boot(new FakeBackend());
    expect(compendium.count()).toBe(0);
    expect(compendium.has('jack-frost')).toBe(false);
  });

  it('upserts and exposes ownership through entryMap', () => {
    const { compendium } = boot(new FakeBackend());
    compendium.upsert(JACK);
    expect(compendium.count()).toBe(1);
    expect(compendium.has('jack-frost')).toBe(true);
    expect(compendium.entryFor('jack-frost')?.level).toBe(14);
  });

  it('upsert replaces rather than duplicating the same persona', () => {
    const { compendium } = boot(new FakeBackend());
    compendium.upsert(JACK);
    compendium.upsert({ ...JACK, level: 30 });
    expect(compendium.count()).toBe(1);
    expect(compendium.entryFor('jack-frost')?.level).toBe(30);
  });

  it('setLevel edits inline and clamps to 1..99', () => {
    const { compendium } = boot(new FakeBackend());
    compendium.upsert(JACK);
    compendium.setLevel('jack-frost', 200);
    expect(compendium.entryFor('jack-frost')?.level).toBe(99);
  });

  it('bulk-removes selected personas', () => {
    const { compendium } = boot(new FakeBackend());
    compendium.upsert(JACK);
    compendium.upsert(PIXIE);
    compendium.removeMany(['jack-frost']);
    expect(compendium.count()).toBe(1);
    expect(compendium.has('pixie')).toBe(true);
  });

  it('persists across a reload', () => {
    const backend = new FakeBackend();
    const first = boot(backend);
    first.compendium.upsert(JACK);
    first.compendium.upsert(PIXIE);
    first.storage.flushWrites();

    const second = boot(backend);
    expect(second.compendium.count()).toBe(2);
    expect(second.compendium.entryFor('jack-frost')?.skillIds).toEqual(['bufu']);
  });

  it('buildProfile folds in the protagonist level from settings', () => {
    const { compendium, settings } = boot(new FakeBackend());
    settings.setProtagonistLevel(55);
    compendium.upsert(JACK);
    const profile = compendium.buildProfile();
    expect(profile.gameId).toBe('p5r');
    expect(profile.protagonistLevel).toBe(55);
    expect(profile.entries).toHaveLength(1);
  });

  it('import replace swaps entries and adopts the protagonist level', () => {
    const { compendium, settings } = boot(new FakeBackend());
    compendium.upsert(JACK);
    const incoming: Profile = {
      id: 'x', name: 'Imported', gameId: 'p5r', protagonistLevel: 70,
      entries: [PIXIE], createdAt: 'a', updatedAt: 'b',
    };
    compendium.applyImport(incoming, 'replace');
    expect(compendium.count()).toBe(1);
    expect(compendium.has('jack-frost')).toBe(false);
    expect(compendium.has('pixie')).toBe(true);
    expect(settings.protagonistLevel()).toBe(70);
  });

  it('import merge overlays entries and keeps the current protagonist level', () => {
    const { compendium, settings } = boot(new FakeBackend());
    settings.setProtagonistLevel(20);
    compendium.upsert(JACK);
    const incoming: Profile = {
      id: 'x', name: 'Imported', gameId: 'p5r', protagonistLevel: 99,
      entries: [PIXIE, { ...JACK, level: 50 }], createdAt: 'a', updatedAt: 'b',
    };
    compendium.applyImport(incoming, 'merge');
    expect(compendium.count()).toBe(2);
    expect(compendium.entryFor('jack-frost')?.level).toBe(50); // imported wins
    expect(settings.protagonistLevel()).toBe(20); // unchanged on merge
  });
});
