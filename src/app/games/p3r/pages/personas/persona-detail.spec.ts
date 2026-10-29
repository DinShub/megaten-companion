import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { of } from 'rxjs';

import type { StorageBackend } from '../../../../core/storage/storage-envelope';
import { STORAGE_BACKEND } from '../../../../core/storage/storage.service';
import type { LoadedP3rData } from '../../data/game-data';
import { P3rDataService } from '../../data/p3r-data.service';
import type { FusionChart, InheritMatrix, Persona, Shadow, Skill, SpecialRecipe } from '../../model';
import { P3rCompendiumStore } from '../../compendium/p3r-compendium.store';
import { PersonaDetail } from './persona-detail';

/**
 * Integration smoke for the persona page: mounts the real component, real fusion
 * store and real engine over the committed datasets (only the HTTP-backed data
 * service is stubbed), so the obtain and fuses-into sections are checked
 * against real recipes.
 */
const repoRoot = fileURLToPath(import.meta.url).replace(/[\\/]src[\\/].*$/, '');
const load = <T>(name: string): T => JSON.parse(readFileSync(`${repoRoot}/public/data/p3r/${name}.json`, 'utf8')) as T;

const DATA = {
  personas: load<Persona[]>('personas'),
  skills: load<Skill[]>('skills'),
  shadows: load<Shadow[]>('shadows'),
  fusionChart: load<FusionChart>('fusion-chart'),
  specialRecipes: load<SpecialRecipe[]>('special-recipes'),
  inheritMatrix: load<InheritMatrix>('inherit-matrix'),
  meta: { game: 'p3r', upstream: { repo: 'r', sha: 's', licence: 'l' }, importedAt: 'd', datasets: {}, notes: [] },
} as LoadedP3rData;

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

function stubService(): P3rDataService {
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
  } as unknown as P3rDataService;
}

function mount(id: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: STORAGE_BACKEND, useValue: new MemoryBackend() },
      { provide: P3rDataService, useValue: stubService() },
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

  it('shows stats, skills, inheritance and recipes for Omoikane', () => {
    const t = text(mount('omoikane'));
    expect(t).toContain('Omoikane');
    expect(t).toContain('Hierophant');
    expect(t).toContain('Electric L inheritance type');
    expect(t).toContain('Zio');
    expect(t).toMatch(/\d+ recipes/);
  });

  it('shows a heart item and marks a Theurgy', () => {
    const jack = text(mount('jack-frost'));
    expect(jack).toContain('Heart item: Jacktite at Lv 11');
    expect(jack).toContain('Theurgy');
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
    const entry = TestBed.inject(P3rCompendiumStore).entryFor('pixie');
    expect(entry).toEqual({ personaId: 'pixie', level: 2, skillIds: ['dia', 'pulinpa'] });
    expect(text(f)).toContain('Registered · Lv 2');
  });

  it('says so for an unknown id', () => {
    expect(text(mount('nobody'))).toContain('no persona with id “nobody”');
  });
});
