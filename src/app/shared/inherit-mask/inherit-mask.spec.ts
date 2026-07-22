import { TestBed } from '@angular/core/testing';

import { InheritMask } from './inherit-mask';

describe('InheritMask', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders twelve cells and marks the allowed ones', () => {
    const fixture = TestBed.createComponent(InheritMask);
    // A `phys` inherit type: phys/gun/ailment/healing only (§6.5).
    fixture.componentRef.setInput('allowed', {
      phys: true,
      gun: true,
      ailment: true,
      healing: true,
      fire: false,
      ice: false,
    });
    fixture.detectChanges();

    const cells = (fixture.nativeElement as HTMLElement).querySelectorAll('.mask__cell');
    expect(cells.length).toBe(12);

    const allowed = [...cells].filter((c) => c.classList.contains('is-allowed'));
    expect(allowed.length).toBe(4);

    const labels = [...cells].map((c) => c.getAttribute('aria-label'));
    expect(labels).toContain('Physical: yes');
    expect(labels).toContain('Fire: no');
  });
});
