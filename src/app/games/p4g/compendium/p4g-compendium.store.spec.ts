import { TestBed } from '@angular/core/testing';

import type { StorageBackend } from '../../../core/storage/storage-envelope';
import { STORAGE_BACKEND, StorageService } from '../../../core/storage/storage.service';
import { P4gSettingsStore } from '../settings/p4g-settings.store';
import { MAX_SKILLS, P4gCompendiumStore } from './p4g-compendium.store';

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
    compendium: TestBed.inject(P4gCompendiumStore),
    settings: TestBed.inject(P4gSettingsStore),
    storage: TestBed.inject(StorageService),
  };
}

describe('P4gCompendiumStore / P4gSettingsStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('survives a reload', () => {
    const backend = new FakeBackend();
    const first = boot(backend);
    first.compendium.upsert({ personaId: 'pixie', level: 20, skillIds: ['dia', 'agidyne'] });
    first.settings.setProtagonistLevel(42);
    first.settings.setUnlockGroup('social-link', false);
    first.storage.flushWrites();

    const second = boot(backend);
    expect(second.compendium.entryFor('pixie')).toEqual({ personaId: 'pixie', level: 20, skillIds: ['dia', 'agidyne'] });
    expect(second.settings.protagonistLevel()).toBe(42);
    expect(second.settings.unlockGroups()).toEqual({ story: true, 'social-link': false });
  });

  it('writes only its own namespaced key, so it never touches another game', () => {
    const backend = new FakeBackend();
    const s = boot(backend);
    s.settings.setProtagonistLevel(42);
    s.storage.flushWrites();
    expect([...backend.store.keys()]).toEqual(['megaten-companion:v1:p4g-settings']);
  });

  it('caps skills at eight, de-duplicates them and clamps the level', () => {
    const { compendium } = boot(new FakeBackend());
    compendium.upsert({ personaId: 'pixie', level: 140, skillIds: ['a', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] });
    const entry = compendium.entryFor('pixie')!;
    expect(entry.level).toBe(99);
    expect(entry.skillIds.length).toBe(MAX_SKILLS);
    expect(entry.skillIds[1]).toBe('b');
  });

  it('merges or replaces on import, adopting the protagonist level only on replace', () => {
    const { compendium, settings } = boot(new FakeBackend());
    compendium.upsert({ personaId: 'pixie', level: 2, skillIds: [] });
    const profile = {
      id: 'x', name: 'Imported', gameId: 'p4g' as const, protagonistLevel: 50,
      entries: [{ personaId: 'jack-frost', level: 7, skillIds: [] }], createdAt: 'a', updatedAt: 'b',
    };
    compendium.applyImport(profile, 'merge');
    expect(compendium.count()).toBe(2);
    expect(settings.protagonistLevel()).toBe(1);
    compendium.applyImport(profile, 'replace');
    expect(compendium.count()).toBe(1);
    expect(compendium.name()).toBe('Imported');
    expect(settings.protagonistLevel()).toBe(50);
  });

  it('exports the full profile with the protagonist level', () => {
    const { compendium, settings } = boot(new FakeBackend());
    settings.setProtagonistLevel(33);
    compendium.upsert({ personaId: 'pixie', level: 2, skillIds: [] });
    const profile = compendium.buildProfile();
    expect(profile.gameId).toBe('p4g');
    expect(profile.protagonistLevel).toBe(33);
    expect(profile.entries.length).toBe(1);
  });
});
