import { TestBed } from '@angular/core/testing';

import type { StorageBackend, StorageSchema } from './storage-envelope';
import { STORAGE_BACKEND, STORAGE_KEY_PREFIX, StorageService } from './storage.service';

/** A backend backed by a plain object, so each test starts clean. */
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

/** A backend whose writes always fail, as in private mode / over quota. */
class ThrowingBackend implements StorageBackend {
  getItem(): string | null {
    return null;
  }
  setItem(): void {
    const err = new Error('quota');
    err.name = 'QuotaExceededError';
    throw err;
  }
  removeItem(): void {
    /* no-op */
  }
}

interface Widget {
  name: string;
  count: number;
}

function makeService(backend: StorageBackend): StorageService {
  TestBed.configureTestingModule({
    providers: [{ provide: STORAGE_BACKEND, useValue: backend }],
  });
  return TestBed.inject(StorageService);
}

const V1: StorageSchema<Widget> = { key: 'widget', currentVersion: 1, migrations: {} };

describe('StorageService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('round-trips a value through the envelope', () => {
    const backend = new FakeBackend();
    const svc = makeService(backend);

    svc.write(V1, { name: 'jack', count: 3 });
    svc.flushWrites();

    // Stored under the namespaced key, wrapped in an envelope.
    const raw = backend.store.get(`${STORAGE_KEY_PREFIX}widget`);
    expect(raw).toBeTruthy();
    const envelope = JSON.parse(raw as string);
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.data).toEqual({ name: 'jack', count: 3 });

    const read = svc.read(V1);
    expect(read).toEqual({ status: 'ok', data: { name: 'jack', count: 3 } });
  });

  it('reports empty when nothing is stored', () => {
    const svc = makeService(new FakeBackend());
    expect(svc.read(V1).status).toBe('empty');
  });

  it('debounces: nothing is committed until flush', () => {
    const backend = new FakeBackend();
    const svc = makeService(backend);
    svc.write(V1, { name: 'a', count: 1 });
    expect(backend.store.size).toBe(0); // still pending
    svc.flushWrites();
    expect(backend.store.size).toBe(1);
  });

  it('migrates an older payload up the chain to the current version', () => {
    const backend = new FakeBackend();
    // Seed a v1 payload directly.
    backend.store.set(
      `${STORAGE_KEY_PREFIX}widget`,
      JSON.stringify({ schemaVersion: 1, savedAt: '2020-01-01T00:00:00.000Z', data: { name: 'x' } }),
    );
    const svc = makeService(backend);

    const v3: StorageSchema<Widget> = {
      key: 'widget',
      currentVersion: 3,
      migrations: {
        1: (d) => ({ ...(d as object), count: 0 }), // v1 → v2 adds count
        2: (d) => ({ ...(d as Widget), count: (d as Widget).count + 5 }), // v2 → v3 bumps it
      },
    };
    expect(svc.read(v3)).toEqual({ status: 'ok', data: { name: 'x', count: 5 } });
  });

  it('fails loudly when a migration step is missing', () => {
    const backend = new FakeBackend();
    backend.store.set(
      `${STORAGE_KEY_PREFIX}widget`,
      JSON.stringify({ schemaVersion: 1, savedAt: '2020-01-01T00:00:00.000Z', data: {} }),
    );
    const svc = makeService(backend);
    const v2: StorageSchema<Widget> = { key: 'widget', currentVersion: 2, migrations: {} };
    const result = svc.read(v2);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.reason).toBe('migration-failed');
      expect(result.message).toContain('v1');
    }
  });

  it('refuses a payload written by a newer version (§9.4)', () => {
    const backend = new FakeBackend();
    backend.store.set(
      `${STORAGE_KEY_PREFIX}widget`,
      JSON.stringify({ schemaVersion: 9, savedAt: '2030-01-01T00:00:00.000Z', data: { name: 'z', count: 1 } }),
    );
    const svc = makeService(backend);
    const result = svc.read(V1);
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.reason).toBe('future-version');
  });

  it('reports corruption for non-envelope JSON', () => {
    const backend = new FakeBackend();
    backend.store.set(`${STORAGE_KEY_PREFIX}widget`, '{"nope": true}');
    const svc = makeService(backend);
    const result = svc.read(V1);
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.reason).toBe('corrupt');
  });

  it('surfaces a persistent failure banner when a write fails, without throwing', () => {
    const svc = makeService(new ThrowingBackend());
    expect(svc.failure()).toBeNull();
    expect(() => {
      svc.write(V1, { name: 'lost', count: 1 });
      svc.flushWrites();
    }).not.toThrow();
    expect(svc.failure()).toBeTruthy();
    expect(svc.failure()).toContain('save');
  });
});
