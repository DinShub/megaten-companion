import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AffinityGrid } from '../../../../shared/affinity-grid/affinity-grid';
import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { Smt3DataService } from '../../data/smt3-data.service';
import type { Magatama } from '../../model';
import { SMT3_AFFINITY_ELEMENTS, STAT_COLUMNS } from '../../ui/smt3-format';

type SortKey = 'level' | 'name';

/**
 * The 25 Magatama — the Demi-fiend's equippable parasites. Each grants stat
 * bonuses and affinities while worn, and teaches its skills as he levels.
 * Small enough to render without virtualisation.
 */
@Component({
  selector: 'app-magatama-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AffinityGrid, LoadState],
  template: `
    @if (data.ready()) {
      <div class="s3-page">
        <header class="s3-head">
          <h1>Magatama</h1>
          <span class="s3-count">{{ visible().length }} of {{ all().length }} on file</span>
        </header>
        <div class="s3-toolbar">
          <span class="s3-search">
            <i class="pi pi-search" aria-hidden="true"></i>
            <input type="text" placeholder="Search name or skill…" aria-label="Search magatama by name or skill" [value]="query()" (input)="query.set($any($event.target).value)" />
          </span>
          <div class="s3-seg" role="group" aria-label="Sort">
            <button type="button" [class.is-on]="sort() === 'level'" (click)="sort.set('level')">By level</button>
            <button type="button" [class.is-on]="sort() === 'name'" (click)="sort.set('name')">By name</button>
          </div>
        </div>

        <div class="s3-table">
          <div class="s3-row s3-row--head mag-grid" role="row">
            <span>Name</span><span class="s3-num">Lv</span>
            <span class="col-lg"><span class="s3-stats-inline">@for (s of statCols; track s.key) { <span [title]="s.label">{{ s.abbrev }}</span> }</span></span>
            <span>Affinities</span>
          </div>
          @for (m of visible(); track m.id) {
            <a class="s3-row s3-row--body mag-grid" [routerLink]="nav.link('magatama', m.id)">
              <span class="s3-strong">{{ m.name }}</span>
              <span class="s3-num">{{ m.level }}</span>
              <span class="col-lg"><span class="s3-stats-inline">@for (s of statCols; track s.key) { <span>{{ bonus(m, s.key) }}</span> }</span></span>
              <span><app-affinity-grid [affinities]="m.affinities" [elements]="affinityElements" /></span>
            </a>
          }
        </div>
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .mag-grid { grid-template-columns: minmax(8rem, 1fr) 2.5rem 10rem minmax(13rem, 15rem); min-width: 38rem; height: 44px; }
    @media (max-width: 767.98px) { .mag-grid { grid-template-columns: minmax(6rem, 1fr) 2.2rem minmax(11rem, 14rem); min-width: 0; } .col-lg { display: none; } }
  `,
})
export class MagatamaList {
  protected readonly data = inject(Smt3DataService);
  protected readonly nav = inject(GameRouteContext);

  protected readonly statCols = STAT_COLUMNS;
  protected readonly affinityElements = SMT3_AFFINITY_ELEMENTS;
  protected readonly query = signal('');
  protected readonly sort = signal<SortKey>('level');

  protected readonly all = computed<readonly Magatama[]>(() => this.data.data()?.magatama ?? []);

  protected readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    const skills = this.data.skillsById();
    const list = this.all().filter(
      (m) => !q || m.name.toLowerCase().includes(q) || m.learnedSkills.some((s) => skills.get(s.skillId)?.name.toLowerCase().includes(q)),
    );
    return [...list].sort((a, b) => (this.sort() === 'level' ? a.level - b.level : 0) || a.name.localeCompare(b.name));
  });

  protected bonus(m: Magatama, key: (typeof STAT_COLUMNS)[number]['key']): string {
    const v = m.stats[key];
    return v ? `+${v}` : '·';
  }
}
