import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { Smt3DataService } from '../../data/smt3-data.service';
import type { RaceId } from '../../model';
import { raceLabel } from '../../ui/smt3-format';

type Chart = 'normal' | 'cursed';

/**
 * The race fusion chart: a race-by-race lookup (works on any screen), the full
 * 30 × 30 grid, the element rank-shift table and the Mitama pairs. The cursed
 * chart is upstream data its own calculator never wires up, so it is offered
 * as a reference view and labelled as such.
 */
@Component({
  selector: 'app-smt3-fusion-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState],
  template: `
    @if (data.ready()) {
      <div class="s3-page">
        <div class="s3-toolbar">
          <div class="s3-seg" role="group" aria-label="Chart">
            <button type="button" [class.is-on]="chart() === 'normal'" (click)="chart.set('normal')">Fusion chart</button>
            <button type="button" [class.is-on]="chart() === 'cursed'" (click)="chart.set('cursed')">Cursed chart</button>
          </div>
          <label class="s3-muted" for="race-a">Race</label>
          <select id="race-a" class="s3-select" [value]="raceA()" (change)="raceA.set($any($event.target).value)">
            @for (r of races(); track r) { <option [value]="r" [selected]="r === raceA()">{{ raceLabel(r) }}</option> }
          </select>
        </div>
        @if (chart() === 'cursed') {
          <p class="s3-warn"><i class="pi pi-info-circle" aria-hidden="true"></i> Reference only: upstream ships this Full-Kagutsuchi "cursed" table but its own Nocturne calculator doesn't use it, so this app doesn't either.</p>
        }

        <section class="s3-panel">
          <h2>{{ raceLabel(raceA()) }} fused with…</h2>
          <div class="chart__pairs">
            @for (row of lookup(); track row.with) {
              <div class="chart__pair" [class.is-none]="!row.result">
                <span>{{ raceLabel(row.with) }}</span>
                <strong>{{ row.result ? resultLabel(row.result) : '—' }}</strong>
              </div>
            }
          </div>
        </section>

        <section class="s3-panel chart__gridwrap">
          <h2>Full chart</h2>
          <table class="chart__grid">
            <thead>
              <tr><th></th>@for (b of races(); track b) { <th scope="col" [title]="raceLabel(b)"><span>{{ abbrev(b) }}</span></th> }</tr>
            </thead>
            <tbody>
              @for (a of races(); track a) {
                <tr [class.is-sel]="a === raceA()">
                  <th scope="row" (click)="raceA.set(a)">{{ raceLabel(a) }}</th>
                  @for (b of races(); track b) {
                    <td [title]="raceLabel(a) + ' × ' + raceLabel(b) + ' = ' + (cell(a, b) ? resultLabel(cell(a, b)!) : 'nothing')" [class.is-el]="isElement(cell(a, b))">{{ cell(a, b) ? abbrev(cell(a, b)!) : '' }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </section>

        <div class="s3-cols">
          <section class="s3-panel">
            <h2>Element fusion — rank shift</h2>
            <table class="chart__small">
              <thead><tr><th>Race</th>@for (e of elements(); track e) { <th><a [routerLink]="nav.link('demons', e)">{{ demonName(e) }}</a></th> }</tr></thead>
              <tbody>
                @for (r of shiftRaces(); track r) {
                  <tr><th>{{ raceLabel(r) }}</th>@for (e of elements(); track e) { <td>{{ shift(r, e) }}</td> }</tr>
                }
              </tbody>
            </table>
            <p class="s3-note">An Element plus a demon of that race moves it one rank up (▲) or down (▼) within the race.</p>
          </section>
          <section class="s3-panel">
            <h2>Element pairs → Mitama</h2>
            <ul class="s3-list">
              @for (m of mitama(); track m.resultId + m.ingredientIds.join()) {
                <li>
                  <span>{{ demonName(m.ingredientIds[0]) }} + {{ demonName(m.ingredientIds[1]) }}</span>
                  <a [routerLink]="nav.link('demons', m.resultId)">{{ demonName(m.resultId) }}</a>
                </li>
              }
            </ul>
            <h2>Same race → Element</h2>
            <div class="s3-pills">
              @for (s of sameRace(); track s.race) { <span class="s3-pill">{{ raceLabel(s.race) }} × 2 → {{ demonName(s.element) }}</span> }
            </div>
          </section>
        </div>
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
      tr.is-sel { background: color-mix(in srgb, var(--p-primary-color) 12%, transparent); }
      td.is-el { color: var(--p-primary-color); font-weight: 700; } }
    .chart__small { border-collapse: collapse; width: 100%; font-size: 0.8rem;
      th, td { padding: 0.2rem 0.3rem; text-align: center; } tbody th { text-align: left; font-weight: 500; } }
  `,
})
export class Smt3FusionChart {
  protected readonly data = inject(Smt3DataService);
  protected readonly nav = inject(GameRouteContext);
  protected readonly raceLabel = raceLabel;

  protected readonly chart = signal<Chart>('normal');
  protected readonly raceA = signal<RaceId>('deity');

  protected readonly races = computed<readonly RaceId[]>(() => this.data.data()?.fusionChart.races ?? []);
  private readonly elementIds = computed(() => new Set(this.data.data()?.elementChart.elementIds ?? []));
  protected readonly elements = computed(() => this.data.data()?.elementChart.elementIds ?? []);
  protected readonly shiftRaces = computed(() => this.data.data()?.elementChart.races ?? []);
  protected readonly mitama = computed(() => this.data.data()?.elementChart.mitama ?? []);
  protected readonly sameRace = computed(() =>
    Object.entries(this.data.data()?.fusionChart.sameRace ?? {}).map(([race, element]) => ({ race, element: element! })),
  );

  protected readonly lookup = computed(() => this.races().map((b) => ({ with: b, result: this.cell(this.raceA(), b) })));

  /** The chart cell for a race pair: a race id, or (normal chart diagonal) an Element demon id. */
  cell(a: RaceId, b: RaceId): string | null {
    const chart = this.data.data()?.fusionChart;
    if (!chart) return null;
    if (this.chart() === 'normal') {
      if (a === b) return chart.sameRace[a] ?? null;
      return chart.normal[a]?.[b] ?? null;
    }
    return chart.cursed[a]?.[b] ?? null;
  }

  protected isElement(id: string | null): boolean {
    return id !== null && this.elementIds().has(id);
  }

  protected resultLabel(id: string): string {
    return this.isElement(id) ? this.demonName(id) : raceLabel(id);
  }

  protected abbrev(id: string): string {
    return this.isElement(id) ? this.demonName(id).slice(0, 4) : raceLabel(id).slice(0, 4);
  }

  protected demonName(id: string): string {
    return this.data.demonsById().get(id)?.name ?? id;
  }

  protected shift(race: RaceId, element: string): string {
    const v = this.data.data()?.elementChart.shifts[race]?.[element];
    return v === 1 ? '▲' : v === -1 ? '▼' : '·';
  }
}
