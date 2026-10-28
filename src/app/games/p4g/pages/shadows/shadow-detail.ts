import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';

import { AffinityGrid } from '../../../../shared/affinity-grid/affinity-grid';
import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { P4gDataService } from '../../data/p4g-data.service';
import type { Shadow } from '../../model';
import { arcanaLabel, formatNumber, P4G_SHADOW_AFFINITY_ELEMENTS, STAT_COLUMNS } from '../../ui/p4g-format';

/** Shadow detail: where it appears, its affinities, stats, skills and drops. */
@Component({
  selector: 'app-shadow-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AffinityGrid, LoadState],
  template: `
    @if (data.ready()) {
      @if (shadow(); as s) {
        <article class="p4-page">
          <a class="p4-back" [routerLink]="nav.link('shadows')"><i class="pi pi-arrow-left" aria-hidden="true"></i> All shadows</a>
          <header class="p4-detail-head">
            <div>
              <h1>{{ s.name }}</h1>
              <div class="p4-tags">
                <span class="p4-tag">{{ label(s.arcana) }}</span>
                <span class="p4-tag">Lv {{ s.level }}</span>
                @if (s.boss) { <span class="p4-tag">Boss</span> }
              </div>
              @if (s.area) { <p class="p4-line"><i class="pi pi-map-marker" aria-hidden="true"></i> {{ s.area }}</p> }
            </div>
          </header>

          <div class="p4-cols">
            <section class="p4-panel">
              <h2>Affinities</h2>
              <app-affinity-grid [affinities]="s.affinities" [elements]="affinityElements" />
            </section>
            <section class="p4-panel">
              <h2>Stats</h2>
              <div class="p4-statcells">
                <div><small>HP</small><strong>{{ num(s.hp) }}</strong></div>
                <div><small>SP</small><strong>{{ num(s.sp) }}</strong></div>
                @for (c of statCols; track c.key) {
                  <div><small>{{ c.abbrev }}</small><strong>{{ s.stats[c.key] }}</strong></div>
                }
              </div>
              <p class="p4-line">{{ num(s.exp) }} EXP · ¥{{ num(s.yen) }}</p>
            </section>
          </div>

          <div class="p4-cols">
            <section class="p4-panel">
              <h2>Skills</h2>
              @if (skills().length) {
                <ul class="p4-list">
                  @for (k of skills(); track k.id) {
                    <li><a [routerLink]="nav.link('skills', k.id)"><span class="el-dot" [attr.data-el]="k.element" aria-hidden="true"></span>{{ k.name }}</a></li>
                  }
                </ul>
              } @else {
                <p class="p4-empty">No skills on file.</p>
              }
            </section>
            <section class="p4-panel">
              <h2>Drops</h2>
              @if (s.drops.length) {
                <ul class="p4-list">
                  @for (d of s.drops; track d.item) {
                    <li><span>{{ d.item }}</span><span class="p4-side">{{ d.chance }}%</span></li>
                  }
                </ul>
              } @else {
                <p class="p4-empty">Drops nothing.</p>
              }
            </section>
          </div>
        </article>
      } @else {
        <div class="p4-missing">
          <p>No signal: there is no shadow with id “{{ id() }}” on file.</p>
          <a class="p4-btn" [routerLink]="nav.link('shadows')">Back to shadows</a>
        </div>
      }
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
})
export class ShadowDetail {
  protected readonly data = inject(P4gDataService);
  protected readonly nav = inject(GameRouteContext);
  private readonly route = inject(ActivatedRoute);

  protected readonly statCols = STAT_COLUMNS;
  protected readonly affinityElements = P4G_SHADOW_AFFINITY_ELEMENTS;
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
