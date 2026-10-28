import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { App } from '../../app';
import { rootRedirect } from '../../app.routes';
import { DEFAULT_GAME_ID, GAMES } from '../../games/game.registry';
import type { StorageBackend } from '../storage/storage-envelope';
import { STORAGE_BACKEND, StorageService } from '../storage/storage.service';
import { LastGameService } from './last-game.service';

class FakeBackend implements StorageBackend {
  readonly map = new Map<string, string>();
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

@Component({ template: '' })
class Blank {}

const KEY = 'megaten-companion:v1:last-game';
const OTHER = GAMES.find((g) => g.id !== DEFAULT_GAME_ID)!.id;
const envelope = (data: unknown) => JSON.stringify({ schemaVersion: 1, savedAt: 'x', data });

/** Real root redirect, with each game's lazy subtree swapped for a blank page. */
function boot(backend: FakeBackend) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      { provide: STORAGE_BACKEND, useValue: backend },
      provideRouter([
        { path: '', pathMatch: 'full', redirectTo: rootRedirect },
        ...GAMES.map((g) => ({ path: g.id, component: Blank })),
        { path: '**', component: Blank },
      ]),
    ],
  });
  // The shell owns the "remember on navigation" side.
  TestBed.createComponent(App);
  return TestBed.inject(Router);
}

describe('last-opened game', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('opens the default game on a first visit', async () => {
    const router = boot(new FakeBackend());
    await router.navigateByUrl('/');
    expect(router.url).toBe(`/${DEFAULT_GAME_ID}`);
  });

  it('reopens the game remembered from the last session', async () => {
    const backend = new FakeBackend();
    backend.map.set(KEY, envelope(OTHER));
    const router = boot(backend);
    await router.navigateByUrl('/');
    expect(router.url).toBe(`/${OTHER}`);
  });

  it('falls back to the default for a stale or corrupt stored value', async () => {
    for (const raw of [envelope('no-such-game'), envelope(42), 'not json']) {
      const backend = new FakeBackend();
      backend.map.set(KEY, raw);
      const router = boot(backend);
      await router.navigateByUrl('/');
      expect(router.url).toBe(`/${DEFAULT_GAME_ID}`);
    }
  });

  it('remembers a visited game across a reload, but not a not-found URL', async () => {
    const backend = new FakeBackend();
    let router = boot(backend);
    await router.navigateByUrl(`/${OTHER}`);
    await router.navigateByUrl('/definitely-not-a-game');
    TestBed.inject(StorageService).flushWrites();
    expect(JSON.parse(backend.map.get(KEY)!).data).toBe(OTHER);

    router = boot(backend);
    await router.navigateByUrl('/');
    expect(router.url).toBe(`/${OTHER}`);
  });

  it('only writes when the game actually changes', () => {
    const backend = new FakeBackend();
    boot(backend);
    const service = TestBed.inject(LastGameService);
    const storage = TestBed.inject(StorageService);
    service.remember(OTHER);
    storage.flushWrites();
    backend.map.delete(KEY);
    service.remember(OTHER);
    storage.flushWrites();
    expect(backend.map.has(KEY)).toBe(false);
  });
});
