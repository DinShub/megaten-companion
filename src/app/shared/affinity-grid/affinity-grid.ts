import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { AFFINITY_ELEMENTS, AFFINITY_META, type Affinity, type ElementVisual } from '../element-visuals';

interface Cell {
  readonly abbrev: string;
  readonly label: string;
  readonly code: string;
  readonly cls: string;
  readonly aria: string;
}

/**
 * The ten-element affinity grid (§10) — the densest recurring readout. Fixed
 * element order, and every cell carries a text code plus colour so weak/resist
 * reads at a glance and never depends on colour alone.
 *
 * Input is a plain `elementId → affinity` map; a missing element renders
 * neutral. Kept game-agnostic (no model import) so it stays in `shared/`.
 */
@Component({
  selector: 'app-affinity-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid" role="list" [attr.aria-label]="'Elemental affinities'" [style.grid-template-columns]="columns()">
      @for (cell of cells(); track cell.abbrev) {
        <div class="cell" [class]="cell.cls" role="listitem" [attr.aria-label]="cell.aria" [title]="cell.aria">
          <span class="cell__el">{{ cell.abbrev }}</span>
          <span class="cell__aff">{{ cell.code }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(10, minmax(0, 1fr));
      gap: 2px;
      min-width: 0;
    }
    .cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      padding: 3px 1px;
      border-radius: 3px;
      background: var(--app-panel-2);
      line-height: 1.1;
    }
    .cell__el {
      font-size: 0.6rem;
      color: var(--p-text-muted-color);
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .cell__aff {
      font-size: 0.78rem;
      font-weight: 700;
    }
    /* Colour reinforces the code; the code carries the meaning on its own. */
    .aff-weak {
      background: color-mix(in srgb, #ef4444 22%, transparent);
    }
    .aff-weak .cell__aff {
      color: var(--aff-weak);
    }
    .aff-resist {
      background: color-mix(in srgb, #22c55e 20%, transparent);
    }
    .aff-resist .cell__aff {
      color: var(--aff-resist);
    }
    .aff-null {
      background: color-mix(in srgb, #64748b 26%, transparent);
    }
    .aff-null .cell__aff {
      color: var(--aff-null);
    }
    .aff-repel {
      background: color-mix(in srgb, #a855f7 24%, transparent);
    }
    .aff-repel .cell__aff {
      color: var(--aff-repel);
    }
    .aff-drain {
      background: color-mix(in srgb, #14b8a6 24%, transparent);
    }
    .aff-drain .cell__aff {
      color: var(--aff-drain);
    }
    .aff-neutral .cell__aff {
      color: var(--p-text-muted-color);
    }
  `,
})
export class AffinityGrid {
  /** `elementId → affinity`; e.g. `{ fire: 'weak', ice: 'drain' }`. */
  readonly affinities = input.required<Readonly<Record<string, Affinity>>>();
  /** The axes to show, in order. Defaults to the ten-element Persona set; a game with other axes passes its own. */
  readonly elements = input<readonly ElementVisual[]>(AFFINITY_ELEMENTS);

  protected readonly columns = computed(() => `repeat(${this.elements().length}, minmax(0, 1fr))`);

  protected readonly cells = computed<Cell[]>(() => {
    const map = this.affinities();
    return this.elements().map((el) => {
      const affinity: Affinity = map[el.id] ?? 'neutral';
      const meta = AFFINITY_META[affinity];
      return {
        abbrev: el.abbrev,
        label: el.label,
        code: meta.code,
        cls: meta.cls,
        aria: `${el.label}: ${meta.label}`,
      };
    });
  });
}
