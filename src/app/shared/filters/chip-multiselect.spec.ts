import { TestBed } from '@angular/core/testing';

import { ChipMultiselect } from './chip-multiselect';

describe('ChipMultiselect', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders an option per chip and marks the selected ones', () => {
    const fixture = TestBed.createComponent(ChipMultiselect);
    fixture.componentRef.setInput('options', [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ]);
    fixture.componentRef.setInput('selected', ['b']);
    fixture.detectChanges();

    const chips = (fixture.nativeElement as HTMLElement).querySelectorAll('.chips__chip');
    expect(chips.length).toBe(2);
    expect(chips[0].getAttribute('aria-pressed')).toBe('false');
    expect(chips[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('emits the toggled value on click', () => {
    const fixture = TestBed.createComponent(ChipMultiselect);
    fixture.componentRef.setInput('options', [{ value: 'a', label: 'Alpha' }]);
    fixture.componentRef.setInput('selected', []);
    fixture.detectChanges();

    const emitted: string[] = [];
    fixture.componentInstance.toggle.subscribe((v) => emitted.push(v));
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.chips__chip')!.click();
    expect(emitted).toEqual(['a']);
  });
});
