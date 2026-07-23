import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { GameDataService } from '../../data/game-data.service';
import { AboutPage } from './about-page';

function mount(meta: unknown) {
  TestBed.configureTestingModule({
    providers: [{ provide: GameDataService, useValue: { data: signal(meta ? { meta } : null) } }],
  });
  const fixture = TestBed.createComponent(AboutPage);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const META = {
  upstream: {
    repo: 'aqiu384/megaten-fusion-tool',
    sha: 'f7d41c3f947a232d41bd8272de4221eb55f721c8',
    licence: 'The Unlicense (public domain)',
  },
  importedAt: '2026-07-23',
  datasets: {
    personas: { entries: 242 },
    skills: { entries: 541 },
  },
};

describe('AboutPage (task 59)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('credits the upstream source and the game rights holder even before data loads', () => {
    const el = mount(null);
    const text = el.textContent ?? '';
    expect(text).toContain('aqiu384/megaten-fusion-tool');
    expect(text).toContain('Atlus');
    expect(text).toContain('Sega');
    // Non-commercial fan-tool status is stated.
    expect(text.toLowerCase()).toContain('non-commercial');
    // Ships no game assets.
    expect(text.toLowerCase()).toContain('no game assets');
  });

  it('shows the pinned commit SHA linked to the upstream commit once meta loads', () => {
    const el = mount(META);
    const commitLink = [...el.querySelectorAll('a')].find((a) =>
      a.getAttribute('href')?.includes('/commit/'),
    );
    expect(commitLink).toBeTruthy();
    expect(commitLink!.getAttribute('href')).toBe(
      'https://github.com/aqiu384/megaten-fusion-tool/commit/f7d41c3f947a232d41bd8272de4221eb55f721c8',
    );
    // Displayed short SHA, not the whole 40 chars.
    expect(commitLink!.textContent).toContain('f7d41c3f94');
    // Import date surfaced.
    expect(el.textContent).toContain('2026-07-23');
  });

  it('external links are safe (noopener) and open in a new tab', () => {
    const el = mount(META);
    const external = [...el.querySelectorAll('a[target="_blank"]')];
    expect(external.length).toBeGreaterThan(0);
    for (const a of external) {
      expect(a.getAttribute('rel') ?? '').toContain('noopener');
    }
  });
});
