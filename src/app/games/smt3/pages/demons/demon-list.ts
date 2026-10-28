import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AffinityGrid } from '../../../../shared/affinity-grid/affinity-grid';
import { ChipMultiselect, type ChipOption } from '../../../../shared/filters/chip-multiselect';
import { RangeControl } from '../../../../shared/filters/range-control';
import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { createUrlState } from '../../../../shared/url-query';
import { VirtualList } from '../../../../shared/virtual-list/virtual-list';
import { Smt3CompendiumStore } from '../../compendium/smt3-compendium.store';
import { Smt3DataService } from '../../data/smt3-data.service';
import type { Affinity, Demon } from '../../model';
import { ELEMENT_ORDER, INHERIT_ORDER, RACE_ORDER, UNLOCK_GROUPS } from '../../model/ids';
import {
  INHERIT_LABEL,
  KIND_LABEL,
  raceLabel,
  SMT3_AFFINITY_ELEMENTS,
  STAT_COLUMNS,
  UNLOCK_LABEL,
} from '../../ui/smt3-format';
import {
  DEFAULT_DEMON_FILTER,
  type DemonFilter,
  type DemonSortKey,
  filterDemons,
  isDemonFilterActive,
  parseDemonFilter,
  serializeDemonFilter,
  sortDemons,
} from './demon-filter';

const RELATIONS: readonly Affinity[] = ['weak', 'resist', 'null', 'repel', 'drain'];

/**
 * Demon list — all 195 Nocturne demons, virtual-scrolled, with filters (race,
 * how it's obtained, inheritance, level, affinity, owned) and sort mirrored in
 * the URL so a filtered view restores on reload.
 */
@Component({
  selector: 'app-demon-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AffinityGrid, ChipMultiselect, RangeControl, LoadState, VirtualList],
  template: `
    @if (data.ready()) {
      <div class="s3-page list-page">
        <header class="s3-head">
          <h1>Demons</h1>
          <span class="s3-count">{{ visible().length }} of {{ demons().length }} on file</span>
        </header>

        <div class="s3-toolbar">
          <span class="s3-search">
            <i class="pi pi-search" aria-hidden="true"></i>
            <input type="text" placeholder="Search name or race…" aria-label="Search demons by name or race" [value]="filter().search" (input)="patch({ search: $any($event.target).value })" />
          </span>
          <button class="s3-btn" type="button" [class.is-on]="showFilters()" (click)="showFilters.set(!showFilters())">
            <i class="pi pi-filter" aria-hidden="true"></i><span>Filters</span>
          </button>
          <button class="s3-btn" type="button" [class.is-on]="filter().owned" [attr.aria-pressed]="filter().owned" (click)="patch({ owned: !filter().owned })">
            <i class="pi" [class.pi-check-circle]="filter().owned" [class.pi-book]="!filter().owned" aria-hidden="true"></i><span>In compendium</span>
          </button>
          @if (active()) {
            <button class="s3-btn" type="button" (click)="clear()"><i class="pi pi-times" aria-hidden="true"></i><span>Clear</span></button>
          }
        </div>

        @if (showFilters()) {
          <div class="s3-filters">
            <div><span class="s3-filters__label">Race</span>
              <app-chip-multiselect label="Race" [options]="raceOptions" [selected]="filter().races" (toggle)="toggle('races', $event)" /></div>
            <div><span class="s3-filters__label">Obtained by</span>
              <app-chip-multiselect label="Obtained by" [options]="availabilityOptions" [selected]="filter().availability" (toggle)="toggle('availability', $event)" /></div>
            <div><span class="s3-filters__label">Can inherit</span>
              <app-chip-multiselect label="Can inherit" [options]="inheritOptions" [selected]="filter().inherits" (toggle)="toggle('inherits', $event)" /></div>
            <div><span class="s3-filters__label">Level</span>
              <app-range-control label="Level" [min]="1" [max]="99" [lo]="filter().levelMin" [hi]="filter().levelMax" (loChange)="patch({ levelMin: $event })" (hiChange)="patch({ levelMax: $event })" /></div>
            <div><span class="s3-filters__label">Affinity</span>
              <select class="s3-select" aria-label="Affinity relation" [value]="filter().affinityRelation ?? ''" (change)="setRelation($any($event.target).value)">
                <option value="">any relation</option>
                @for (r of relations; track r) { <option [value]="r" [selected]="r === filter().affinityRelation">{{ cap(r) }}</option> }
              </select>
              <span class="s3-muted">to</span>
              <select class="s3-select" aria-label="Affinity element" [value]="filter().affinityElement ?? ''" [disabled]="!filter().affinityRelation" (change)="patch({ affinityElement: $any($event.target).value || null })">
                <option value="">any element</option>
                @for (e of elements; track e.id) { <option [value]="e.id" [selected]="e.id === filter().affinityElement">{{ e.label }}</option> }
              </select>
            </div>
          </div>
        }

        <div class="s3-table list-page__body">
          <div class="list-page__table">
            <div class="s3-row s3-row--head demons-grid" role="row">
              <button [class.is-sort]="filter().sort === 'name'" (click)="setSort('name')">Name{{ caret('name') }}</button>
              <button class="col-race" [class.is-sort]="filter().sort === 'race'" (click)="setSort('race')">Race{{ caret('race') }}</button>
              <button class="s3-num" [class.is-sort]="filter().sort === 'level'" (click)="setSort('level')">Lv{{ caret('level') }}</button>
              <span class="col-md">Obtained</span>
              <span class="col-lg">
                <span class="s3-stats-inline">
                  @for (s of statCols; track s.key) { <button [title]="'Sort by ' + s.label" [class.is-sort]="filter().sort === s.key" (click)="setSort(s.key)">{{ s.abbrev }}</button> }
                </span>
              </span>
              <span>Affinities</span>
            </div>
            <app-virtual-list class="list-page__scroll" [items]="visible()" [itemSize]="44" [row]="rowTpl" [trackBy]="trackId" />
          </div>
          <ng-template #rowTpl let-d>
            <a class="s3-row s3-row--body demons-grid" [routerLink]="nav.link('demons', d.id)">
              <span class="s3-strong">
                @if (owned().has(d.id)) { <i class="pi pi-check-circle s3-owned" aria-label="In your compendium"></i> }
                {{ d.name }}
                <small class="s3-muted m-race">{{ raceLabel(d.race) }}</small>
              </span>
              <span class="s3-muted col-race">{{ raceLabel(d.race) }}</span>
              <span class="s3-num">{{ d.level }}</span>
              <span class="col-md s3-muted">{{ kindLabel(d) }}</span>
              <span class="col-lg"><span class="s3-stats-inline">
                @for (s of statCols; track s.key) { <span>{{ d.stats[s.key] }}</span> }
              </span></span>
              <span><app-affinity-grid [affinities]="d.affinities" [elements]="affinityElements" /></span>
            </a>
          </ng-template>
          @if (visible().length === 0) {
            <p class="s3-empty">No demons match these filters. <button type="button" class="s3-linkbtn" (click)="clear()">Clear filters</button></p>
          }
        </div>
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .demons-grid { grid-template-columns: minmax(8rem, 1.6fr) 5.5rem 2.5rem 8rem 9rem minmax(13rem, 15rem); min-width: 50rem; }
    .m-race { display: none; }
    @media (max-width: 767.98px) {
      // Race folds under the name so the affinity grid fits a phone without sideways scrolling.
      .demons-grid { grid-template-columns: minmax(4.5rem, 1fr) 1.6rem minmax(12.5rem, 13rem); gap: 0.35rem; min-width: 0; }
      .col-md, .col-lg, .col-race { display: none; }
      .m-race { display: block; font-size: 0.72rem; font-weight: 400; line-height: 1.1; }
    }
  `,
})
export class DemonList {
  protected readonly data = inject(Smt3DataService);
  protected readonly nav = inject(GameRouteContext);
  private readonly compendium = inject(Smt3CompendiumStore);

  protected readonly filter = createUrlState<DemonFilter>({ parse: parseDemonFilter, serialize: serializeDemonFilter });
  protected readonly showFilters = signal(false);

  protected readonly statCols = STAT_COLUMNS;
  protected readonly relations = RELATIONS;
  protected readonly elements = SMT3_AFFINITY_ELEMENTS.filter((e) => (ELEMENT_ORDER as readonly string[]).includes(e.id));
  protected readonly affinityElements = SMT3_AFFINITY_ELEMENTS;
  protected readonly raceLabel = raceLabel;

  protected readonly raceOptions: readonly ChipOption[] = RACE_ORDER.map((r) => ({ value: r, label: raceLabel(r) }));
  protected readonly inheritOptions: readonly ChipOption[] = INHERIT_ORDER.map((c) => ({ value: c, label: INHERIT_LABEL[c] }));
  protected readonly availabilityOptions: readonly ChipOption[] = [
    ...(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => ({ value: k, label: KIND_LABEL[k] })),
    ...UNLOCK_GROUPS.map((g) => ({ value: g, label: UNLOCK_LABEL[g] })),
  ];

  protected readonly owned = computed(() => new Set(this.compendium.entryMap().keys()));
  protected readonly demons = computed<readonly Demon[]>(() => this.data.data()?.demons ?? []);
  protected readonly visible = computed(() => sortDemons(filterDemons(this.demons(), this.filter(), this.owned()), this.filter()));
  protected readonly active = computed(() => isDemonFilterActive(this.filter()));
  protected readonly trackId = (d: Demon): string => d.id;

  protected kindLabel(d: Demon): string {
    return d.unlock ? `${KIND_LABEL[d.kind]} · gated` : KIND_LABEL[d.kind];
  }

  protected cap(s: string): string {
    return s[0].toUpperCase() + s.slice(1);
  }

  protected caret(key: DemonSortKey): string {
    if (this.filter().sort !== key) return '';
    return this.filter().dir === 'asc' ? ' ▲' : ' ▼';
  }

  protected patch(partial: Partial<DemonFilter>): void {
    this.filter.update((f) => ({ ...f, ...partial }));
  }

  protected toggle(key: 'races' | 'availability' | 'inherits', value: string): void {
    this.filter.update((f) => {
      const current = f[key];
      return { ...f, [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] };
    });
  }

  protected setRelation(value: string): void {
    const relation = (RELATIONS as readonly string[]).includes(value) ? (value as Affinity) : null;
    this.patch({ affinityRelation: relation, affinityElement: relation ? this.filter().affinityElement : null });
  }

  protected setSort(key: DemonSortKey): void {
    this.filter.update((f) => (f.sort === key ? { ...f, dir: f.dir === 'asc' ? 'desc' : 'asc' } : { ...f, sort: key, dir: 'asc' }));
  }

  protected clear(): void {
    this.filter.set({ ...DEFAULT_DEMON_FILTER });
  }
}
