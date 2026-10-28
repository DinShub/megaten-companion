import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';

import { AffinityGrid } from '../../../../shared/affinity-grid/affinity-grid';
import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { Smt3DataService } from '../../data/smt3-data.service';
import type { Magatama } from '../../model';
import { SMT3_AFFINITY_ELEMENTS, STAT_COLUMNS } from '../../ui/smt3-format';

/** Magatama detail: where to get it, its stat bonuses and affinities, and its skills by level. */
@Component({
  selector: 'app-magatama-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AffinityGrid, LoadState],
  template: `
    @if (data.ready()) {
      @if (magatama(); as m) {
        <article class="s3-page">
          <a class="s3-back" [routerLink]="nav.link('magatama')"><i class="pi pi-arrow-left" aria-hidden="true"></i> All magatama</a>
          <header class="s3-detail-head">
            <div>
              <h1>{{ m.name }}</h1>
              <div class="s3-tags"><span class="s3-tag">Magatama</span><span class="s3-tag">Lv {{ m.level }}</span></div>
              <p class="s3-line"><i class="pi pi-map-marker" aria-hidden="true"></i> {{ m.obtain }}</p>
            </div>
          </header>

          <div class="s3-cols">
            <section class="s3-panel">
              <h2>Affinities while equipped</h2>
              <app-affinity-grid [affinities]="m.affinities" [elements]="affinityElements" />
            </section>
            <section class="s3-panel">
              <h2>Stat bonuses</h2>
              <div class="s3-statcells">
                @for (s of statCols; track s.key) {
                  <div><small>{{ s.abbrev }}</small><strong>{{ bonus(m, s.key) }}</strong></div>
                }
              </div>
            </section>
          </div>

          <section class="s3-panel">
            <h2>Skills</h2>
            <ul class="s3-list">
              @for (s of skills(); track s.id) {
                <li>
                  <a [routerLink]="nav.link('skills', s.id)"><span class="el-dot" [attr.data-el]="s.element" aria-hidden="true"></span>{{ s.name }}</a>
                  <span class="s3-side">{{ s.level === null ? 'Special unlock' : 'Demi-fiend Lv ' + s.level }}</span>
                </li>
              }
            </ul>
            <p class="s3-note">Learned on level-up while this magatama is equipped, once the Demi-fiend reaches the level shown. A “special unlock” is a condition upstream encodes without explaining, so none is guessed here.</p>
          </section>
        </article>
      } @else {
        <div class="s3-missing">
          <p>No magatama with id “{{ id() }}”.</p>
          <a class="s3-btn" [routerLink]="nav.link('magatama')">Back to magatama</a>
        </div>
      }
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
})
export class MagatamaDetail {
  protected readonly data = inject(Smt3DataService);
  protected readonly nav = inject(GameRouteContext);
  private readonly route = inject(ActivatedRoute);

  protected readonly statCols = STAT_COLUMNS;
  protected readonly affinityElements = SMT3_AFFINITY_ELEMENTS;

  protected readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('id') ?? '',
  });

  protected readonly magatama = computed<Magatama | undefined>(() => this.data.magatamaById().get(this.id()));

  protected readonly skills = computed(() =>
    (this.magatama()?.learnedSkills ?? []).map((ls) => {
      const s = this.data.skillsById().get(ls.skillId);
      return { id: ls.skillId, name: s?.name ?? ls.skillId, element: s?.element ?? 'passive', level: ls.level };
    }),
  );

  protected bonus(m: Magatama, key: (typeof STAT_COLUMNS)[number]['key']): string {
    const v = m.stats[key];
    return v ? `+${v}` : '0';
  }
}
