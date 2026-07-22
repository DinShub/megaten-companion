import { TestBed } from '@angular/core/testing';

import { AffinityGrid } from './affinity-grid';

describe('AffinityGrid', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders all ten elements, defaulting missing ones to neutral', () => {
    const fixture = TestBed.createComponent(AffinityGrid);
    fixture.componentRef.setInput('affinities', { fire: 'weak', curse: 'drain' });
    fixture.detectChanges();

    const cells = (fixture.nativeElement as HTMLElement).querySelectorAll('.cell');
    expect(cells.length).toBe(10);

    const labels = [...cells].map((c) => c.getAttribute('aria-label'));
    expect(labels).toContain('Fire: Weak');
    expect(labels).toContain('Curse: Drain');
    // An unspecified element falls back to neutral.
    expect(labels).toContain('Gun: Neutral');
  });

  it('shows a text code, not colour alone', () => {
    const fixture = TestBed.createComponent(AffinityGrid);
    fixture.componentRef.setInput('affinities', { ice: 'resist' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Rs');
  });
});
