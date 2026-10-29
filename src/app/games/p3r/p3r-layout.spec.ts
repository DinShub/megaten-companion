import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { P3rDataService } from './data/p3r-data.service';
import { P3rLayout } from './p3r-layout';

/** The channel hotkeys: digits jump to the numbered nav entries. */
describe('P3rLayout section hotkeys', () => {
  let layout: P3rLayout;
  let visited: string[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: P3rDataService, useValue: { load: () => {} } }],
    });
    visited = [];
    const router = TestBed.inject(Router);
    router.navigate = ((commands: readonly unknown[]) => {
      visited.push(commands.join('/'));
      return Promise.resolve(true);
    }) as Router['navigate'];
    layout = TestBed.runInInjectionContext(() => new P3rLayout());
  });

  const press = (key: string, init: KeyboardEventInit = {}, target?: HTMLElement) => {
    const event = new KeyboardEvent('keydown', { key, ...init });
    if (target) Object.defineProperty(event, 'target', { value: target });
    (layout as unknown as { onKey(e: KeyboardEvent): void }).onKey(event);
  };

  it('maps 1–5 to the sections in nav order', () => {
    press('1');
    press('3');
    press('5');
    expect(visited).toEqual(['//p3r/fusion', '//p3r/personas', '//p3r/skills']);
  });

  it('ignores digits past the last section, modifiers, and typing in a field', () => {
    press('9');
    press('2', { ctrlKey: true });
    press('2', {}, document.createElement('input'));
    expect(visited).toEqual([]);
  });
});
