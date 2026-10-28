import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { of } from 'rxjs';

import type { StorageBackend } from '../../../../core/storage/storage-envelope';
import { STORAGE_BACKEND } from '../../../../core/storage/storage.service';
import type { LoadedSmt3Data } from '../../data/game-data';
import { Smt3DataService } from '../../data/smt3-data.service';
import type { Demon, ElementChart, FusionChart, Magatama, Skill, SpecialRecipes } from '../../model';
import { Smt3CompendiumStore } from '../../compendium/smt3-compendium.store';
import { DemonDetail } from './demon-detail';

/**
 * Integration smoke for the demon page: mounts the real component, real fusion
 * store and real engine over the committed datasets (only the HTTP-backed data
 * service is stubbed), so the obtain/evolution/fuses-into sections are checked
 * against real recipes.
 */
const repoRoot = fileURLToPath(import.meta.url).replace(/[\\/]src[\\/].*$/, '');
const load = <T>(name: string): T => JSON.parse(readFileSync(`${repoRoot}/public/data/smt3/${name}.json`, 'utf8')) as T;

const DATA = {
  demons: load<Demon[]>('demons'),
  skills: load<Skill[]>('skills'),
  magatama: load<Magatama[]>('magatama'),
  fusionChart: load<FusionChart>('fusion-chart'),
  elementChart: load<ElementChart>('element-chart'),
  specialRecipes: load<SpecialRecipes>('special-recipes'),
  meta: { game: 'smt3', upstream: { repo: 'r', sha: 's', licence: 'l' }, importedAt: 'd', datasets: {}, notes: [] },
} as LoadedSmt3Data;

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

function stubService(): Smt3DataService {
  const data = signal(DATA);
  return {
    ready: signal(true),
    loading: signal(false),
    error: signal<string | null>(null),
    data,
    demonsById: computed(() => new Map(DATA.demons.map((d) => [d.id, d] as const))),
    skillsById: computed(() => new Map(DATA.skills.map((s) => [s.id, s] as const))),
    magatamaById: computed(() => new Map(DATA.magatama.map((m) => [m.id, m] as const))),
    retry: () => {},
  } as unknown as Smt3DataService;
}

function mount(id: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: STORAGE_BACKEND, useValue: new MemoryBackend() },
      { provide: Smt3DataService, useValue: stubService() },
      {
        provide: ActivatedRoute,
        useValue: { paramMap: of(convertToParamMap({ id })), snapshot: { paramMap: convertToParamMap({ id }), queryParamMap: convertToParamMap({}) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(DemonDetail);
  fixture.detectChanges();
  return fixture;
}

const text = (f: { nativeElement: HTMLElement }) => f.nativeElement.textContent ?? '';

describe('DemonDetail (integration)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows stats, skills, its element recipes, evolution and field data for Pixie', () => {
    const f = mount('pixie');
    const t = text(f);
    expect(t).toContain('Pixie');
    expect(t).toContain('Fairy');
    expect(t).toContain('Evolves into');
    expect(t).toContain('High Pixie');
    expect(t).toContain('Yoyogi Park');
    expect(t).toContain('Aeros');
    expect(t).toContain('2 recipes');
  });

  it('explains a Deathstone Fiend instead of listing pairs', () => {
    const t = text(mount('matador'));
    expect(t).toContain('Deathstone');
    expect(t).toContain('Yoma');
  });

  it('registers into the compendium with the native skill set', () => {
    const f = mount('pixie');
    const button = [...(f.nativeElement as HTMLElement).querySelectorAll('button')].find((b) => b.textContent?.includes('Register'))!;
    button.click();
    f.detectChanges();
    const entry = TestBed.inject(Smt3CompendiumStore).entryFor('pixie');
    expect(entry).toEqual({ demonId: 'pixie', level: 2, skillIds: ['dia', 'zio'] });
    expect(text(f)).toContain('Registered · Lv 2');
  });

  it('says so for an unknown id', () => {
    expect(text(mount('nobody'))).toContain('no demon with id “nobody”');
  });
});
