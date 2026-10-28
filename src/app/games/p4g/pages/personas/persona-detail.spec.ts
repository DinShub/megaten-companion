import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { of } from 'rxjs';

import type { StorageBackend } from '../../../../core/storage/storage-envelope';
import { STORAGE_BACKEND } from '../../../../core/storage/storage.service';
import type { LoadedP4gData } from '../../data/game-data';
import { P4gDataService } from '../../data/p4g-data.service';
import type { FusionChart, InheritMatrix, Persona, Shadow, Skill, SpecialRecipe } from '../../model';
import { P4gCompendiumStore } from '../../compendium/p4g-compendium.store';
import { PersonaDetail } from './persona-detail';

/**
 * Integration smoke for the persona page: mounts the real component, real fusion
 * store and real engine over the committed datasets (only the HTTP-backed data
 * service is stubbed), so the obtain and fuses-into sections are checked
 * against real recipes.
 */
const repoRoot = fileURLToPath(import.meta.url).replace(/[\\/]src[\\/].*$/, '');
const load = <T>(name: string): T => JSON.parse(readFileSync(`${repoRoot}/public/data/p4g/${name}.json`, 'utf8')) as T;

const DATA = {
  personas: load<Persona[]>('personas'),
  skills: load<Skill[]>('skills'),
  shadows: load<Shadow[]>('shadows'),
  fusionChart: load<FusionChart>('fusion-chart'),
  specialRecipes: load<SpecialRecipe[]>('special-recipes'),
  inheritMatrix: load<InheritMatrix>('inherit-matrix'),
  meta: { game: 'p4g', upstream: { repo: 'r', sha: 's', licence: 'l' }, importedAt: 'd', datasets: {}, notes: [] },
} as LoadedP4gData;

class MemoryBackend implements StorageBackend {
  private readonly m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

function stubService(): P4gDataService {
  const data = signal(DATA);
  return {
    ready: signal(true),
    loading: signal(false),
    error: signal<string | null>(null),
    data,
    personasById: computed(() => new Map(DATA.personas.map((d) => [d.id, d] as const))),
    skillsById: computed(() => new Map(DATA.skills.map((s) => [s.id, s] as const))),
    shadowsById: computed(() => new Map(DATA.shadows.map((s) => [s.id, s] as const))),
    retry: () => {},
  } as unknown as P4gDataService;
}

function mount(id: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: STORAGE_BACKEND, useValue: new MemoryBackend() },
      { provide: P4gDataService, useValue: stubService() },
      {
        provide: ActivatedRoute,
        useValue: { paramMap: of(convertToParamMap({ id })), snapshot: { paramMap: convertToParamMap({ id }), queryParamMap: convertToParamMap({}) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(PersonaDetail);
  fixture.detectChanges();
  return fixture;
}

const text = (f: { nativeElement: HTMLElement }) => f.nativeElement.textContent ?? '';

describe('PersonaDetail (integration)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows stats, skills, inheritance and recipes for Sylph', () => {
    const t = text(mount('sylph'));
    expect(t).toContain('Sylph');
    expect(t).toContain('Temperance');
    expect(t).toContain('Wind inheritance type');
    expect(t).toContain('Garu');
    expect(t).toMatch(/\d+ recipes/);
  });

  it('shows the whole special recipe instead of listing pairs', () => {
    const t = text(mount('norn'));
    expect(t).toContain('Special fusion of all 3 at once');
    expect(t).toContain('Clotho');
    expect(t).toContain('Atropos');
  });

  it('registers into the compendium with the native skill set', () => {
    const f = mount('pixie');
    const button = [...(f.nativeElement as HTMLElement).querySelectorAll('button')].find((b) => b.textContent?.includes('Register'))!;
    button.click();
    f.detectChanges();
    const entry = TestBed.inject(P4gCompendiumStore).entryFor('pixie');
    expect(entry).toEqual({ personaId: 'pixie', level: 2, skillIds: ['dia', 'patra'] });
    expect(text(f)).toContain('Registered · Lv 2');
  });

  it('says so for an unknown id', () => {
    expect(text(mount('nobody'))).toContain('there is no persona with id “nobody”');
  });
});
