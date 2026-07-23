import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * A min–max numeric range as two bounded inputs. Controlled: the page owns the
 * bounds so they can live in the URL state. An empty input clears that side of
 * the range (emits `null`). Game-agnostic.
 */
@Component({
  selector: 'app-range-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="range" role="group" [attr.aria-label]="label()">
      <input
        class="range__input"
        type="number"
        inputmode="numeric"
        [min]="min()"
        [max]="max()"
        [attr.aria-label]="label() + ' minimum'"
        [placeholder]="min() + ''"
        [value]="lo() ?? ''"
        (change)="emit($event, loChange)"
      />
      <span class="range__sep" aria-hidden="true">–</span>
      <input
        class="range__input"
        type="number"
        inputmode="numeric"
        [min]="min()"
        [max]="max()"
        [attr.aria-label]="label() + ' maximum'"
        [placeholder]="max() + ''"
        [value]="hi() ?? ''"
        (change)="emit($event, hiChange)"
      />
    </div>
  `,
  styles: `
    .range {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }
    .range__input {
      width: 4rem;
      padding: 0.3rem 0.45rem;
      border: 1px solid var(--p-content-border-color, rgba(127, 127, 127, 0.3));
      border-radius: var(--p-border-radius, 6px);
      background: var(--p-content-background);
      color: var(--p-text-color);
      font: inherit;
      font-size: 0.85rem;

      &:focus-visible {
        outline: 2px solid var(--p-primary-color);
        outline-offset: 1px;
      }
    }
    .range__sep {
      color: var(--p-text-muted-color);
    }
  `,
})
export class RangeControl {
  readonly label = input<string>('Range');
  readonly min = input<number>(1);
  readonly max = input<number>(99);
  readonly lo = input<number | null>(null);
  readonly hi = input<number | null>(null);
  readonly loChange = output<number | null>();
  readonly hiChange = output<number | null>();

  protected emit(event: Event, out: { emit: (v: number | null) => void }): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    if (raw === '') {
      out.emit(null);
      return;
    }
    const n = Number.parseInt(raw, 10);
    out.emit(Number.isFinite(n) ? n : null);
  }
}
