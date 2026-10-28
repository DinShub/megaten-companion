import { TestBed } from '@angular/core/testing';

import { CompendiumStore } from '../../games/p5r/compendium/compendium.store';
import { SettingsStore } from '../../games/p5r/settings/settings.store';
import { Smt3CompendiumStore } from '../../games/smt3/compendium/smt3-compendium.store';
import type { StorageBackend } from '../storage/storage-envelope';
import { STORAGE_BACKEND, STORAGE_KEY_PREFIX, StorageService } from '../storage/storage.service';
import { BackupService, PAGE_RELOAD, type ValidBackup } from './backup.service';

class FakeBackend implements StorageBackend {
  readonly store = new Map<string, string>();
  /** The next write to this key fails, once — as when storage fills up mid-restore. */
  failKey: string | null = null;
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (key === this.failKey) {
      this.failKey = null;
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

/** A fresh app over `backend` — as after a reload. */
function boot(backend: StorageBackend, reload: () => void = () => undefined): BackupService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: STORAGE_BACKEND, useValue: backend },
      { provide: PAGE_RELOAD, useValue: reload },
    ],
  });
  return TestBed.inject(BackupService);
}

function valid(service: BackupService, text: string): ValidBackup {
  const result = service.parse(text);
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe('BackupService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('restores every game’s compendium and settings after they changed, then reloads', () => {
    const backend = new FakeBackend();
    let service = boot(backend);
    TestBed.inject(CompendiumStore).upsert({ personaId: 'arsene', level: 5, skillIds: ['eiha'], traitId: null });
    TestBed.inject(SettingsStore).setProtagonistLevel(42);
    TestBed.inject(Smt3CompendiumStore).upsert({ demonId: 'pixie', level: 3, skillIds: ['zio'] });
    // Not flushed yet: build() must still see the pending debounced writes.
    const text = service.build();

    // Diverge: different P5R data, Nocturne emptied.
    TestBed.inject(CompendiumStore).upsert({ personaId: 'pixie', level: 2, skillIds: [], traitId: null });
    TestBed.inject(SettingsStore).setProtagonistLevel(7);
    TestBed.inject(Smt3CompendiumStore).clear();
    TestBed.inject(StorageService).flushWrites();
    expect(JSON.parse(backend.store.get(`${STORAGE_KEY_PREFIX}settings`) as string).data.protagonistLevel).toBe(7);

    let reloads = 0;
    service = boot(backend, () => reloads++);
    expect(service.restore(valid(service, text))).toBeNull();
    expect(reloads).toBe(1);

    boot(backend); // the reload
    expect(TestBed.inject(CompendiumStore).entries().map((e) => e.personaId)).toEqual(['arsene']);
    expect(TestBed.inject(SettingsStore).protagonistLevel()).toBe(42);
    expect(TestBed.inject(Smt3CompendiumStore).entries()).toEqual([{ demonId: 'pixie', level: 3, skillIds: ['zio'] }]);
  });

  it('drops pending debounced writes so stale in-memory state can’t overwrite the restore', () => {
    const backend = new FakeBackend();
    const service = boot(backend);
    TestBed.inject(SettingsStore).setProtagonistLevel(42);
    const text = service.build();

    TestBed.inject(SettingsStore).setProtagonistLevel(7); // pending, not yet written
    service.restore(valid(service, text));
    TestBed.inject(StorageService).flushWrites(); // e.g. the beforeunload flush

    expect(JSON.parse(backend.store.get(`${STORAGE_KEY_PREFIX}settings`) as string).data.protagonistLevel).toBe(42);
  });

  it('rolls back and does not reload when a write fails part-way', () => {
    const backend = new FakeBackend();
    let service = boot(backend);
    TestBed.inject(SettingsStore).setProtagonistLevel(42);
    TestBed.inject(Smt3CompendiumStore).upsert({ demonId: 'pixie', level: 3, skillIds: [] });
    const text = service.build();

    // Current data differs from the backup: P5R settings at level 7, nothing else.
    backend.store.clear();
    backend.store.set(`${STORAGE_KEY_PREFIX}settings`, JSON.stringify({ schemaVersion: 1, savedAt: '', data: { protagonistLevel: 7 } }));
    const snapshot = new Map(backend.store);

    let reloads = 0;
    service = boot(backend, () => reloads++);
    // P5R settings are written first and succeed; the Nocturne compendium then fails.
    backend.failKey = `${STORAGE_KEY_PREFIX}smt3-compendium`;

    const error = service.restore(valid(service, text));
    expect(error).toContain('QuotaExceededError');
    expect(error).toContain('unchanged');
    expect(reloads).toBe(0);
    expect(backend.store).toEqual(snapshot);
  });
});
