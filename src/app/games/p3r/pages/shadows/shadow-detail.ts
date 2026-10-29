import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';

import { AffinityGrid } from '../../../../shared/affinity-grid/affinity-grid';
import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { P3rDataService } from '../../data/p3r-data.service';
import type { Shadow } from '../../model';
import { arcanaLabel, formatNumber, P3R_SHADOW_AFFINITY_ELEMENTS, STAT_COLUMNS } from '../../ui/p3r-format';

/** Shadow detail: where it appears, its affinities, stats, skills and drops. */
@Component({
  selector: 'app-shadow-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AffinityGrid, LoadState],
  template: `
    @if (data.ready()) {
      @if (shadow(); as s) {
        <article class="p3-page">
          <a class="p3-back" [routerLink]="nav.link('shadows')"><i class="pi pi-arrow-left" aria-hidden="true"></i> All shadows</a>
          <header class="p3-detail-head">
            <div>
              <h1>{{ s.name }}</h1>
              <div class="p3-tags">
                <span class="p3-tag">{{ label(s.arcana) }}</span>
                <span class="p3-tag">Lv {{ s.level }}</span>
                @if (s.boss) { <span class="p3-tag">Boss</span> }
              </div>
              @if (s.area) { <p class="p3-line"><i class="pi pi-map-marker" aria-hidden="true"></i> {{ s.area }}</p> }
            </div>
          </header>

          <div class="p3-cols">
            <section class="p3-panel">
              <h2>Affinities</h2>
              <app-affinity-grid [affinities]="s.affinities" [elements]="affinityElements" />
            </section>
            <section class="p3-panel">
              <h2>Stats</h2>
              <div class="p3-statcells">
                <div><small>HP</small><strong>{{ num(s.hp) }}</strong></div>
                <div><small>SP</small><strong>{{ num(s.sp) }}</strong></div>
                @for (c of statCols; track c.key) {
                  <div><small>{{ c.abbrev }}</small><strong>{{ s.stats[c.key] }}</strong></div>
                }
              </div>
              <p class="p3-line">{{ num(s.exp) }} EXP</p>
            </section>
          </div>

          <div class="p3-cols">
            <section class="p3-panel">
              <h2>Skills</h2>
              @if (skills().length) {
                <ul class="p3-list">
                  @for (k of skills(); track k.id) {
                    <li><a [routerLink]="nav.link('skills', k.id)"><span class="el-dot" [attr.data-el]="k.element" aria-hidden="true"></span>{{ k.name }}</a></li>
                  }
                </ul>
              } @else {
                <p class="p3-empty">No skills on file.</p>
              }
            </section>
            <section class="p3-panel">
              <h2>Drops</h2>
              @if (s.drops.length) {
                <ul class="p3-list">
                  @for (d of s.drops; track d.item) {
                    <li><span>{{ d.item }}</span><span class="p3-side">{{ d.chance }}%</span></li>
                  }
                </ul>
              } @else {
                <p class="p3-empty">Drops nothing.</p>
              }
            </section>
          </div>
        </article>
      } @else {
        <div class="p3-missing">
          <p>Lookup failed: no shadow with id “{{ id() }}” on file.</p>
          <a class="p3-btn" [routerLink]="nav.link('shadows')">Back to shadows</a>
        </div>
      }
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
})
export class ShadowDetail {
  protected readonly data = inject(P3rDataService);
  protected readonly nav = inject(GameRouteContext);
  private readonly route = inject(ActivatedRoute);

  protected readonly statCols = STAT_COLUMNS;
  protected readonly affinityElements = P3R_SHADOW_AFFINITY_ELEMENTS;
  protected readonly label = arcanaLabel;
  protected readonly num = formatNumber;

  protected readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('id') ?? '',
  });

  protected readonly shadow = computed<Shadow | undefined>(() => this.data.shadowsById().get(this.id()));

  protected readonly skills = computed(() =>
    (this.shadow()?.skillIds ?? []).map((id) => {
      const s = this.data.skillsById().get(id);
      return { id, name: s?.name ?? id, element: s?.element ?? 'passive' };
    }),
  );
}
