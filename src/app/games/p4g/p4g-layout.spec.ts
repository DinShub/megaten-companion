import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { P4gDataService } from './data/p4g-data.service';
import { P4gLayout } from './p4g-layout';

/** The channel hotkeys: digits jump to the numbered nav entries. */
describe('P4gLayout section hotkeys', () => {
  let layout: P4gLayout;
  let visited: string[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: P4gDataService, useValue: { load: () => {} } }],
    });
    visited = [];
    const router = TestBed.inject(Router);
    router.navigate = ((commands: readonly unknown[]) => {
      visited.push(commands.join('/'));
      return Promise.resolve(true);
    }) as Router['navigate'];
    layout = TestBed.runInInjectionContext(() => new P4gLayout());
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
    expect(visited).toEqual(['//p4g/fusion', '//p4g/personas', '//p4g/skills']);
  });

  it('ignores digits past the last section, modifiers, and typing in a field', () => {
    press('9');
    press('2', { ctrlKey: true });
    press('2', {}, document.createElement('input'));
    expect(visited).toEqual([]);
  });
});
