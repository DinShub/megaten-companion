import { Component } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { App } from './app';
import type { StorageBackend } from './core/storage/storage-envelope';
import { STORAGE_BACKEND } from './core/storage/storage.service';
import { DEFAULT_GAME_ID, GAMES, getGame } from './games/game.registry';

const DEFAULT_GAME = getGame(DEFAULT_GAME_ID)!;

@Component({ template: '' })
class Blank {}

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

describe('App shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        // A stub route per game, so a game switch can be navigated to.
        provideRouter(GAMES.map((g) => ({ path: g.id, component: Blank }))),
        { provide: STORAGE_BACKEND, useValue: new FakeBackend() },
      ],
    }).compileComponents();
  });

  it('creates the shell', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the active game in the brand, resolved from the registry', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    const brand = (fixture.nativeElement as HTMLElement).querySelector('.app-bar__brand');
    // With no game segment in the URL, the shell falls back to the default game
    // — resolved from the registry, not hardcoded here.
    expect(brand?.textContent).toContain('Companion');
    expect(brand?.textContent).toContain(DEFAULT_GAME.shortTitle);
  });

  it('marks the active game’s skin on <html>, and re-marks it on a game switch', async () => {
    const fixture = TestBed.createComponent(App);
    expect(document.documentElement.dataset['skin']).toBe(DEFAULT_GAME.theme.skin);

    const other = GAMES.find((g) => g.theme.skin !== DEFAULT_GAME.theme.skin)!;
    await TestBed.inject(Router).navigateByUrl(`/${other.id}`);
    fixture.detectChanges();
    expect(document.documentElement.dataset['skin']).toBe(other.theme.skin);
  });

  it('exposes the primary destinations for the mobile tab bar', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const tabbar = (fixture.nativeElement as HTMLElement).querySelector('.app-tabbar');
    expect(tabbar?.textContent).toContain('Personas');
    expect(tabbar?.textContent).toContain('Fusion');
  });
});
