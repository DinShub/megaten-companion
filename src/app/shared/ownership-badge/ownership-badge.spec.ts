import { TestBed } from '@angular/core/testing';

import { OwnershipBadge } from './ownership-badge';

describe('OwnershipBadge', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('reads "Registered" with the level when owned', () => {
    const fixture = TestBed.createComponent(OwnershipBadge);
    fixture.componentRef.setInput('registered', true);
    fixture.componentRef.setInput('level', 62);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Registered');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('62');
  });

  it('reads "Not registered" when unowned', () => {
    const fixture = TestBed.createComponent(OwnershipBadge);
    fixture.componentRef.setInput('registered', false);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Not registered');
  });
});
