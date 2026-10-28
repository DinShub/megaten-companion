import { TestBed } from '@angular/core/testing';

import { RansomTitle } from './ransom-title';

function render(text: string): HTMLElement {
  const fixture = TestBed.createComponent(RansomTitle);
  fixture.componentRef.setInput('text', text);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('RansomTitle', () => {
  it('names the heading with the plain text and hides the tiles', () => {
    const el = render('Sub-bosses');
    const h1 = el.querySelector('h1')!;
    expect(h1.getAttribute('aria-label')).toBe('Sub-bosses');
    const tiles = el.querySelectorAll('.ransom__t');
    expect(tiles.length).toBe('Sub-bosses'.length);
    tiles.forEach((t) => expect(t.getAttribute('aria-hidden')).toBe('true'));
  });

  it('keeps the text readable as text content, word breaks included', () => {
    expect(render('Classroom Answers').textContent).toBe('Classroom Answers');
  });

  it('cuts the same title the same way every time, never repeating a look on neighbours', () => {
    const classes = (el: HTMLElement) => [...el.querySelectorAll('.ransom__t')].map((t) => t.className);
    const first = classes(render('Personas'));
    expect(classes(render('Personas'))).toEqual(first);
    for (let i = 1; i < first.length; i++) expect(first[i]).not.toBe(first[i - 1]);
  });
});
