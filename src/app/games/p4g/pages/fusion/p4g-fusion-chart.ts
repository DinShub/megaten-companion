import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { LoadState } from '../../../../shared/load-state/load-state';
import { P4gDataService } from '../../data/p4g-data.service';
import type { ArcanaId } from '../../model';
import { arcanaLabel } from '../../ui/p4g-format';

type Chart = 'normal' | 'triple';

/**
 * Golden's two arcana charts: an arcana-by-arcana lookup (works on any screen)
 * and the full 23 × 23 grid. The normal chart answers two-persona fusion; the
 * triangle chart crosses the leading persona's arcana with the arcana the other
 * two make. Same-arcana pairs have no chart cell — their rule is spelled out
 * instead.
 */
@Component({
  selector: 'app-p4g-fusion-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadState],
  template: `
    @if (data.ready()) {
      <div class="p4-page">
        <div class="p4-toolbar">
          <div class="p4-seg" role="group" aria-label="Chart">
            <button type="button" [class.is-on]="chart() === 'normal'" [attr.aria-pressed]="chart() === 'normal'" (click)="chart.set('normal')">Two personas</button>
            <button type="button" [class.is-on]="chart() === 'triple'" [attr.aria-pressed]="chart() === 'triple'" (click)="chart.set('triple')">Triangle</button>
          </div>
          <label class="p4-muted" for="arcana-a">{{ chart() === 'normal' ? 'Arcana' : 'Leading arcana' }}</label>
          <select id="arcana-a" class="p4-select" (change)="arcanaA.set($any($event.target).value)">
            @for (r of arcana(); track r) { <option [value]="r" [selected]="r === arcanaA()">{{ arcanaLabel(r) }}</option> }
          </select>
        </div>
        @if (chart() === 'normal') {
          <p class="p4-note">Two personas of the same arcana stay in it: you get the highest one at or below their average level + 1, never either ingredient.</p>
        } @else {
          <p class="p4-note">In a triangle the highest-level persona leads (a tie goes to the earlier arcana). The other two make an arcana on the two-persona chart — or share one — and this chart crosses it with the leader's. The result is the first persona of that arcana from the three's average level + 4.25.</p>
        }

        <section class="p4-panel">
          <h2>{{ arcanaLabel(arcanaA()) }} {{ chart() === 'normal' ? 'fused with…' : 'leading, with…' }}</h2>
          <div class="chart__pairs">
            @for (row of lookup(); track row.with) {
              <div class="chart__pair" [class.is-none]="!row.result">
                <span>{{ arcanaLabel(row.with) }}</span>
                <strong>{{ row.result ? arcanaLabel(row.result) : '—' }}</strong>
              </div>
            }
          </div>
        </section>

        <section class="p4-panel">
          <h2>Full chart</h2>
          <div class="chart__gridwrap">
            <table class="chart__grid">
              <thead>
                <tr><th></th>@for (b of arcana(); track b) { <th scope="col" [title]="arcanaLabel(b)"><span>{{ abbrev(b) }}</span></th> }</tr>
              </thead>
              <tbody>
                @for (a of arcana(); track a) {
                  <tr [class.is-sel]="a === arcanaA()">
                    <th scope="row" (click)="arcanaA.set(a)">{{ arcanaLabel(a) }}</th>
                    @for (b of arcana(); track b) {
                      <td [title]="arcanaLabel(a) + ' × ' + arcanaLabel(b) + ' = ' + (cell(a, b) ? arcanaLabel(cell(a, b)!) : 'nothing')">{{ cell(a, b) ? abbrev(cell(a, b)!) : '' }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .chart__pairs { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.35rem; }
    .chart__pair { display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.3rem 0.5rem; border-radius: 6px; background: var(--app-panel-2); font-size: 0.85rem;
      &.is-none { opacity: 0.45; } }
    .chart__gridwrap { overflow-x: auto; }
    .chart__grid { border-collapse: collapse; font-size: 0.68rem;
      th, td { padding: 0.15rem 0.2rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.15)); text-align: center; white-space: nowrap; }
      thead th { height: 4.2rem; vertical-align: bottom; span { display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg); } }
      tbody th { text-align: right; cursor: pointer; font-weight: 600; }
      tr.is-sel { background: color-mix(in srgb, var(--p-primary-color) 12%, transparent); } }
  `,
})
export class P4gFusionChart {
  protected readonly data = inject(P4gDataService);
  protected readonly arcanaLabel = arcanaLabel;

  protected readonly chart = signal<Chart>('normal');
  protected readonly arcanaA = signal<ArcanaId>('fool');

  protected readonly arcana = computed<readonly ArcanaId[]>(() => this.data.data()?.fusionChart.arcana ?? []);

  protected readonly lookup = computed(() => this.arcana().map((b) => ({ with: b, result: this.cell(this.arcanaA(), b) })));

  cell(a: ArcanaId, b: ArcanaId): ArcanaId | null {
    const chart = this.data.data()?.fusionChart;
    return chart?.[this.chart()][a]?.[b] ?? null;
  }

  protected abbrev(id: string): string {
    return arcanaLabel(id).slice(0, 4);
  }
}
