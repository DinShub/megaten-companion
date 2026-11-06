import { computed, signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { AiTool } from '../core/ai/ai.model';
import type { GameAi } from '../core/ai/game-ai';
import { runTool } from '../core/ai/run-tool';
import type { StorageBackend } from '../core/storage/storage-envelope';
import { STORAGE_BACKEND, STORAGE_KEY_PREFIX } from '../core/storage/storage.service';
import { P3rAi } from './p3r/ai/p3r-ai';
import { P3rDataService } from './p3r/data/p3r-data.service';
import { P3R_COMPENDIUM, P3R_SETTINGS } from './p3r/p3r.storage';
import { P4gAi } from './p4g/ai/p4g-ai';
import { P4gDataService } from './p4g/data/p4g-data.service';
import { P4G_COMPENDIUM, P4G_SETTINGS } from './p4g/p4g.storage';
import { P5rAi } from './p5r/ai/p5r-ai';
import { GameDataService } from './p5r/data/game-data.service';
import { P5R_COMPENDIUM, P5R_SETTINGS } from './p5r/p5r.storage';
import { Smt1Ai } from './smt1/ai/smt1-ai';
import { Smt1DataService } from './smt1/data/smt1-data.service';
import { SMT1_COMPENDIUM, SMT1_SETTINGS } from './smt1/smt1.storage';
import { Smt3Ai } from './smt3/ai/smt3-ai';
import { Smt3DataService } from './smt3/data/smt3-data.service';
import { SMT3_COMPENDIUM, SMT3_SETTINGS } from './smt3/smt3.storage';

/**
 * Every game's real stores, engine and route finder over its committed data, with
 * only the HTTP-backed data service stubbed. Each tool is called the way a model
 * would call it, by name with JSON arguments, so a wrong field or a mismatched
 * engine call in any adapter fails here.
 */
const repoRoot = fileURLToPath(import.meta.url).replace(/[\\/]src[\\/].*$/, '');
const load = (game: string, name: string): any =>
  JSON.parse(readFileSync(`${repoRoot}/public/data/${game}/${name}.json`, 'utf8'));

class MemoryBackend implements StorageBackend {
  readonly map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

interface Case {
  readonly id: string;
  readonly adapter: Type<GameAi>;
  readonly service: Type<unknown>;
  readonly rosterKey: 'personas' | 'demons';
  readonly idKey: 'personaId' | 'demonId';
  readonly compendiumKey: string;
  readonly settingsKey: string;
  readonly levelSetting: 'protagonistLevel' | 'heroLevel';
  readonly data: Record<string, unknown>;
  readonly extraTools: readonly (readonly [string, Record<string, unknown>])[];
  readonly hasSkillRoutes: boolean;
  readonly keptBack: (entry: any) => boolean;
}

const personaGame = (id: string) => ({
  personas: load(id, 'personas'),
  skills: load(id, 'skills'),
  shadows: load(id, 'shadows'),
  fusionChart: load(id, 'fusion-chart'),
  specialRecipes: load(id, 'special-recipes'),
  inheritMatrix: load(id, 'inherit-matrix'),
});

const CASES: readonly Case[] = [
  {
    id: 'p5r',
    adapter: P5rAi,
    service: GameDataService,
    rosterKey: 'personas',
    idKey: 'personaId',
    compendiumKey: P5R_COMPENDIUM.key,
    settingsKey: P5R_SETTINGS.key,
    levelSetting: 'protagonistLevel',
    data: {
      personas: load('p5r', 'personas'),
      skills: load('p5r', 'skills'),
      traits: load('p5r', 'traits'),
      shadows: load('p5r', 'shadows'),
      accessories: load('p5r', 'accessories'),
      classroom: load('p5r', 'classroom'),
      fusionChart: load('p5r', 'fusion-chart'),
      advancedRecipes: load('p5r', 'advanced-recipes'),
      elementChart: load('p5r', 'element-chart'),
      inheritMatrix: load('p5r', 'inherit-matrix'),
    },
    extraTools: [
      ['search_enemies', { weak_to: 'fire', limit: 3 }],
      ['search_classroom', { date: '5/12' }],
    ],
    hasSkillRoutes: true,
    keptBack: (p) => p.kind === 'normal',
  },
  {
    id: 'p3r',
    adapter: P3rAi,
    service: P3rDataService,
    rosterKey: 'personas',
    idKey: 'personaId',
    compendiumKey: P3R_COMPENDIUM.key,
    settingsKey: P3R_SETTINGS.key,
    levelSetting: 'protagonistLevel',
    data: personaGame('p3r'),
    extraTools: [['search_enemies', { weak_to: 'fire', limit: 3 }]],
    hasSkillRoutes: true,
    keptBack: (p) => p.kind === 'normal',
  },
  {
    id: 'p4g',
    adapter: P4gAi,
    service: P4gDataService,
    rosterKey: 'personas',
    idKey: 'personaId',
    compendiumKey: P4G_COMPENDIUM.key,
    settingsKey: P4G_SETTINGS.key,
    levelSetting: 'protagonistLevel',
    data: personaGame('p4g'),
    extraTools: [['search_enemies', { weak_to: 'fire', limit: 3 }]],
    hasSkillRoutes: true,
    keptBack: (p) => p.kind === 'normal',
  },
  {
    id: 'smt3',
    adapter: Smt3Ai,
    service: Smt3DataService,
    rosterKey: 'demons',
    idKey: 'demonId',
    compendiumKey: SMT3_COMPENDIUM.key,
    settingsKey: SMT3_SETTINGS.key,
    levelSetting: 'protagonistLevel',
    data: {
      demons: load('smt3', 'demons'),
      skills: load('smt3', 'skills'),
      magatama: load('smt3', 'magatama'),
      fusionChart: load('smt3', 'fusion-chart'),
      elementChart: load('smt3', 'element-chart'),
      specialRecipes: load('smt3', 'special-recipes'),
    },
    extraTools: [
      ['search_enemies', { limit: 3 }],
      ['search_magatama', { resists: 'fire' }],
    ],
    hasSkillRoutes: true,
    keptBack: (d) => d.kind === 'normal',
  },
  {
    id: 'smt1',
    adapter: Smt1Ai,
    service: Smt1DataService,
    rosterKey: 'demons',
    idKey: 'demonId',
    compendiumKey: SMT1_COMPENDIUM.key,
    settingsKey: SMT1_SETTINGS.key,
    levelSetting: 'heroLevel',
    data: {
      demons: load('smt1', 'demons'),
      skills: load('smt1', 'skills'),
      races: load('smt1', 'races'),
      fusionChart: load('smt1', 'fusion-chart'),
      tripleChart: load('smt1', 'triple-chart'),
      elementChart: load('smt1', 'element-chart'),
      specialRecipes: load('smt1', 'special-recipes'),
    },
    extraTools: [],
    hasSkillRoutes: false,
    keptBack: (d) => d.kind === 'normal',
  },
];

function envelope(data: unknown): string {
  return JSON.stringify({ schemaVersion: 1, savedAt: 'x', data });
}

function stubService(c: Case): unknown {
  const data = signal({ ...c.data, meta: {} } as any);
  const byId = (list: unknown) => computed(() => new Map((list as { id: string }[]).map((x) => [x.id, x] as const)));
  return {
    data,
    status: signal('ready'),
    error: signal(null),
    ready: signal(true),
    retry: () => undefined,
    loadExtras: () => undefined,
    loadClassroom: () => undefined,
    personasById: byId(c.data['personas'] ?? []),
    demonsById: byId(c.data['demons'] ?? []),
    skillsById: byId(c.data['skills']),
    shadowsById: byId(c.data['shadows'] ?? []),
  };
}

/** The adapter over real stores, with a compendium of the lowest-level normal entries. */
function mount(c: Case, ownedCount = 12) {
  const roster = (c.data[c.rosterKey] as any[]).filter(c.keptBack).sort((a, b) => a.level - b.level);
  const owned = roster.slice(0, ownedCount);
  const entries = owned.map((r) =>
    c.id === 'smt1'
      ? { demonId: r.id, note: 'my note', addedAt: 'x' }
      : { [c.idKey]: r.id, level: r.level, skillIds: [], traitId: null },
  );
  const backend = new MemoryBackend();
  backend.setItem(`${STORAGE_KEY_PREFIX}${c.compendiumKey}`, envelope({ id: 'default', name: 'Mine', entries, createdAt: 'x', updatedAt: 'x' }));
  backend.setItem(`${STORAGE_KEY_PREFIX}${c.settingsKey}`, envelope({ [c.levelSetting]: 99, enforceLevelCap: true }));

  TestBed.configureTestingModule({
    providers: [
      { provide: STORAGE_BACKEND, useValue: backend },
      { provide: c.service, useValue: stubService(c) },
    ],
  });
  const game = TestBed.inject(c.adapter);
  return { game, tools: game.tools(), owned, roster };
}

function call(tools: readonly AiTool[], name: string, args: Record<string, unknown> = {}): any {
  const run = runTool(tools, name, args);
  expect(run.isError, `${name}: ${run.output}`).toBe(false);
  return JSON.parse(run.output);
}

describe.each(CASES)('$id chat adapter', (c) => {
  it('describes the player in the snapshot', () => {
    const { game, owned } = mount(c);
    const snapshot = game.snapshot();
    expect(snapshot).toContain('99');
    expect(snapshot).toContain(`(${owned.length} of`);
    for (const r of owned) expect(snapshot).toContain(r.name);
  });

  it('answers roster and skill lookups', () => {
    const { tools, owned, roster } = mount(c);
    const target = roster[roster.length - 1];

    const search = call(tools, 'search_roster', { owned: true, limit: 60 });
    expect(search.total).toBe(owned.length);

    const details = call(tools, 'get_details', { name: target.name });
    expect(details.name).toBe(target.name);
    expect(details.affinities).toBeDefined();
    expect(call(tools, 'get_details', { name: owned[0].name })).toBeTruthy();

    const skillName = (c.data['skills'] as { name: string }[])[0].name;
    expect(call(tools, 'search_skills', { query: skillName }).total).toBeGreaterThan(0);
    const skill = call(tools, 'get_skill', { name: skillName });
    expect(skill.name).toBe(skillName);
    expect(Array.isArray(skill.learned_by)).toBe(true);
  });

  it("fusable_now's recipes really make what it claims", () => {
    const { tools, owned } = mount(c, 25);
    const now = call(tools, 'fusable_now', { limit: 60 });
    expect(now.owned_count).toBe(owned.length);
    expect(now.total).toBeGreaterThan(0);
    const ownedNames = new Set(owned.map((r) => r.name));
    for (const row of now.results) {
      expect(ownedNames.has(row.name)).toBe(false);
      for (const ingredient of row.one_recipe) expect(ownedNames.has(ingredient)).toBe(true);
      const fused = call(tools, 'fuse', { ingredients: row.one_recipe });
      expect(fused.fusable, `${row.one_recipe.join(' + ')}: ${fused.reason}`).toBe(true);
      expect(fused.result).toBe(row.name);
    }
  });

  it('recipes_for and fusions_from agree with the fusion engine', () => {
    const { tools, owned } = mount(c, 25);
    const made = call(tools, 'fusable_now').results[0];

    const recipes = call(tools, 'recipes_for', { target: made.name });
    expect(recipes.total).toBeGreaterThan(0);
    expect(recipes.results[0].missing).toBe(0);
    const pair = recipes.results.find((r: any) => r.ingredients.length === 2);
    const fused = call(tools, 'fuse', { ingredients: pair.ingredients.map((i: any) => i.name) });
    expect(fused.result).toBe(made.name);

    const forward = call(tools, 'fusions_from', { ingredient: owned[0].name, limit: 5 });
    expect(forward.ingredient).toBe(owned[0].name);
    expect(forward.total).toBeGreaterThan(0);
  });

  it('find_route plans a route the player can follow', () => {
    const { tools } = mount(c, 25);
    const made = call(tools, 'fusable_now').results[0];
    const plan = call(tools, 'find_route', { target: made.name });
    expect(plan.routes.length, JSON.stringify(plan.problems)).toBeGreaterThan(0);
    const route = plan.routes[0];
    expect(route.steps.at(-1)).toContain(`→ ${made.name}`);
    expect(route.start_with.every((leaf: any) => leaf.owned)).toBe(true);

    const open = call(tools, 'find_route', { target: made.name, pool: 'open', objective: 'cheapest', max_depth: 2 });
    expect(open.routes.length).toBeGreaterThan(0);
  });

  it(c.hasSkillRoutes ? 'find_route takes wanted skills' : 'find_route has no skills argument', () => {
    const { tools } = mount(c, 25);
    const route = tools.find((t) => t.name === 'find_route');
    expect('skills' in (route?.parameters.properties ?? {})).toBe(c.hasSkillRoutes);
    if (!c.hasSkillRoutes) return;
    const made = call(tools, 'fusable_now').results[0];
    const skill = (c.data['skills'] as { name: string }[])[0].name;
    const plan = call(tools, 'find_route', { target: made.name, skills: [skill] });
    expect(plan.routes.every((r: any) => r.skills[0].skill === skill)).toBe(true);
  });

  it('runs its game-specific lookups', () => {
    const { tools } = mount(c);
    for (const [name, args] of c.extraTools) {
      expect(call(tools, name, args).total).toBeGreaterThan(0);
    }
  });
});
