import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { INHERIT_ELEMENTS, type ElementVisual } from '../element-visuals';

interface MaskCell {
  readonly abbrev: string;
  readonly allowed: boolean;
  readonly aria: string;
}

/**
 * Compact 12-cell inherit-mask readout (§6.5, §10): which skill elements a
 * persona's inherit type can receive. The single most common reason a fusion
 * plan fails, so it deserves a first-class glyph — ✓ / · with colour, never
 * colour alone.
 *
 * Takes the resolved permission row (`elementId → boolean`), so it needs no
 * model or matrix import and stays in `shared/`.
 */
@Component({
  selector: 'app-inherit-mask',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mask" role="list" aria-label="Inheritable skill elements" [style.grid-template-columns]="columns()">
      @for (cell of cells(); track cell.abbrev) {
        <div
          class="mask__cell"
          [class.is-allowed]="cell.allowed"
          role="listitem"
          [attr.aria-label]="cell.aria"
          [title]="cell.aria"
        >
          <span class="mask__el">{{ cell.abbrev }}</span>
          <span class="mask__mark" aria-hidden="true">{{ cell.allowed ? '✓' : '·' }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    .mask {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 2px;
      min-width: 0;
    }
    .mask__cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1px;
      padding: 3px 1px;
      border-radius: 3px;
      background: var(--app-panel-2);
      opacity: 0.55;
      line-height: 1.1;
    }
    .mask__cell.is-allowed {
      opacity: 1;
      background: color-mix(in srgb, #22c55e 18%, transparent);
    }
    .mask__el {
      font-size: 0.55rem;
      color: var(--p-text-muted-color);
      text-transform: uppercase;
    }
    .mask__mark {
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--p-text-muted-color);
    }
    .is-allowed .mask__mark {
      color: var(--app-success);
    }
  `,
})
export class InheritMask {
  /** Resolved permission row: `elementId → can inherit`. */
  readonly allowed = input.required<Readonly<Record<string, boolean>>>();
  /** The axes to show, in order. Defaults to the twelve Persona inherit axes. */
  readonly elements = input<readonly ElementVisual[]>(INHERIT_ELEMENTS);

  protected readonly columns = computed(() => `repeat(${this.elements().length}, minmax(0, 1fr))`);

  protected readonly cells = computed<MaskCell[]>(() => {
    const row = this.allowed();
    return this.elements().map((el) => {
      const ok = row[el.id] === true;
      return { abbrev: el.abbrev, allowed: ok, aria: `${el.label}: ${ok ? 'yes' : 'no'}` };
    });
  });
}
