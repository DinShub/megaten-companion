import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { StorageBackend } from '../../../../core/storage/storage-envelope';
import { STORAGE_BACKEND } from '../../../../core/storage/storage.service';
import { CompendiumStore } from '../../compendium/compendium.store';
import { GameDataService } from '../../data/game-data.service';
import type { PickerOption } from '../../../../shared/persona-picker/persona-picker';
import { CompendiumPage } from './compendium-page';

class FakeBackend implements StorageBackend {
  private readonly map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

const JACK = {
  id: 'jack-frost', name: 'Jack Frost', arcana: 'magician', level: 12, inheritType: 'ice',
  traitId: 'cold-blooded', stats: { strength: 1, magic: 1, endurance: 1, agility: 1, luck: 1 },
  growth: null, maxStats: null, affinities: {}, learnedTraits: [], kind: 'normal', unlock: null,
  prereq: null, itemization: { normal: null, alarm: null, normalItem: null, alarmItem: null },
  learnedSkills: [
    { skillId: 'bufu', kind: 'innate', order: 1 },
    { skillId: 'mabufu', kind: 'level', level: 14 },
  ],
};

function stubService() {
  return {
    ready: signal(true),
    loading: signal(false),
    error: signal<string | null>(null),
    data: signal({
      personas: [JACK],
      skills: [{ id: 'bufu', name: 'Bufu', element: 'ice', inheritElement: 'ice', unique: false }],
      traits: [{ id: 'cold-blooded', name: 'Cold Blooded', description: '', rank: 0 }],
      inheritMatrix: { ice: { ice: true } },
    }),
    retry: () => {},
  } as unknown as GameDataService;
}

function mount() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: STORAGE_BACKEND, useValue: new FakeBackend() },
      { provide: GameDataService, useValue: stubService() },
    ],
  });
  const fixture = TestBed.createComponent(CompendiumPage);
  fixture.detectChanges();
  return { fixture, store: TestBed.inject(CompendiumStore) };
}

describe('CompendiumPage (integration)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows the empty state with a link to the persona list (task 28)', () => {
    const { fixture } = mount();
    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent ?? '';
    expect(text).toContain('Your compendium is empty');
    // Links to the persona list via a routerLink (game-relative).
    const links = [...el.querySelectorAll('a[routerLink], a[href]')].map((a) => a.textContent?.trim());
    expect(links.some((t) => t?.includes('browse the persona list'))).toBe(true);
  });

  it('quick-add registers the picked persona with its native learn-set (task 26)', () => {
    const { fixture, store } = mount();
    const page = fixture.componentInstance as unknown as { quickAdd(o: PickerOption): void };

    page.quickAdd({ id: 'jack-frost', name: 'Jack Frost', arcana: 'Magician' });
    fixture.detectChanges();

    expect(store.count()).toBe(1);
    const entry = store.entryFor('jack-frost');
    expect(entry?.level).toBe(12); // base level
    expect(entry?.skillIds).toEqual(['bufu']); // native learn-set to base (mabufu is Lv 14)
    expect(entry?.traitId).toBe('cold-blooded'); // innate trait

    // The roster row now shows, and the empty state is gone.
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Your compendium is empty');
    expect(text).toContain('Jack Frost');
  });

  it('registering twice does not duplicate the entry', () => {
    const { fixture, store } = mount();
    const page = fixture.componentInstance as unknown as { quickAdd(o: PickerOption): void };
    page.quickAdd({ id: 'jack-frost', name: 'Jack Frost', arcana: 'Magician' });
    page.quickAdd({ id: 'jack-frost', name: 'Jack Frost', arcana: 'Magician' });
    expect(store.count()).toBe(1);
  });
});
