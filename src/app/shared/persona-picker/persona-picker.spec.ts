import { TestBed } from '@angular/core/testing';

import { PersonaPicker, type PickerOption } from './persona-picker';

const OPTIONS: PickerOption[] = [
  { id: 'jack-frost', name: 'Jack Frost', arcana: 'magician', owned: true, level: 12 },
  { id: 'jack-o-lantern', name: 'Jack-o-Lantern', arcana: 'magician', owned: false },
  { id: 'pixie', name: 'Pixie', arcana: 'lovers', owned: false },
  { id: 'arsene', name: 'Arsene', arcana: 'fool', owned: false },
];

function make(): { fixture: ReturnType<typeof TestBed.createComponent<PersonaPicker>>; cmp: PersonaPicker } {
  const fixture = TestBed.createComponent(PersonaPicker);
  fixture.componentRef.setInput('options', OPTIONS);
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance };
}

describe('PersonaPicker', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders the search field', () => {
    const { fixture } = make();
    expect((fixture.nativeElement as HTMLElement).querySelector('p-autocomplete')).toBeTruthy();
  });

  it('fuzzy-matches on name (subsequence) and on arcana', () => {
    const { cmp } = make();
    cmp.compendiumOnly.set(false); // search the full roster
    expect(cmp.filter('jkfr').map((o) => o.id)).toContain('jack-frost'); // subsequence
    expect(cmp.filter('magician').map((o) => o.id)).toEqual(
      expect.arrayContaining(['jack-frost', 'jack-o-lantern']),
    );
  });

  it('defaults to the compendium subset, and widens to all when toggled', () => {
    const { cmp } = make();
    // compendiumOnly defaults true → only owned personas are in the base list.
    expect(cmp.filter('').map((o) => o.id)).toEqual(['jack-frost']);
    cmp.compendiumOnly.set(false);
    expect(cmp.filter('').length).toBe(4);
  });

  it('emits the chosen option on select', () => {
    const { cmp } = make();
    let picked: PickerOption | undefined;
    cmp.picked.subscribe((o) => (picked = o));
    // Simulate PrimeNG's onSelect payload.
    (cmp as unknown as { choose(e: { value: PickerOption }): void }).choose({ value: OPTIONS[2] });
    expect(picked?.id).toBe('pixie');
  });
});
