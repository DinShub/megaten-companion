import { TestBed } from '@angular/core/testing';

import type { FetchFn } from '../cloud/drive-app-data';
import { GoogleAuth, GoogleAuthError } from '../cloud/google-auth';
import type { StorageBackend } from '../storage/storage-envelope';
import { STORAGE_BACKEND, StorageService } from '../storage/storage.service';
import type { StoredValue } from '../../games/game.model';
import { BACKUP_VALUES, BackupService, PAGE_RELOAD } from './backup.service';
import { DRIVE_FETCH, DriveBackupService } from './drive-backup.service';

class FakeBackend implements StorageBackend {
  private readonly map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

const VALUES: readonly StoredValue[] = [{ key: 'notes', label: 'Notes', version: 1, validate: () => null }];

describe('DriveBackupService', () => {
  let answers: (Response | Error)[];
  let calls: { url: string; init: RequestInit | undefined }[];
  let getToken: () => Promise<string>;
  let cleared: number;
  let reloads: number;

  const fetchFn: FetchFn = async (url, init) => {
    calls.push({ url, init });
    const next = answers.shift();
    if (!next) throw new Error('unexpected request');
    if (next instanceof Error) throw next;
    return next;
  };

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const noFile = () => json({ files: [] });
  const oneFile = () => json({ files: [{ id: 'abc' }] });

  function service(): DriveBackupService {
    return TestBed.inject(DriveBackupService);
  }

  beforeEach(() => {
    answers = [];
    calls = [];
    cleared = 0;
    reloads = 0;
    getToken = () => Promise.resolve('tok');
    TestBed.configureTestingModule({
      providers: [
        { provide: STORAGE_BACKEND, useValue: new FakeBackend() },
        { provide: BACKUP_VALUES, useValue: VALUES },
        { provide: PAGE_RELOAD, useValue: () => reloads++ },
        { provide: DRIVE_FETCH, useValue: fetchFn },
        {
          provide: GoogleAuth,
          useValue: {
            preload: () => Promise.resolve(),
            getToken: () => getToken(),
            clearToken: () => cleared++,
          },
        },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  describe('save', () => {
    it('uploads what is stored now, even with a pending write', async () => {
      TestBed.inject(StorageService).write(
        { key: 'notes', currentVersion: 1, migrations: {} },
        'latest edit',
      );
      answers = [noFile(), json({ id: 'new' })];

      await service().save();

      expect(calls[1].init?.body).toContain('latest edit');
      expect(service().error()).toBeNull();
      expect(service().status()).toContain('Saved to Drive');
      expect(service().busy()).toBe(false);
    });

    it('overwrites the Drive copy without comparing anything', async () => {
      answers = [oneFile(), json({ id: 'abc' })];
      await service().save();
      expect(calls.length).toBe(2);
      expect(calls[1].init?.method).toBe('PATCH');
    });

    it('says the Drive copy is unchanged after a network failure', async () => {
      answers = [new TypeError('Failed to fetch')];
      await service().save();
      expect(service().error()).toBe('Couldn’t save to Drive (Failed to fetch). The Drive copy is unchanged.');
      expect(service().status()).not.toContain('Saved to Drive');
      expect(service().busy()).toBe(false);
    });
  });

  describe('load', () => {
    it('returns a validated backup and applies nothing', async () => {
      const text = TestBed.inject(BackupService).build();
      answers = [oneFile(), new Response(text)];

      const result = await service().load();

      expect(result?.items.map((i) => i.label)).toEqual(['Notes']);
      expect(reloads).toBe(0);
      expect(service().error()).toBeNull();
    });

    it('restores through the normal path once confirmed', async () => {
      const text = TestBed.inject(BackupService).build();
      answers = [oneFile(), new Response(text)];
      const result = await service().load();

      expect(TestBed.inject(BackupService).restore(result as NonNullable<typeof result>)).toBeNull();
      expect(reloads).toBe(1);
    });

    it('says when nothing has been saved', async () => {
      answers = [noFile()];
      expect(await service().load()).toBeNull();
      expect(service().error()).toBe('Nothing has been saved to Drive yet.');
    });

    it('refuses a newer-format file with the usual message', async () => {
      const future = JSON.stringify({ schemaVersion: 99, savedAt: '', data: {} });
      answers = [oneFile(), new Response(future)];

      expect(await service().load()).toBeNull();
      expect(service().error()).toContain('newer version of the app');
      expect(reloads).toBe(0);
    });

    it('reports a failed download without touching local data', async () => {
      answers = [oneFile(), json({ error: { message: 'Backend Error' } }, 500)];
      expect(await service().load()).toBeNull();
      expect(service().error()).toBe('Couldn’t load from Drive (Backend Error). Your data is unchanged.');
    });
  });

  describe('failures', () => {
    it('drops the token when Drive rejects it', async () => {
      answers = [json({ error: { message: 'Invalid Credentials' } }, 401)];
      await service().save();
      expect(cleared).toBe(1);
      expect(service().error()).toBe('Your Google session expired — press the button again.');
    });

    it('passes on Drive’s reason for refusing access', async () => {
      answers = [json({ error: { message: 'API not enabled' } }, 403)];
      await service().load();
      expect(service().error()).toBe('Google Drive refused access (API not enabled).');
    });

    it.each([
      ['cancelled', 'cancelled or blocked'],
      ['unreachable', 'Couldn’t reach Google'],
      ['scope-denied', 'access wasn’t granted'],
    ] as const)('explains a %s sign-in and makes no Drive call', async (kind, message) => {
      getToken = () => Promise.reject(new GoogleAuthError(kind));
      await service().save();
      expect(service().error()).toContain(message);
      expect(calls.length).toBe(0);
    });

    it('clears the last error on the next press', async () => {
      answers = [noFile()];
      await service().load();
      expect(service().error()).not.toBeNull();

      answers = [noFile(), json({ id: 'new' })];
      await service().save();
      expect(service().error()).toBeNull();
    });
  });
});
