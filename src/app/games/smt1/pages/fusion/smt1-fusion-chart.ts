import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { Smt1DataService } from '../../data/smt1-data.service';
import type { ChartResult, Demon, RaceId } from '../../model';
import { displayLevel } from '../../model';
import { raceLabel, speciesLabel } from '../../ui/smt1-format';

interface Pick {
  readonly i: number;
  readonly j: number;
}

/**
 * The quick-reference chart (早見表): the pair chart as a staircase triangle,
 * one race down the side and one along the top. Hover lights the row and
 * column; picking a square lists what it can make. Below it, the element
 * chart's rank shifts.
 */
@Component({
  selector: 'app-smt1-fusion-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState],
  template: `
    @if (data.data(); as d) {
      <div class="g1-page">
        <div class="g1-runhead">
          <div>
            <h1><span class="g1-runhead__jp g1-plate" lang="ja">合体早見表</span>Fusion chart</h1>
            <p>Find one race down the side and the other along the top. Pick a square to see what it makes.</p>
          </div>
        </div>

        <div class="g1-chart-layout">
          <div class="g1-tbl-scroll">
            <table class="g1-tri" aria-label="Race fusion chart" (pointerleave)="hover.set(null)">
              <thead>
                <tr><td></td>@for (r of races(); track r; let j = $index) { <th scope="col" [class.on]="hover()?.j === j">{{ race(r) }}</th> }</tr>
              </thead>
              <tbody>
                @for (row of races(); track row; let i = $index) {
                  <tr>
                    <th scope="row" [class.on]="hover()?.i === i">{{ race(row) }}</th>
                    @for (col of races(); track col; let j = $index) {
                      @if (j <= i) {
                        @let cell = d.fusionChart.normal[row]?.[col] ?? null;
                        <td [class.diag]="i === j">
                          <button type="button" [class]="kind(cell)" [attr.aria-pressed]="picked().i === i && picked().j === j"
                            [attr.aria-label]="race(row) + ' with ' + race(col) + ': ' + label(cell)"
                            (pointerenter)="hover.set({ i, j })" (click)="chosen.set({ i, j })">{{ label(cell) }}</button>
                        </td>
                      } @else {
                        <td></td>
                      }
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <aside class="g1-chart-pick" aria-live="polite">
            <section class="g1-box">
              <div class="g1-box__bar g1-plate"><h2>This square</h2><span>{{ pickKind() }}</span></div>
              <div class="g1-box__data">
                <p class="g1-chart-pick__formula">{{ race(races()[picked().i]) }}<span class="g1-op"> × </span>{{ race(races()[picked().j]) }}<br /><span class="g1-op">＝ </span><span class="g1-spot">{{ label(pickedCell()) }}</span></p>
                <p class="g1-meta">{{ pickNote() }}</p>
                <ul class="g1-list">
                  @for (m of pool(); track m.id) {
                    <li><a [routerLink]="nav.link('demons', m.id)">{{ m.name }}</a><span class="g1-dim">{{ race(m.race) }}, Lv {{ level(m) }}</span></li>
                  }
                </ul>
              </div>
            </section>
            <ul class="g1-key" aria-label="Key">
              <li><b>Race name</b>: a demon of that race.</li>
              <li><span class="sp">Species</span> (blue): any race of that species.</li>
              <li><span class="el">Element</span> (on the diagonal): two of the same race make it.</li>
              <li>–: these two races don't fuse.</li>
              <li>Dark races (Drake, Foul, Haunt and others) aren't on the chart; they fuse by the dark rule.</li>
            </ul>
          </aside>
        </div>

        <section aria-labelledby="shift-t">
          <h2 class="g1-section-title" id="shift-t">Element fusion<small>a demon fused with an element moves up or down within its race</small></h2>
          <div class="g1-tbl-scroll">
            <table class="g1-tbl g1-shift">
              <thead><tr><th scope="col">Race</th>@for (e of d.elementChart.elementIds; track e) { <th scope="col">{{ demonName(e) }}</th> }</tr></thead>
              <tbody>
                @for (r of d.elementChart.races; track r) {
                  <tr>
                    <td class="g1-strong">{{ race(r) }}</td>
                    @for (e of d.elementChart.elementIds; track e) {
                      @let n = d.elementChart.shifts[r]?.[e] ?? 0;
                      <td [class.up]="n === 1" [class.up2]="n > 1" [class.down]="n < 0">{{ sign(n) }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
        <p class="g1-foot">From upstream's SMT1 fusion-chart.json and element-chart.json (SNES-era, believed unchanged on PS1).</p>
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
})
export class Smt1FusionChart {
  protected readonly data = inject(Smt1DataService);
  protected readonly nav = inject(GameRouteContext);
  protected readonly race = raceLabel;
  protected readonly level = displayLevel;

  protected readonly hover = signal<Pick | null>(null);
  protected readonly chosen = signal<Pick | null>(null);

  protected readonly races = computed<readonly RaceId[]>(() => this.data.data()?.fusionChart.races ?? []);

  /** The chosen square; until one is picked, the calculator's example parents, Avatar × Femme. */
  protected readonly picked = computed<Pick>(() => {
    const chosen = this.chosen();
    if (chosen) return chosen;
    const races = this.races();
    const a = races.indexOf('avatar');
    const b = races.indexOf('femme');
    return a >= 0 && b >= 0 ? { i: Math.max(a, b), j: Math.min(a, b) } : { i: 0, j: 0 };
  });

  protected readonly pickedCell = computed<ChartResult | null>(() => {
    const d = this.data.data();
    const races = this.races();
    const { i, j } = this.picked();
    return d?.fusionChart.normal[races[i]]?.[races[j]] ?? null;
  });

  protected readonly pool = computed<Demon[]>(() => {
    const d = this.data.data();
    const cell = this.pickedCell();
    if (!d || !cell) return [];
    if (cell.kind === 'element') return d.demons.filter((x) => x.id === cell.id);
    const races = cell.kind === 'race' ? [cell.id] : (d.races.species.find((s) => s.id === cell.id)?.raceIds ?? []);
    return d.demons.filter((x) => races.includes(x.race) && x.kind === 'normal').sort((a, b) => a.level - b.level);
  });

  protected readonly pickKind = computed(() => {
    const cell = this.pickedCell();
    return !cell ? 'No fusion' : cell.kind === 'race' ? 'A race' : cell.kind === 'species' ? 'A species' : 'An element';
  });

  protected readonly pickNote = computed(() => {
    const cell = this.pickedCell();
    const races = this.races();
    if (!cell) return 'These two races refuse to fuse.';
    if (cell.kind === 'element') return `Two ${raceLabel(races[this.picked().i])} demons make this element.`;
    if (cell.kind === 'species') return `Makes a demon from any race of the ${speciesLabel(cell.id)}. Which one depends on the parents' levels.`;
    return `Makes a ${raceLabel(cell.id)}. Which one depends on the parents' levels.`;
  });

  protected kind(cell: ChartResult | null): string {
    return !cell ? 'none' : cell.kind === 'species' ? 'sp' : cell.kind === 'element' ? 'el' : 'race';
  }

  protected label(cell: ChartResult | null): string {
    if (!cell) return '–';
    if (cell.kind === 'race') return raceLabel(cell.id);
    if (cell.kind === 'species') return speciesLabel(cell.id);
    return this.demonName(cell.id);
  }

  protected demonName(id: string): string {
    return this.data.demonsById().get(id)?.name ?? id;
  }

  protected sign(n: number): string {
    return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';
  }
}
