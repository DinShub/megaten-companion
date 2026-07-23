import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import type { StorageBackend } from '../../../core/storage/storage-envelope';
import { STORAGE_BACKEND } from '../../../core/storage/storage.service';
import { p5rGame } from '../p5r.game';
import { SettingsStore } from '../settings/settings.store';
import { GameDataService } from './game-data.service';

class FakeBackend implements StorageBackend {
  readonly store = new Map<string, string>();
  getItem(k: string): string | null {
    return this.store.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, v);
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
}

const SHA = 'abc123';

// Minimal runtime payloads — the service stores JSON verbatim, and the indexes
// read only a handful of persona fields, so partial objects are enough here.
const PERSONAS = [
  { id: 'jack-frost', name: 'Jack Frost', arcana: 'magician', level: 11, kind: 'normal', unlock: null, learnedSkills: [] },
  {
    id: 'ariadne',
    name: 'Ariadne',
    arcana: 'fortune',
    level: 40,
    kind: 'normal',
    unlock: { group: 'dlc', condition: 'Ariadne Set DLC' },
    learnedSkills: [],
  },
];

const META = {
  game: 'p5r',
  upstream: { repo: 'aqiu384/megaten-fusion-tool', sha: SHA, licence: 'The Unlicense' },
  importedAt: '2026-07-23',
  datasets: {},
  notes: [],
};

// Shadows + accessories load lazily (task 58), so they're not part of the
// primary bundle a `load()` fetches.
const PRIMARY_BODIES: Record<string, object> = {
  personas: PERSONAS,
  skills: [],
  traits: [],
  'fusion-chart': { grid: {} },
  'advanced-recipes': { recipes: [], treasureIds: [] },
  'element-chart': { offsets: {} },
  'inherit-matrix': {},
};

const EXTRAS_BODIES: Record<string, object> = {
  shadows: [{ id: 'pixie-shadow', name: 'Pixie', kind: 'shadow' }],
  accessories: [],
};

function setup(): { svc: GameDataService; http: HttpTestingController; settings: SettingsStore } {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: STORAGE_BACKEND, useValue: new FakeBackend() },
    ],
  });
  return {
    svc: TestBed.inject(GameDataService),
    http: TestBed.inject(HttpTestingController),
    settings: TestBed.inject(SettingsStore),
  };
}

/** Flush meta, then every cache-busted primary dataset request. */
function flushSuccessfulLoad(http: HttpTestingController): void {
  http.expectOne('data/p5r/meta.json').flush(META);
  for (const [name, body] of Object.entries(PRIMARY_BODIES)) {
    http.expectOne(`data/p5r/${name}.json?v=${SHA}`).flush(body);
  }
}

/** Flush the on-demand extras (shadows + accessories). */
function flushExtras(http: HttpTestingController): void {
  for (const [name, body] of Object.entries(EXTRAS_BODIES)) {
    http.expectOne(`data/p5r/${name}.json?v=${SHA}`).flush(body);
  }
}

describe('GameDataService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });

  it('loads meta first, then each dataset cache-busted by the meta SHA (§8.5)', () => {
    const { svc, http } = setup();
    svc.load(p5rGame);
    flushSuccessfulLoad(http);

    expect(svc.ready()).toBe(true);
    expect(svc.error()).toBeNull();
    expect(svc.data()!.personas.length).toBe(2);
  });

  it('does not fetch shadows on the primary load — they load lazily (task 58)', () => {
    const { svc, http } = setup();
    svc.load(p5rGame);
    flushSuccessfulLoad(http);

    // Primary is ready without ever requesting the shadow dataset.
    expect(svc.ready()).toBe(true);
    expect(svc.extrasReady()).toBe(false);
    expect(svc.data()!.shadows).toEqual([]);
    http.expectNone(`data/p5r/shadows.json?v=${SHA}`);
    http.expectNone(`data/p5r/accessories.json?v=${SHA}`);

    // Requesting extras fetches them and merges them into the bundle.
    svc.loadExtras();
    flushExtras(http);
    expect(svc.extrasReady()).toBe(true);
    expect(svc.data()!.shadows.length).toBe(1);
  });

  it('defers loadExtras() called before the primary load finishes until it completes', () => {
    const { svc, http } = setup();
    svc.load(p5rGame);
    svc.loadExtras(); // requested while primary is still in flight
    http.expectNone(`data/p5r/shadows.json?v=${SHA}`); // not yet — primary not ready

    flushSuccessfulLoad(http); // primary completes → extras kick off
    flushExtras(http);
    expect(svc.extrasReady()).toBe(true);
    expect(svc.data()!.shadows.length).toBe(1);
  });

  it('loads once per session — a second load issues no further requests', () => {
    const { svc, http } = setup();
    svc.load(p5rGame);
    flushSuccessfulLoad(http);

    svc.load(p5rGame); // already ready
    http.expectNone('data/p5r/meta.json');
    http.expectNone(`data/p5r/personas.json?v=${SHA}`);
  });

  it('surfaces a retryable error on network failure rather than throwing', () => {
    const { svc, http } = setup();
    svc.load(p5rGame);
    http.expectOne('data/p5r/meta.json').flush('down', { status: 503, statusText: 'Unavailable' });

    expect(svc.status()).toBe('error');
    expect(svc.error()).toContain('retry');
    expect(svc.data()).toBeNull();

    // Retry recovers.
    svc.retry();
    flushSuccessfulLoad(http);
    expect(svc.ready()).toBe(true);
  });

  it('rebuilds resultsByArcana when the DLC unlock toggle flips (task 13)', () => {
    const { svc, http, settings } = setup();
    svc.load(p5rGame);
    flushSuccessfulLoad(http);

    // DLC defaults off: Ariadne (a DLC persona) is absent from her arcana.
    expect(svc.resultsByArcana().get('fortune')!.map((p) => p.id)).toEqual([]);
    // A non-DLC normal persona is always present.
    expect(svc.resultsByArcana().get('magician')!.map((p) => p.id)).toEqual(['jack-frost']);

    settings.setUnlockGroup('dlc', true);
    expect(svc.resultsByArcana().get('fortune')!.map((p) => p.id)).toEqual(['ariadne']);

    settings.setUnlockGroup('dlc', false);
    expect(svc.resultsByArcana().get('fortune')!.map((p) => p.id)).toEqual([]);
  });
});
