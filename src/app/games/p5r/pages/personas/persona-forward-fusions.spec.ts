import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { StorageBackend } from '../../../../core/storage/storage-envelope';
import { STORAGE_BACKEND } from '../../../../core/storage/storage.service';
import { CompendiumStore } from '../../compendium/compendium.store';
import { GameDataService } from '../../data/game-data.service';
import { SettingsStore } from '../../settings/settings.store';
import { PersonaForwardFusions } from './persona-forward-fusions';

// ---- storage double -----------------------------------------------------

class FakeBackend implements StorageBackend {
  private readonly map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

// ---- dataset fixture ----------------------------------------------------
// A minimal engine-valid slice, mirroring fusion-pages.spec: magician m1..m5,
// lovers l1..l2, devil d1..d3 (+ special sp1), fool tr1 (treasure) / pt1 (party).
// Grid: magician + lovers = devil. Advanced: m2 + l2 → sp1. Treasure: tr1 (+1 in magician).

const STATS = { strength: 5, magic: 5, endurance: 5, agility: 5, luck: 5 };

function persona(over: Record<string, unknown>) {
  return {
    name: over['id'], inheritType: 'almighty', traitId: null, stats: STATS, growth: STATS,
    maxStats: null, affinities: {}, learnedSkills: [], learnedTraits: [], kind: 'normal',
    unlock: null, prereq: null,
    itemization: { normal: null, alarm: null, normalItem: null, alarmItem: null },
    ...over,
  };
}

const PERSONAS = [
  persona({ id: 'm1', name: 'M-One', arcana: 'magician', level: 2 }),
  persona({ id: 'm2', name: 'Jack Frost', arcana: 'magician', level: 11 }),
  persona({ id: 'm3', name: 'M-Three', arcana: 'magician', level: 17 }),
  persona({ id: 'm4', name: 'M-Four', arcana: 'magician', level: 30 }),
  persona({ id: 'm5', name: 'M-Five', arcana: 'magician', level: 50 }),
  persona({ id: 'l1', name: 'Pixie', arcana: 'lovers', level: 2 }),
  persona({ id: 'l2', name: 'L-Two', arcana: 'lovers', level: 20 }),
  persona({ id: 'd1', name: 'D-One', arcana: 'devil', level: 5 }),
  persona({ id: 'd2', name: 'Incubus', arcana: 'devil', level: 27 }),
  persona({ id: 'd3', name: 'D-Three', arcana: 'devil', level: 60 }),
  persona({ id: 'sp1', name: 'Special One', arcana: 'devil', level: 40, kind: 'special' }),
  persona({ id: 'tr1', name: 'Regent', arcana: 'fool', level: 8, kind: 'treasure' }),
  persona({ id: 'pt1', name: 'Arsene', arcana: 'fool', level: 5, kind: 'party' }),
];

function grid() {
  const g: Record<string, Record<string, string | null>> = {};
  const arcana = ['magician', 'lovers', 'devil', 'fool'];
  for (const a of arcana) { g[a] = {}; for (const b of arcana) g[a][b] = null; }
  g['magician']['lovers'] = 'devil';
  g['lovers']['magician'] = 'devil';
  return { grid: g as never };
}

const TEST_DATA = {
  personas: PERSONAS,
  skills: [],
  traits: [],
  shadows: [],
  accessories: [],
  fusionChart: grid(),
  advancedRecipes: { recipes: [{ resultId: 'sp1', ingredientIds: ['m2', 'l2'] }], treasureIds: ['tr1'] },
  elementChart: { offsets: { magician: { tr1: 1 } } as never },
  inheritMatrix: {} as never,
  meta: {},
};

function stubGameData() {
  return {
    ready: signal(true),
    loading: signal(false),
    error: signal<string | null>(null),
    data: signal(TEST_DATA),
    retry: () => {},
    loadExtras: () => {},
  } as unknown as GameDataService;
}

// ---- harness ------------------------------------------------------------

function mount(personaId: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: STORAGE_BACKEND, useValue: new FakeBackend() },
      { provide: GameDataService, useValue: stubGameData() },
    ],
  });
  const fixture = TestBed.createComponent(PersonaForwardFusions);
  fixture.componentRef.setInput('personaId', personaId);
  fixture.detectChanges();
  return {
    fixture,
    text: () => (fixture.nativeElement as HTMLElement).textContent ?? '',
    compendium: TestBed.inject(CompendiumStore),
    settings: TestBed.inject(SettingsStore),
    sync: () => fixture.detectChanges(),
  };
}

afterEach(() => TestBed.resetTestingModule());

// ---- tests --------------------------------------------------------------

describe('PersonaForwardFusions (forward fusions on the persona detail page)', () => {
  it('lists a result the viewed persona can produce as a fusion ingredient', () => {
    const h = mount('m2'); // Jack Frost
    const text = h.text();
    expect(text).toContain('Fusions using Jack Frost');
    // m2 + l1 → Incubus (d2): magician + lovers = devil, target 7 → lowest ≥ 7 is d2.
    expect(text).toContain('Incubus');
    // The partner that makes it is linked by name.
    expect(text).toContain('Pixie'); // l1, a partner
  });

  it('flags a result as Ready when a partner is registered', () => {
    const h = mount('m2');
    // No partner owned yet → nothing is ready.
    expect(h.text()).not.toContain('Ready');
    h.compendium.upsert({ personaId: 'l1', level: 2, skillIds: [], traitId: null });
    h.sync();
    // Owning Pixie (l1) makes the Incubus fusion doable now.
    expect(h.text()).toContain('Ready');
  });

  it('shows a friendly note for a party persona and lists no fusions', () => {
    const h = mount('pt1'); // Arsene — a party persona, never fusion material
    expect(h.text().toLowerCase()).toContain("can't be used as fusion material");
    expect(h.text()).not.toContain('Incubus');
  });
});
