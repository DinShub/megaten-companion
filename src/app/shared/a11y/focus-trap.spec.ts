import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { FocusTrap } from './focus-trap';

@Component({
  imports: [FocusTrap],
  template: `
    <button #trigger type="button">open</button>
    @if (open()) {
      <div class="overlay" appFocusTrap (escape)="escaped.set(true)">
        <button type="button">inside</button>
      </div>
    }
  `,
})
class Host {
  readonly open = signal(false);
  readonly escaped = signal(false);
}

const tick = () => new Promise<void>((r) => queueMicrotask(r));

describe('FocusTrap (task 57)', () => {
  afterEach(() => TestBed.resetTestingModule());

  function mount() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement); // real focus needs an attached DOM
    return fixture;
  }

  it('restores focus to the opener when the trap is destroyed', async () => {
    const fixture = mount();
    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector<HTMLButtonElement>('button')!;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await tick(); // arm() focuses into the overlay on a microtask

    fixture.componentInstance.open.set(false);
    fixture.detectChanges();
    await tick(); // disarm() restores focus on a microtask

    expect(document.activeElement).toBe(trigger);
    el.remove();
  });

  it('emits escape when Escape is pressed inside the trap', () => {
    const fixture = mount();
    const el = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    const overlay = el.querySelector<HTMLElement>('.overlay')!;

    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(fixture.componentInstance.escaped()).toBe(true);
    el.remove();
  });
});
