import { ActivatedRoute } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { PlaceholderPage } from './placeholder-page';

describe('PlaceholderPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders the title and blurb from the route data', () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { data: of({ title: 'Personas', blurb: 'Browse them.', phase: 'Phase 3' }) },
        },
      ],
    });
    const fixture = TestBed.createComponent(PlaceholderPage);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Personas');
    expect(text).toContain('Browse them.');
    expect(text).toContain('Phase 3');
  });
});
