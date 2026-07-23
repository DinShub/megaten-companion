import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { VirtualList } from './virtual-list';

@Component({
  imports: [VirtualList],
  template: `
    <app-virtual-list class="vp" [items]="items" [itemSize]="20" [row]="tpl" [trackBy]="track" />
    <ng-template #tpl let-item let-i="index"><span class="r">{{ item }}#{{ i }}</span></ng-template>
  `,
  styles: `.vp { display: block; height: 100px; }`,
})
class Host {
  items = Array.from({ length: 500 }, (_, i) => i);
  track = (item: number): number => item;
}

describe('VirtualList', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders a windowed subset of the items, not all of them', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.r');
    // A window (plus overscan) — far fewer than the 500 items.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(200);
    // The window starts at the top and carries the absolute index.
    expect(rows[0].textContent).toContain('0#0');
  });

  it('sizes the scroll pad to the full item count', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const pad = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.vl__pad')!;
    // 500 items × 20px.
    expect(pad.style.height).toBe('10000px');
  });
});
