import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  TemplateRef,
} from '@angular/core';

/**
 * A minimal fixed-height virtual scroller (§4 "virtualised rendering", tasks 19,
 * 58). Renders only the rows in view plus a small overscan, so a 242- or
 * 449-row list stays smooth.
 *
 * Deliberately dependency-free: `@angular/cdk/scrolling` drags ~18 kB of extra
 * rxjs (schedulers, `shareReplay`, `auditTime`) into the eager `main` bundle,
 * which already owns rxjs — enough to blow the 500 kB budget the shell works to
 * stay under. This does the same job with a scroll listener and a `ResizeObserver`.
 *
 * The host element owns the scroll viewport; give it a height in the page's CSS
 * (`app-virtual-list { height: … }`). Rows must all be exactly `itemSize` px tall.
 * The row template receives the item as `$implicit` and its absolute index:
 * `<ng-template #row let-item let-i="index">`.
 */
@Component({
  selector: 'app-virtual-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  host: { '(scroll)': 'onScroll($event)' },
  template: `
    <div class="vl__pad" [style.height.px]="totalHeight()">
      <div class="vl__win" [style.transform]="'translateY(' + offsetPx() + 'px)'">
        @for (item of windowItems(); track keyOf(item, $index)) {
          <div class="vl__row" [style.height.px]="itemSize()">
            <ng-container [ngTemplateOutlet]="row()" [ngTemplateOutletContext]="{ $implicit: item, index: startIndex() + $index }" />
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      overflow-y: auto;
      overflow-x: hidden;
      position: relative;
      contain: strict;
    }
    .vl__pad { position: relative; width: 100%; }
    .vl__win { position: absolute; top: 0; left: 0; right: 0; will-change: transform; }
    .vl__row { box-sizing: border-box; }
  `,
})
export class VirtualList<T> {
  readonly items = input.required<readonly T[]>();
  readonly itemSize = input.required<number>();
  readonly row = input.required<TemplateRef<VirtualRowContext<T>>>();
  /** Stable key per item; defaults to the item itself (identity). */
  readonly trackBy = input<(item: T, index: number) => unknown>((item) => item);
  readonly overscan = input(4);

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly scrollTop = signal(0);
  private readonly viewportHeight = signal(0);

  constructor() {
    const el = this.host.nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.viewportHeight.set(el.clientHeight);
      const ro = new ResizeObserver(() => this.viewportHeight.set(el.clientHeight));
      ro.observe(el);
      destroyRef.onDestroy(() => ro.disconnect());
    });
  }

  protected onScroll(event: Event): void {
    this.scrollTop.set((event.target as HTMLElement).scrollTop);
  }

  protected readonly totalHeight = computed(() => this.items().length * this.itemSize());

  /** Clamp scroll so the window stays valid when the list shrinks under a filter. */
  private readonly clampedScroll = computed(() =>
    Math.max(0, Math.min(this.scrollTop(), this.totalHeight() - this.viewportHeight())),
  );

  protected readonly startIndex = computed(() =>
    Math.max(0, Math.floor(this.clampedScroll() / this.itemSize()) - this.overscan()),
  );

  private readonly endIndex = computed(() => {
    const visible = Math.ceil((this.viewportHeight() || this.itemSize() * 20) / this.itemSize());
    return Math.min(this.items().length, this.startIndex() + visible + this.overscan() * 2);
  });

  protected readonly windowItems = computed(() => this.items().slice(this.startIndex(), this.endIndex()));
  protected readonly offsetPx = computed(() => this.startIndex() * this.itemSize());

  protected keyOf(item: T, index: number): unknown {
    return this.trackBy()(item, this.startIndex() + index);
  }

  /** Lets consumers type the row template's `let-item` as `T`. */
  static ngTemplateContextGuard<T>(_dir: VirtualList<T>, ctx: unknown): ctx is VirtualRowContext<T> {
    return true;
  }
}

export interface VirtualRowContext<T> {
  readonly $implicit: T;
  readonly index: number;
}
