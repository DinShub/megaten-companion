import { NavigationCancel, NavigationEnd, NavigationStart } from '@angular/router';

import { createPageTurn } from './smt1-page-turn';
import { playPressRun } from './smt1-press-run';

/**
 * The Guidebook's two motions, against jsdom: what they add to the page and,
 * above all, that they always clean up and never get in a navigation's way.
 * (jsdom runs no real animation; `Element.animate` is stubbed.)
 */
function setUp(path: string, reduced = false) {
  document.body.innerHTML = '<nav><a class="app-nav__link is-active" href="/smt1/fusion">Fusion</a></nav><main class="app-main"><p>Old page</p></main>';
  window.history.replaceState({}, '', path);
  vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ matches: reduced && q.includes('reduce'), media: q }) as MediaQueryList);
  Element.prototype.animate = vi.fn(() => ({ finished: Promise.resolve() }) as unknown as Animation);
}

describe('SMT1 page turn', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lays a copy of the old sheet over a navigation inside the game, then removes it', () => {
    setUp('/smt1/fusion/calculator');
    const turn = createPageTurn(document, 'smt1');
    turn(new NavigationStart(1, '/smt1/demons'));
    expect(document.querySelectorAll('.g1-turning').length).toBe(0); // nothing until the new page has rendered
    turn(new NavigationEnd(1, '/smt1/demons', '/smt1/demons'));
    const copy = document.querySelector<HTMLElement>('.g1-turning')!;
    expect(copy.getAttribute('aria-hidden')).toBe('true');
    expect(copy.textContent).toContain('Old page');
    vi.runAllTimers();
    expect(document.querySelectorAll('.g1-turning').length).toBe(0);
  });

  it('does nothing for a navigation that leaves the game', () => {
    setUp('/smt1/fusion/calculator');
    const turn = createPageTurn(document, 'smt1');
    turn(new NavigationStart(1, '/smt3/demons'));
    turn(new NavigationEnd(1, '/smt3/demons', '/smt3/demons'));
    expect(document.querySelectorAll('.g1-turning').length).toBe(0);
  });

  it('does nothing under reduced motion', () => {
    setUp('/smt1/fusion/calculator', true);
    const turn = createPageTurn(document, 'smt1');
    turn(new NavigationStart(1, '/smt1/demons'));
    turn(new NavigationEnd(1, '/smt1/demons', '/smt1/demons'));
    expect(document.querySelectorAll('.g1-turning').length).toBe(0);
  });

  it('drops the copy when a navigation is cancelled', () => {
    setUp('/smt1/fusion/calculator');
    const turn = createPageTurn(document, 'smt1');
    turn(new NavigationStart(1, '/smt1/demons'));
    turn(new NavigationCancel(1, '/smt1/demons', 'guard'));
    turn(new NavigationEnd(2, '/smt1/skills', '/smt1/skills'));
    expect(document.querySelectorAll('.g1-turning').length).toBe(0);
  });
});

describe('SMT1 press run', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts out of register on the first page of a visit and ends in register', () => {
    setUp('/smt1/fusion');
    playPressRun(document);
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--g1-mx')).toBe('8px');
    expect(root.getPropertyValue('--g1-ink-in')).toBe('0');
    vi.runAllTimers();
    expect(root.getPropertyValue('--g1-mx')).toBe('0px');
    expect(root.getPropertyValue('--g1-ink-in')).toBe('1');
  });

  it('shows only the end state on later pages and under reduced motion', () => {
    setUp('/smt1/fusion');
    sessionStorage.setItem('g1-pressed', '1');
    playPressRun(document);
    expect(document.documentElement.style.getPropertyValue('--g1-mx')).toBe('0px');

    sessionStorage.clear();
    setUp('/smt1/fusion', true);
    playPressRun(document);
    expect(document.documentElement.style.getPropertyValue('--g1-mx')).toBe('0px');
  });

  it('skips to the end on a key press', () => {
    setUp('/smt1/fusion');
    playPressRun(document);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.documentElement.style.getPropertyValue('--g1-mx')).toBe('0px');
  });
});
