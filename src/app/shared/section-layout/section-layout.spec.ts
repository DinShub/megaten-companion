import { ActivatedRoute, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { SectionLayout, type SectionTab } from './section-layout';

/** A minimal ActivatedRoute stub: the section's data plus its resolved URL. */
function fakeRoute(sections: readonly SectionTab[], baseSegments: readonly string[]) {
  const data = { sections };
  return {
    data: of(data),
    snapshot: {
      data,
      // pathFromRoot: [root(url:[]), ...one entry per base segment].
      pathFromRoot: [{ url: [] }, ...baseSegments.map((seg) => ({ url: [{ path: seg }] }))],
    },
  };
}

const SHADOWS: readonly SectionTab[] = [
  { label: 'Shadows', path: '' },
  { label: 'Sub-bosses', path: 'subbosses' },
  { label: 'Drops', path: 'drops' },
];

describe('SectionLayout', () => {
  afterEach(() => TestBed.resetTestingModule());

  function render(sections: readonly SectionTab[], base: readonly string[]) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: fakeRoute(sections, base) },
      ],
    });
    const fixture = TestBed.createComponent(SectionLayout);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders one on-page tab per section, from the route data', () => {
    const el = render(SHADOWS, ['p5r', 'shadows']);
    const tabs = Array.from(el.querySelectorAll('.section-tabs__tab'));
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Shadows', 'Sub-bosses', 'Drops']);
  });

  it('builds absolute links under the section, not a dropdown', () => {
    const el = render(SHADOWS, ['p5r', 'shadows']);
    const hrefs = Array.from(el.querySelectorAll<HTMLAnchorElement>('.section-tabs__tab')).map(
      (a) => a.getAttribute('href'),
    );
    expect(hrefs).toEqual(['/p5r/shadows', '/p5r/shadows/subbosses', '/p5r/shadows/drops']);
  });

  it('omits the tab strip when a section has only one page', () => {
    const el = render([{ label: 'Skills', path: '' }], ['p5r', 'skills']);
    expect(el.querySelector('.section-tabs')).toBeNull();
  });
});
