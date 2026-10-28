import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { Smt3DataService } from './data/smt3-data.service';
import { Smt3Layout } from './smt3-layout';

/** The COMP section hotkeys: digits jump to the numbered nav entries. */
describe('Smt3Layout section hotkeys', () => {
  let layout: Smt3Layout;
  let visited: string[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Smt3DataService, useValue: { load: () => {} } }],
    });
    visited = [];
    const router = TestBed.inject(Router);
    router.navigate = ((commands: readonly unknown[]) => {
      visited.push(commands.join('/'));
      return Promise.resolve(true);
    }) as Router['navigate'];
    layout = TestBed.runInInjectionContext(() => new Smt3Layout());
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
    expect(visited).toEqual(['//smt3/fusion', '//smt3/demons', '//smt3/skills']);
  });

  it('ignores digits past the last section, modifiers, and typing in a field', () => {
    press('9');
    press('2', { ctrlKey: true });
    press('2', {}, document.createElement('input'));
    expect(visited).toEqual([]);
  });
});
