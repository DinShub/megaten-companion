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
 * Regular shadow list (§4.2, task 21). Sub-bosses have their own tab; this lists
 * the 129 non-boss shadows with stats, affinities and encounter areas, filtered
 * and sorted with the state kept in the URL. Rows link to the shadow detail.
 */
@Component({
  selector: 'app-shadow-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AffinityGrid, LoadState, ShadowFilterBar, VirtualList],
  template: `
    @if (data.shadowsReady()) {
      <div class="page list-page list-page--tabbed">
        <header class="page__head">
          <h1 class="page__title">Shadows</h1>
          <span class="page__count">{{ visible().length }} of {{ shadows().length }}</span>
        </header>

        <app-shadow-filter-bar
          [filter]="filter()"
          [arcanaOptions]="arcanaOptions"
          [areaOptions]="areaOptions()"
          (change)="filter.set($event)"
          (clear)="clear()"
        />

        <div class="tablewrap list-page__body">
          <div class="list-page__table">
            <div class="grid grid--head" role="row">
              <button class="cell" [class.is-sort]="filter().sort === 'name'" (click)="setSort('name')">Name{{ caret('name') }}</button>
              <button class="cell col-md" [class.is-sort]="filter().sort === 'arcana'" (click)="setSort('arcana')">Arcana{{ caret('arcana') }}</button>
              <button class="cell cell--num" [class.is-sort]="filter().sort === 'level'" (click)="setSort('level')">Lv{{ caret('level') }}</button>
              <button class="cell cell--num col-md" [class.is-sort]="filter().sort === 'hp'" (click)="setSort('hp')">HP{{ caret('hp') }}</button>
              <button class="cell cell--num col-md" [class.is-sort]="filter().sort === 'sp'" (click)="setSort('sp')">SP{{ caret('sp') }}</button>
              <button class="cell cell--num col-lg" [class.is-sort]="filter().sort === 'exp'" (click)="setSort('exp')">EXP{{ caret('exp') }}</button>
              <button class="cell cell--num col-lg" [class.is-sort]="filter().sort === 'yen'" (click)="setSort('yen')">Yen{{ caret('yen') }}</button>
              <span class="cell col-lg">Area</span>
              <span class="cell">Affinities</span>
            </div>

            <app-virtual-list class="list-page__scroll" [items]="visible()" [itemSize]="44" [row]="rowTpl" [trackBy]="trackId" />
          </div>
          <ng-template #rowTpl let-s>
            <a class="grid grid--row" [routerLink]="nav.link('shadow', s.id)">
              <span class="cell cell--name">{{ s.name }}</span>
              <span class="cell col-md cell--arcana">{{ titleCase(s.arcana) }}</span>
              <span class="cell cell--num">{{ s.level }}</span>
              <span class="cell cell--num col-md">{{ s.hp }}</span>
              <span class="cell cell--num col-md">{{ s.sp }}</span>
              <span class="cell cell--num col-lg">{{ s.exp }}</span>
              <span class="cell cell--num col-lg">{{ s.yen }}</span>
              <span class="cell col-lg cell--area">{{ s.areas.join(', ') || '—' }}</span>
              <span class="cell"><app-affinity-grid [affinities]="s.affinities" /></span>
            </a>
          </ng-template>

          @if (visible().length === 0) {
            <p class="empty">No shadows match these filters. <button type="button" class="linkbtn" (click)="clear()">Clear filters</button></p>
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
    .grid { display: grid; align-items: center; grid-template-columns: minmax(8rem, 1.4fr) 5.5rem 3rem 4rem 3.5rem 4.5rem 5rem minmax(8rem, 1fr) minmax(13rem, 15rem); gap: 0.5rem; padding: 0 0.5rem; min-width: 60rem; }
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
    .cell--area { color: var(--p-text-muted-color); font-size: 0.82rem; text-overflow: ellipsis; white-space: nowrap; }

    .empty { padding: 2rem 1rem; text-align: center; color: var(--p-text-muted-color); }
    .linkbtn { border: 0; background: transparent; color: var(--p-primary-color); cursor: pointer; font: inherit; text-decoration: underline; }

    @media (max-width: 767.98px) {
      .grid { grid-template-columns: minmax(7rem, 1.5fr) 3rem minmax(13rem, 15rem); min-width: 0; }
      .col-md, .col-lg { display: none; }
    }
  `,
})
export class ShadowList {
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

  protected readonly shadows = computed<readonly Shadow[]>(() => (this.data.data()?.shadows ?? []).filter((s) => s.kind === 'shadow'));

  protected readonly areaOptions = computed<readonly ChipOption[]>(() => {
    const set = new Set<string>();
    for (const s of this.shadows()) for (const a of s.areas) set.add(a);
    return [...set].sort().map((a) => ({ value: a, label: a }));
  });

  protected readonly visible = computed(() => sortShadows(filterShadows(this.shadows(), this.filter()), this.filter()));

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
