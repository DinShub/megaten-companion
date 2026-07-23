import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { LoadState } from '../../../../shared/load-state/load-state';
import { GameDataService } from '../../data/game-data.service';
import { ForwardCalculator } from './forward-calculator';
import { ReverseCalculator } from './reverse-calculator';

type Mode = 'forward' | 'reverse';

/**
 * The Fusion Calculator tab (§4.7): the forward (§4.7.1, task 41) and reverse
 * (§4.7.2, task 42) modes over one rules engine, switched by a segmented
 * control. The §10 nav gives Fusion three destinations — Calculator, Route
 * finder, Itemization — so both parents→result and target→recipes live here,
 * under "Calculator", with the route finder (§4.7.3, Phase 7) kept separate.
 *
 * Data-load chrome lives here so the two calculators mount only once the
 * datasets are ready and can assume {@link FusionStore.engine} is non-null.
 */
@Component({
  selector: 'app-fusion-calculator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadState, ForwardCalculator, ReverseCalculator],
  template: `
    @if (data.ready()) {
      <div class="calc">
        <div class="seg" role="tablist" aria-label="Calculator mode">
          <button
            type="button"
            role="tab"
            class="seg__btn"
            [class.is-on]="mode() === 'forward'"
            [attr.aria-selected]="mode() === 'forward'"
            (click)="mode.set('forward')"
          >
            <i class="pi pi-arrow-right" aria-hidden="true"></i> Forward<small>parents → result</small>
          </button>
          <button
            type="button"
            role="tab"
            class="seg__btn"
            [class.is-on]="mode() === 'reverse'"
            [attr.aria-selected]="mode() === 'reverse'"
            (click)="mode.set('reverse')"
          >
            <i class="pi pi-arrow-left" aria-hidden="true"></i> Reverse<small>target → recipes</small>
          </button>
        </div>

        @if (mode() === 'forward') {
          <app-forward-calculator />
        } @else {
          <app-reverse-calculator />
        }
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .calc { display: flex; flex-direction: column; gap: 1.25rem; }
    .seg { display: inline-flex; gap: 0.25rem; padding: 0.25rem; border: 1px solid var(--p-content-border-color, rgba(127, 127, 127, 0.25)); border-radius: 999px; align-self: flex-start; max-width: 100%; overflow-x: auto; }
    .seg__btn {
      display: inline-flex; align-items: baseline; gap: 0.4rem; white-space: nowrap;
      padding: 0.4rem 0.9rem; border: 0; border-radius: 999px; background: transparent;
      color: var(--p-text-muted-color); font: inherit; cursor: pointer;
      small { font-size: 0.72rem; opacity: 0.8; }
      &:hover { color: var(--p-text-color); }
      &.is-on { background: var(--p-primary-color); color: var(--p-primary-contrast-color, #fff); }
    }
  `,
})
export class FusionCalculator {
  protected readonly data = inject(GameDataService);
  protected readonly mode = signal<Mode>('forward');
}
