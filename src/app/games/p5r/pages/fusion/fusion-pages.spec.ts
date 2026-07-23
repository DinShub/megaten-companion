import { signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { StorageBackend } from '../../../../core/storage/storage-envelope';
import { STORAGE_BACKEND } from '../../../../core/storage/storage.service';
import { CompendiumStore } from '../../compendium/compendium.store';
import { GameDataService } from '../../data/game-data.service';
import { SettingsStore } from '../../settings/settings.store';
import { FusionStore } from './fusion.store';
import { ForwardCalculator } from './forward-calculator';
import { ReverseCalculator } from './reverse-calculator';
import { ItemizationPage } from './itemization-page';
import { FusionCalculator } from './fusion-calculator';
import { RouteFinder } from './route-finder';

// ---- storage double -----------------------------------------------------

class FakeBackend implements StorageBackend {
  private readonly map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

// ---- dataset fixture ----------------------------------------------------
// A minimal but engine-valid slice: magician m1..m5, lovers l1..l2,
// devil d1..d3 (+ special sp1), fool tr1 (treasure) / pt1 (party).

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

function skill(over: Record<string, unknown>) {
  return {
    name: over['id'], element: 'almighty', inheritElement: null, cost: null, target: '1 foe',
    description: '', rank: 10, unique: false, cardLocations: [], cardSources: [], ...over,
  };
}

const PERSONAS = [
  persona({ id: 'm1', name: 'M-One', arcana: 'magician', level: 2 }),
  persona({
    id: 'm2', name: 'Jack Frost', arcana: 'magician', level: 11, traitId: 'cold-blooded',
    itemization: { normal: 'agi', alarm: 'bufu', normalItem: null, alarmItem: null },
    learnedSkills: [
      { skillId: 'agi', kind: 'innate', order: 1 },
      { skillId: 'bufu', kind: 'level', level: 5 },
      { skillId: 'megido', kind: 'innate', order: 2 },
      { skillId: 'tarukaja', kind: 'level', level: 20 }, // above base → not native
    ],
  }),
  persona({ id: 'm3', name: 'M-Three', arcana: 'magician', level: 17 }),
  persona({ id: 'm4', name: 'M-Four', arcana: 'magician', level: 30 }),
  persona({ id: 'm5', name: 'M-Five', arcana: 'magician', level: 50 }),
  persona({ id: 'l1', name: 'Pixie', arcana: 'lovers', level: 2, traitId: 'ariadne-thread' }),
  persona({ id: 'l2', name: 'L-Two', arcana: 'lovers', level: 20 }),
  persona({ id: 'd1', name: 'D-One', arcana: 'devil', level: 5 }),
  persona({ id: 'd2', name: 'Incubus', arcana: 'devil', level: 27, inheritType: 'fire',
    itemization: { normal: 'zionga', alarm: 'mabufu', normalItem: null, alarmItem: null } }),
  persona({ id: 'd3', name: 'D-Three', arcana: 'devil', level: 60 }),
  persona({ id: 'sp1', name: 'Special One', arcana: 'devil', level: 40, kind: 'special' }),
  persona({ id: 'tr1', name: 'Regent', arcana: 'fool', level: 8, kind: 'treasure' }),
  persona({ id: 'pt1', name: 'Arsene', arcana: 'fool', level: 5, kind: 'party' }),
];

const SKILLS = [
  skill({ id: 'agi', name: 'Agi', element: 'fire', inheritElement: 'fire',
    cardSources: [{ kind: 'itemization', from: 'm2' }] }),
  skill({ id: 'bufu', name: 'Bufu', element: 'ice', inheritElement: 'ice',
    cardSources: [{ kind: 'itemization-alarm', from: 'm2' }, { kind: 'negotiation', from: 'sh1' }] }),
  skill({ id: 'megido', name: 'Megido', element: 'almighty', inheritElement: null, unique: true }),
  skill({ id: 'tarukaja', name: 'Tarukaja', element: 'support', inheritElement: null }),
  // d2's itemization cards — deliberately not in any parent's pool, so the forward
  // test can detect the alarm card ('Mabufu') without colliding with a learned skill.
  skill({ id: 'zionga', name: 'Zionga', element: 'elec', inheritElement: 'elec' }),
  skill({ id: 'mabufu', name: 'Mabufu', element: 'ice', inheritElement: 'ice' }),
];

// fire inherit type: fire yes, ice no (the §6.5 opposing-element block).
const FIRE_ROW = { phys: true, gun: true, fire: true, ice: false, elec: true, wind: true,
  psy: true, nuke: true, bless: true, curse: true, ailment: true, healing: true };
const ALL_ROW = { ...FIRE_ROW, ice: true };
const NONE_ROW = { phys: false, gun: false, fire: false, ice: false, elec: false, wind: false,
  psy: false, nuke: false, bless: false, curse: false, ailment: false, healing: false };

const INHERIT_MATRIX = { fire: FIRE_ROW, almighty: ALL_ROW, ice: ALL_ROW, none: NONE_ROW } as never;

function grid() {
  // devil = magician + lovers; everything else null. Symmetric.
  const g: Record<string, Record<string, string | null>> = {};
  const arcana = ['magician', 'lovers', 'devil', 'fool'];
  for (const a of arcana) { g[a] = {}; for (const b of arcana) g[a][b] = null; }
  g['magician']['lovers'] = 'devil';
  g['lovers']['magician'] = 'devil';
  return { grid: g as never };
}

const TEST_DATA = {
  personas: PERSONAS,
  skills: SKILLS,
  traits: [
    { id: 'cold-blooded', name: 'Cold Blooded', description: '', rank: 0 },
    { id: 'ariadne-thread', name: 'Ariadne Thread', description: '', rank: 0 },
  ],
  shadows: [{ id: 'sh1', name: 'Shadow Pixie', personaId: null }],
  accessories: [],
  fusionChart: grid(),
  advancedRecipes: { recipes: [{ resultId: 'sp1', ingredientIds: ['m2', 'l2'] }], treasureIds: ['tr1'] },
  elementChart: { offsets: { magician: { tr1: 1 } } as never },
  inheritMatrix: INHERIT_MATRIX,
  meta: {},
};

function stubGameData() {
  return {
    ready: signal(true),
    loading: signal(false),
    error: signal<string | null>(null),
    data: signal(TEST_DATA),
    retry: () => {},
  } as unknown as GameDataService;
}

// ---- harness ------------------------------------------------------------

function mount<T>(type: Type<T>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: STORAGE_BACKEND, useValue: new FakeBackend() },
      { provide: GameDataService, useValue: stubGameData() },
    ],
  });
  const fixture = TestBed.createComponent(type);
  fixture.detectChanges();
  return {
    fixture,
    text: () => (fixture.nativeElement as HTMLElement).textContent ?? '',
    settings: TestBed.inject(SettingsStore),
    compendium: TestBed.inject(CompendiumStore),
    store: TestBed.inject(FusionStore),
    sync: () => fixture.detectChanges(),
  };
}

// A permissive view of each component's protected surface, for driving it.
type ForwardApi = { setSlot(i: number, id: string): void; clearSlot(i: number): void; addSlot(): void };
type ReverseApi = { targetId: { set(v: string): void } };
type ItemApi = { mode: { set(v: string): void }; personaId: { set(v: string): void }; skillId: { set(v: string): void } };
type ShellApi = { mode: { set(v: string): void } };
type RouteApi = {
  onTarget(id: string): void;
  addSkill(id: string): void;
  find(): void;
  pool: { set(v: string): void };
};

afterEach(() => TestBed.resetTestingModule());

// ---- FusionStore --------------------------------------------------------

describe('FusionStore (the Angular seam over the §6 engine)', () => {
  it('builds an engine and a context from settings + the compendium', () => {
    const { store, settings, compendium } = mount(ForwardCalculator);
    expect(store.engine()).not.toBeNull();

    settings.setProtagonistLevel(42);
    settings.setAlarm(true);
    compendium.upsert({ personaId: 'm2', level: 30, skillIds: ['agi'], traitId: null });

    const ctx = store.ctx();
    expect(ctx.protagonistLevel).toBe(42);
    expect(ctx.alarm).toBe(true);
    expect(ctx.compendium.get('m2')?.level).toBe(30);
  });

  it('resolves inherit masks off the matrix (fire blocks ice; none blocks all)', () => {
    const { store } = mount(ForwardCalculator);
    expect(store.inheritMask('fire')['fire']).toBe(true);
    expect(store.inheritMask('fire')['ice']).toBe(false);
    expect(store.inheritMask('none')['phys']).toBe(false);
  });

  it('badges picker options by ownership', () => {
    const { store, compendium } = mount(ForwardCalculator);
    compendium.upsert({ personaId: 'm2', level: 11, skillIds: [], traitId: null });
    const opt = store.pickerOptions().find((o) => o.id === 'm2');
    expect(opt?.owned).toBe(true);
    expect(store.pickerOptions().find((o) => o.id === 'm1')?.owned).toBe(false);
  });
});

// ---- Forward calculator (task 41) --------------------------------------

describe('ForwardCalculator (§4.7.1, task 41)', () => {
  function pick(api: ForwardApi, a: string, b: string) {
    api.setSlot(0, a);
    api.setSlot(1, b);
  }

  it('fuses two parents and shows the result and its path', () => {
    const h = mount(ForwardCalculator);
    pick(h.fixture.componentInstance as unknown as ForwardApi, 'm2', 'l1');
    h.sync();
    // m2(11) + l1(2): grid[magician][lovers]=devil, target 7 → lowest ≥ 7 is Incubus (d2, lv27).
    expect(h.text()).toContain('Incubus');
    expect(h.text()).toContain('Standard fusion');
  });

  it('greys ineligible inherited skills and labels the blocking element (§6.5)', () => {
    const h = mount(ForwardCalculator);
    pick(h.fixture.componentInstance as unknown as ForwardApi, 'm2', 'l1');
    h.sync();
    const text = h.text();
    // Incubus is a fire inheritor: Agi (fire) rides, Bufu (ice) is blocked, Megido is unique.
    expect(text).toContain('Agi');
    expect(text).toContain('Blocked: Ice');
    expect(text).toContain('Unique');
  });

  it('offers a trait from each parent', () => {
    const h = mount(ForwardCalculator);
    pick(h.fixture.componentInstance as unknown as ForwardApi, 'm2', 'l1');
    h.sync();
    expect(h.text()).toContain('Cold Blooded');
    expect(h.text()).toContain('Ariadne Thread');
  });

  it('explains a same-persona pairing instead of blanking (§1.1)', () => {
    const h = mount(ForwardCalculator);
    pick(h.fixture.componentInstance as unknown as ForwardApi, 'm2', 'm2');
    h.sync();
    expect(h.text()).toContain('same persona twice');
  });

  it('rejects a party persona as material', () => {
    const h = mount(ForwardCalculator);
    pick(h.fixture.componentInstance as unknown as ForwardApi, 'pt1', 'm2');
    h.sync();
    expect(h.text().toLowerCase()).toContain('party personas');
  });

  it('shows the alarm itemization variant only when the alarm is on (§6.7)', () => {
    const h = mount(ForwardCalculator);
    pick(h.fixture.componentInstance as unknown as ForwardApi, 'm2', 'l1');
    h.sync();
    expect(h.text()).toContain('Zionga'); // d2's normal card, always shown
    expect(h.text()).not.toContain('Mabufu'); // alarm card hidden by default
    h.settings.setAlarm(true);
    h.sync();
    expect(h.text()).toContain('Mabufu'); // d2's alarm card now shown
  });
});

// ---- Reverse calculator (task 42) --------------------------------------

describe('ReverseCalculator (§4.7.2, task 42)', () => {
  it('lists standard recipes for a target and flags the ones I can make now', () => {
    const h = mount(ReverseCalculator);
    h.compendium.upsert({ personaId: 'm2', level: 11, skillIds: [], traitId: null });
    h.compendium.upsert({ personaId: 'l1', level: 2, skillIds: [], traitId: null });
    (h.fixture.componentInstance as unknown as ReverseApi).targetId.set('d2');
    h.sync();
    const text = h.text();
    expect(text).toContain('Standard recipes');
    expect(text).toContain('Jack Frost'); // m2
    expect(text).toContain('Pixie'); // l1
    expect(text).toContain('Ready'); // both owned
  });

  it('shows the advanced recipe and the special-only note for a special target', () => {
    const h = mount(ReverseCalculator);
    (h.fixture.componentInstance as unknown as ReverseApi).targetId.set('sp1');
    h.sync();
    const text = h.text();
    expect(text).toContain('Advanced (special) fusion');
    expect(text).toContain('Special persona');
    expect(text).toContain('Jack Frost'); // m2, an advanced ingredient
  });
});

// ---- Itemization (task 43) ---------------------------------------------

describe('ItemizationPage (§6.7, task 43)', () => {
  it('shows a persona’s normal and alarm cards side by side (§6.7)', () => {
    const h = mount(ItemizationPage);
    (h.fixture.componentInstance as unknown as ItemApi).personaId.set('m2');
    h.sync();
    // The itemization page always compares both — that is its whole point (§6.7),
    // unlike the forward calculator, which gates the alarm column behind the toggle.
    expect(h.text()).toContain('Agi'); // normal itemization
    expect(h.text()).toContain('Bufu'); // alarm itemization
  });

  it('reverse index: which personas itemize to a card', () => {
    const h = mount(ItemizationPage);
    const api = h.fixture.componentInstance as unknown as ItemApi;
    api.mode.set('card');
    api.skillId.set('agi');
    h.sync();
    // Agi is itemized from Jack Frost (m2).
    expect(h.text()).toContain('Jack Frost');
  });
});

// ---- Route finder (task 52) --------------------------------------------
// The RouteFinderStore has a synchronous fallback when `Worker` is absent (jsdom),
// so search() computes on the calling thread and the result renders after sync().

describe('RouteFinder (§4.7.3, task 52)', () => {
  function ready(api: RouteApi, settings: ReturnType<typeof mount>['settings']) {
    // Obtainable pool at a high level with the cap off, so the tiny fixture has
    // material to fuse and nothing is level-blocked.
    settings.setProtagonistLevel(99);
    settings.setEnforceLevelCap(false);
    api.pool.set('obtainable');
  }

  it('renders the target, objective, pool and depth controls', () => {
    const h = mount(RouteFinder);
    const text = h.text();
    expect(text).toContain('Target persona');
    expect(text).toContain('Objective');
    expect(text).toContain('Fewest steps');
    expect(text).toContain('Parent pool');
    expect(text).toContain('Max depth');
  });

  it('finds and renders routes to a target', () => {
    const h = mount(RouteFinder);
    const api = h.fixture.componentInstance as unknown as RouteApi;
    ready(api, h.settings);
    api.onTarget('d2'); // Incubus, made from m2 + l1 (magician + lovers → devil)
    api.find();
    h.sync();
    expect(h.text()).toContain('Incubus');
    expect(h.text().toLowerCase()).toContain('route');
  });

  it('resolves an inherit-blocked skill via its card (§6.6, task 47)', () => {
    const h = mount(RouteFinder);
    const api = h.fixture.componentInstance as unknown as RouteApi;
    ready(api, h.settings);
    api.onTarget('d2'); // fire inherit type — blocks ice
    api.addSkill('bufu'); // ice, but has an itemization-alarm + negotiation card
    api.find();
    h.sync();
    const text = h.text();
    expect(text).toContain('Bufu');
    expect(text.toLowerCase()).toContain('card'); // satisfied via the card source
  });

  it('explains a unique, card-less skill as a gap (§7.4, task 49)', () => {
    const h = mount(RouteFinder);
    const api = h.fixture.componentInstance as unknown as RouteApi;
    ready(api, h.settings);
    api.onTarget('d2');
    api.addSkill('megido'); // unique, no card
    api.find();
    h.sync();
    expect(h.text().toLowerCase()).toContain('unique');
  });

  it('never dead-ends: a party target is explained, not blanked (§1.1)', () => {
    const h = mount(RouteFinder);
    const api = h.fixture.componentInstance as unknown as RouteApi;
    ready(api, h.settings);
    api.onTarget('pt1'); // Arsene — a party persona
    api.find();
    h.sync();
    expect(h.text().toLowerCase()).toContain('party');
  });
});

// ---- Calculator shell ---------------------------------------------------

describe('FusionCalculator shell', () => {
  it('starts on forward and toggles to reverse', () => {
    const h = mount(FusionCalculator);
    expect(h.text()).toContain('Parent 1');
    (h.fixture.componentInstance as unknown as ShellApi).mode.set('reverse');
    h.sync();
    expect(h.text()).toContain('Target persona');
  });
});
