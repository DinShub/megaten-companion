import { TestBed } from '@angular/core/testing';

import type { StorageBackend } from '../../../core/storage/storage-envelope';
import { STORAGE_BACKEND, StorageService } from '../../../core/storage/storage.service';
import { DEFAULT_SETTINGS, SettingsStore } from './settings.store';

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

/** Build a fresh store over a given backend, as if the app had just started. */
function bootStore(backend: StorageBackend): { store: SettingsStore; storage: StorageService } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: STORAGE_BACKEND, useValue: backend }],
  });
  return { store: TestBed.inject(SettingsStore), storage: TestBed.inject(StorageService) };
}

describe('SettingsStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts from the documented defaults (DLC off, others on)', () => {
    const { store } = bootStore(new FakeBackend());
    expect(store.settings()).toEqual(DEFAULT_SETTINGS);
    expect(store.unlockGroups().dlc).toBe(false);
    expect(store.unlockGroups().story).toBe(true);
  });

  it('persists changes across a reload', () => {
    const backend = new FakeBackend();
    const first = bootStore(backend);
    first.store.setProtagonistLevel(62);
    first.store.setUnlockGroup('dlc', true);
    first.store.setAlarm(true);
    first.storage.flushWrites();

    // Simulate a reload: brand-new store instances over the same backend.
    const second = bootStore(backend);
    expect(second.store.protagonistLevel()).toBe(62);
    expect(second.store.unlockGroups().dlc).toBe(true);
    expect(second.store.alarm()).toBe(true);
  });

  it('clamps the protagonist level to 1..99', () => {
    const { store } = bootStore(new FakeBackend());
    store.setProtagonistLevel(200);
    expect(store.protagonistLevel()).toBe(99);
    store.setProtagonistLevel(0);
    expect(store.protagonistLevel()).toBe(1);
  });

  it('reset returns to defaults and clears storage', () => {
    const backend = new FakeBackend();
    const { store, storage } = bootStore(backend);
    store.setUnlockGroup('dlc', true);
    storage.flushWrites();
    store.reset();
    expect(store.settings()).toEqual(DEFAULT_SETTINGS);

    const reloaded = bootStore(backend);
    expect(reloaded.store.unlockGroups().dlc).toBe(false);
  });
});
