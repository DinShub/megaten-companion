import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export interface ChipOption {
  readonly value: string;
  readonly label: string;
}

/**
 * A compact multi-select as a wrapped row of toggle chips. Controlled: the page
 * owns the selected list (so it can live in the URL state) and each click emits
 * the toggled value. Selection is shown by fill *and* a check glyph, never colour
 * alone (§10, a11y). Game-agnostic — plain `{value,label}` options.
 */
@Component({
  selector: 'app-chip-multiselect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chips" role="group" [attr.aria-label]="label()">
      @for (opt of decorated(); track opt.value) {
        <button
          type="button"
          class="chips__chip"
          [class.is-on]="opt.on"
          [attr.aria-pressed]="opt.on"
          (click)="toggle.emit(opt.value)"
        >
          @if (opt.on) {
            <i class="pi pi-check chips__tick" aria-hidden="true"></i>
          }
          <span>{{ opt.label }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .chips__chip {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.25rem 0.6rem;
      border: 1px solid var(--p-content-border-color, rgba(127, 127, 127, 0.3));
      border-radius: 999px;
      background: transparent;
      color: var(--p-text-color);
      font: inherit;
      font-size: 0.82rem;
      cursor: pointer;
      white-space: nowrap;

      &:hover {
        border-color: var(--p-primary-color);
      }
      &:focus-visible {
        outline: 2px solid var(--p-primary-color);
        outline-offset: 1px;
      }
    }
    .chips__chip.is-on {
      border-color: var(--p-primary-color);
      background: var(--p-highlight-background, color-mix(in srgb, var(--p-primary-color) 18%, transparent));
      color: var(--p-primary-color);
      font-weight: 600;
    }
    .chips__tick {
      font-size: 0.7rem;
    }
  `,
})
export class ChipMultiselect {
  readonly options = input.required<readonly ChipOption[]>();
  readonly selected = input.required<readonly string[]>();
  readonly label = input<string>('');
  readonly toggle = output<string>();

  protected readonly decorated = computed(() => {
    const on = new Set(this.selected());
    return this.options().map((o) => ({ ...o, on: on.has(o.value) }));
  });
}
