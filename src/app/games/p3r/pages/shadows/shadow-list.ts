import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AffinityGrid } from '../../../../shared/affinity-grid/affinity-grid';
import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { P3rDataService } from '../../data/p3r-data.service';
import { ARCANA_ORDER, type ArcanaId, type Shadow } from '../../model';
import { arcanaLabel, P3R_SHADOW_AFFINITY_ELEMENTS } from '../../ui/p3r-format';

type SortKey = 'level' | 'name';
type Kind = 'all' | 'shadow' | 'boss';

/**
 * The Shadows of the Dark Hour: every enemy in Tartarus and beyond, with the
 * bosses marked. ~370 rows — light enough to render without virtualisation.
 */
@Component({
  selector: 'app-shadow-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AffinityGrid, LoadState],
  template: `
    @if (data.ready()) {
      <div class="p3-page">
        <header class="p3-head">
          <h1>Shadows</h1>
          <span class="p3-count">{{ visible().length }} of {{ all().length }} on file</span>
        </header>
        <div class="p3-toolbar">
          <span class="p3-search">
            <i class="pi pi-search" aria-hidden="true"></i>
            <input type="text" placeholder="Search name or area…" aria-label="Search shadows by name or area" [value]="query()" (input)="query.set($any($event.target).value)" />
          </span>
          <select class="p3-select" aria-label="Filter by arcana" (change)="arcana.set($any($event.target).value)">
            <option value="" [selected]="arcana() === ''">All arcana</option>
            @for (a of arcanaOptions(); track a) {
              <option [value]="a" [selected]="arcana() === a">{{ label(a) }}</option>
            }
          </select>
          <div class="p3-seg" role="group" aria-label="Kind">
            <button type="button" [class.is-on]="kind() === 'all'" [attr.aria-pressed]="kind() === 'all'" (click)="kind.set('all')">All</button>
            <button type="button" [class.is-on]="kind() === 'shadow'" [attr.aria-pressed]="kind() === 'shadow'" (click)="kind.set('shadow')">Shadows</button>
            <button type="button" [class.is-on]="kind() === 'boss'" [attr.aria-pressed]="kind() === 'boss'" (click)="kind.set('boss')">Bosses</button>
          </div>
          <div class="p3-seg" role="group" aria-label="Sort">
            <button type="button" [class.is-on]="sort() === 'level'" [attr.aria-pressed]="sort() === 'level'" (click)="sort.set('level')">By level</button>
            <button type="button" [class.is-on]="sort() === 'name'" [attr.aria-pressed]="sort() === 'name'" (click)="sort.set('name')">By name</button>
          </div>
        </div>

        @if (visible().length) {
          <div class="p3-table">
            <div class="p3-row p3-row--head sh-grid" role="row">
              <span>Name</span><span class="p3-num">Lv</span><span class="col-lg">Arcana</span><span class="col-lg">Area</span><span>Affinities</span>
            </div>
            @for (s of visible(); track s.id) {
              <a class="p3-row p3-row--body sh-grid" [routerLink]="nav.link('shadows', s.id)">
                <span class="p3-strong">{{ s.name }}@if (s.boss) { <span class="p3-tag sh-boss">Boss</span> }</span>
                <span class="p3-num">{{ s.level }}</span>
                <span class="col-lg p3-muted">{{ label(s.arcana) }}</span>
                <span class="col-lg p3-muted sh-area">{{ s.area ?? '—' }}</span>
                <span><app-affinity-grid [affinities]="s.affinities" [elements]="affinityElements" /></span>
              </a>
            }
          </div>
        } @else {
          <p class="p3-empty">Nothing down here. Clear the search or pick another arcana.</p>
        }
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .sh-grid { grid-template-columns: minmax(9rem, 1fr) 2.5rem 7rem minmax(8rem, 1fr) minmax(14rem, 17rem); min-width: 46rem; min-height: 44px; }
    .sh-area { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sh-boss { margin-left: 0.4rem; font-size: 0.7rem; }
    @media (max-width: 767.98px) { .sh-grid { grid-template-columns: minmax(6rem, 1fr) 2.2rem minmax(12rem, 15rem); min-width: 0; } .col-lg { display: none; } }
  `,
})
export class ShadowList {
  protected readonly data = inject(P3rDataService);
  protected readonly nav = inject(GameRouteContext);

  protected readonly affinityElements = P3R_SHADOW_AFFINITY_ELEMENTS;
  protected readonly label = arcanaLabel;
  protected readonly query = signal('');
  protected readonly arcana = signal<ArcanaId | ''>('');
  protected readonly kind = signal<Kind>('all');
  protected readonly sort = signal<SortKey>('level');

  protected readonly all = computed<readonly Shadow[]>(() => this.data.data()?.shadows ?? []);

  protected readonly arcanaOptions = computed(() => {
    const present = new Set(this.all().map((s) => s.arcana));
    return ARCANA_ORDER.filter((a) => present.has(a));
  });

  protected readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    const arcana = this.arcana();
    const kind = this.kind();
    const list = this.all().filter(
      (s) =>
        (!q || s.name.toLowerCase().includes(q) || (s.area ?? '').toLowerCase().includes(q)) &&
        (!arcana || s.arcana === arcana) &&
        (kind === 'all' || (kind === 'boss') === s.boss),
    );
    return [...list].sort((a, b) => (this.sort() === 'level' ? a.level - b.level : 0) || a.name.localeCompare(b.name));
  });
}
