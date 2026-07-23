import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AffinityGrid } from '../../../../shared/affinity-grid/affinity-grid';
import type { ChipOption } from '../../../../shared/filters/chip-multiselect';
import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { VirtualList } from '../../../../shared/virtual-list/virtual-list';
import { createUrlState } from '../../../../shared/url-query';
import { GameDataService } from '../../data/game-data.service';
import type { Shadow } from '../../model';
import { ARCANA_ORDER } from '../../model/ids';
import { titleCase } from '../../ui/format';
import { ShadowFilterBar } from './shadow-filter-bar';
import {
  defaultShadowFilter,
  filterShadows,
  parseShadowFilter,
  type ShadowFilter,
  type ShadowSortKey,
  serializeShadowFilter,
  sortShadows,
} from './shadow-filter';

/**
 * Mementos sub-boss list (§4.2, task 21). The 28 sub-bosses from upstream's
 * unused `subboss-data.json`, each carrying the Mementos request that spawns it —
 * request name, in-game date, and rank become filterable columns.
 */
@Component({
  selector: 'app-subboss-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AffinityGrid, LoadState, ShadowFilterBar, VirtualList],
  template: `
    @if (data.shadowsReady()) {
      <div class="page list-page list-page--tabbed">
        <header class="page__head">
          <h1 class="page__title">Sub-bosses</h1>
          <span class="page__count">{{ visible().length }} of {{ subbosses().length }}</span>
        </header>

        <app-shadow-filter-bar
          [filter]="filter()"
          [arcanaOptions]="arcanaOptions"
          [rankOptions]="rankOptions()"
          searchPlaceholder="Search sub-boss or arcana…"
          (change)="filter.set($event)"
          (clear)="clear()"
        />

        <div class="tablewrap list-page__body">
          <div class="list-page__table">
            <div class="grid grid--head" role="row">
              <button class="cell" [class.is-sort]="filter().sort === 'name'" (click)="setSort('name')">Name{{ caret('name') }}</button>
              <button class="cell col-md" [class.is-sort]="filter().sort === 'arcana'" (click)="setSort('arcana')">Arcana{{ caret('arcana') }}</button>
              <button class="cell cell--num" [class.is-sort]="filter().sort === 'level'" (click)="setSort('level')">Lv{{ caret('level') }}</button>
              <span class="cell col-lg">Request</span>
              <span class="cell col-md">Date</span>
              <button class="cell cell--rank" [class.is-sort]="filter().sort === 'rank'" (click)="setSort('rank')">Rank{{ caret('rank') }}</button>
              <span class="cell">Affinities</span>
            </div>

            <app-virtual-list class="list-page__scroll" [items]="visible()" [itemSize]="44" [row]="rowTpl" [trackBy]="trackId" />
          </div>
          <ng-template #rowTpl let-s>
            <a class="grid grid--row" [routerLink]="nav.link('shadow', s.id)">
              <span class="cell cell--name">{{ s.name }}</span>
              <span class="cell col-md cell--arcana">{{ titleCase(s.arcana) }}</span>
              <span class="cell cell--num">{{ s.level }}</span>
              <span class="cell col-lg cell--request">{{ s.request?.name ?? '—' }}</span>
              <span class="cell col-md cell--date">{{ s.request?.date ?? '—' }}</span>
              <span class="cell cell--rank"><span class="rankbadge">{{ s.request?.rank ?? '—' }}</span></span>
              <span class="cell"><app-affinity-grid [affinities]="s.affinities" /></span>
            </a>
          </ng-template>

          @if (visible().length === 0) {
            <p class="empty">No sub-bosses match these filters. <button type="button" class="linkbtn" (click)="clear()">Clear filters</button></p>
          }
        </div>
      </div>
    } @else {
      <app-load-state [loading]="data.shadowsLoading()" [error]="data.shadowsError()" (retry)="data.retryShadows()" />
    }
  `,
  styles: `
    .page { display: flex; flex-direction: column; }
    .page__head { display: flex; align-items: baseline; gap: 0.75rem; margin-bottom: 1rem; flex: 0 0 auto; }
    .page__title { margin: 0; font-size: 1.5rem; }
    .page__count { color: var(--p-text-muted-color); font-size: 0.9rem; }

    .tablewrap { display: flex; flex-direction: column; overflow-x: auto; }
    .grid { display: grid; align-items: center; grid-template-columns: minmax(8rem, 1fr) 5.5rem 3rem minmax(10rem, 1.5fr) 6.5rem 3.5rem minmax(13rem, 15rem); gap: 0.5rem; padding: 0 0.5rem; min-width: 58rem; }
    .grid--head { position: sticky; top: 0; z-index: 1; height: 2.4rem; border-bottom: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); background: var(--p-content-background); font-size: 0.76rem; color: var(--p-text-muted-color); text-transform: uppercase; letter-spacing: 0.03em; }
    .grid--head .cell { background: transparent; border: 0; color: inherit; font: inherit; text-transform: inherit; letter-spacing: inherit; text-align: left; padding: 0; }
    .grid--head .cell--num { text-align: right; }
    /* .grid--head-scoped: encapsulation inflates '.grid--head .cell' above a bare
       'button.cell', so the ancestor is needed for the sort/hover colours to win. */
    .grid--head button.cell { cursor: pointer; &:hover { color: var(--p-text-color); } &.is-sort { color: var(--p-primary-color); } }

    .grid--row { height: 100%; text-decoration: none; color: var(--p-text-color); border-bottom: 1px solid var(--p-content-border-color, rgba(127,127,127,0.12)); &:hover { background: var(--p-highlight-background, rgba(127,127,127,0.1)); } }
    .cell { overflow: hidden; }
    .cell--name { font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .cell--arcana { text-transform: capitalize; color: var(--p-text-muted-color); font-size: 0.9rem; }
    .cell--num { text-align: right; font-variant-numeric: tabular-nums; font-size: 0.88rem; }
    .cell--request { text-overflow: ellipsis; white-space: nowrap; font-size: 0.9rem; }
    .cell--date { color: var(--p-text-muted-color); font-size: 0.82rem; white-space: nowrap; }
    .rankbadge { display: inline-flex; align-items: center; justify-content: center; min-width: 1.5rem; padding: 0.1rem 0.4rem; border-radius: 4px; background: var(--app-panel-2); font-weight: 700; font-size: 0.82rem; }

    .empty { padding: 2rem 1rem; text-align: center; color: var(--p-text-muted-color); }
    .linkbtn { border: 0; background: transparent; color: var(--p-primary-color); cursor: pointer; font: inherit; text-decoration: underline; }

    @media (max-width: 767.98px) {
      .grid { grid-template-columns: minmax(7rem, 1.4fr) 3rem 3rem minmax(11rem, 14rem); min-width: 0; }
      .col-md, .col-lg { display: none; }
    }
  `,
})
export class SubbossList {
  protected readonly data = inject(GameDataService);

  constructor() {
    // Shadows live in the on-demand extras bundle (task 58) — request them.
    this.data.loadExtras();
  }
  protected readonly nav = inject(GameRouteContext);
  protected readonly titleCase = titleCase;

  protected readonly filter = createUrlState<ShadowFilter>({
    parse: (p) => parseShadowFilter(p, 'level'),
    serialize: (f) => serializeShadowFilter(f, 'level'),
  });

  protected readonly arcanaOptions: readonly ChipOption[] = ARCANA_ORDER.map((a) => ({ value: a, label: titleCase(a) }));

  protected readonly subbosses = computed<readonly Shadow[]>(() => (this.data.data()?.shadows ?? []).filter((s) => s.kind === 'subboss'));

  protected readonly rankOptions = computed<readonly ChipOption[]>(() => {
    const set = new Set<string>();
    for (const s of this.subbosses()) if (s.request) set.add(s.request.rank);
    return [...set].sort().map((r) => ({ value: r, label: r }));
  });

  protected readonly visible = computed(() => sortShadows(filterShadows(this.subbosses(), this.filter()), this.filter()));

  protected readonly trackId = (s: Shadow): string => s.id;

  protected caret(key: ShadowSortKey): string {
    if (this.filter().sort !== key) return '';
    return this.filter().dir === 'asc' ? ' ▲' : ' ▼';
  }

  protected setSort(key: ShadowSortKey): void {
    this.filter.update((f) => (f.sort === key ? { ...f, dir: f.dir === 'asc' ? 'desc' : 'asc' } : { ...f, sort: key, dir: 'asc' }));
  }

  protected clear(): void {
    this.filter.set(defaultShadowFilter('level'));
  }
}
