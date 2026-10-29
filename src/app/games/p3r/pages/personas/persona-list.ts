import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AffinityGrid } from '../../../../shared/affinity-grid/affinity-grid';
import { ChipMultiselect, type ChipOption } from '../../../../shared/filters/chip-multiselect';
import { RangeControl } from '../../../../shared/filters/range-control';
import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { createUrlState } from '../../../../shared/url-query';
import { VirtualList } from '../../../../shared/virtual-list/virtual-list';
import { P3rCompendiumStore } from '../../compendium/p3r-compendium.store';
import { P3rDataService } from '../../data/p3r-data.service';
import type { Affinity, Persona } from '../../model';
import { ARCANA_ORDER, UNLOCK_GROUPS } from '../../model/ids';
import {
  inheritTypeLabel,
  inheritTypes,
  KIND_LABEL,
  arcanaLabel,
  P3R_AFFINITY_ELEMENTS,
  STAT_COLUMNS,
  UNLOCK_LABEL,
} from '../../ui/p3r-format';
import {
  DEFAULT_PERSONA_FILTER,
  type PersonaFilter,
  type PersonaSortKey,
  filterPersonas,
  isPersonaFilterActive,
  parsePersonaFilter,
  serializePersonaFilter,
  sortPersonas,
} from './persona-filter';

const RELATIONS: readonly Affinity[] = ['weak', 'resist', 'null', 'repel', 'drain'];

/**
 * Persona list — all 194 Reload personas, virtual-scrolled, with filters (arcana,
 * how it's obtained, inheritance, level, affinity, owned) and sort mirrored in
 * the URL so a filtered view restores on reload.
 */
@Component({
  selector: 'app-persona-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AffinityGrid, ChipMultiselect, RangeControl, LoadState, VirtualList],
  template: `
    @if (data.ready()) {
      <div class="p3-page list-page">
        <header class="p3-head">
          <h1>Personas</h1>
          <span class="p3-count">{{ visible().length }} of {{ personas().length }} on file</span>
        </header>

        <div class="p3-toolbar">
          <span class="p3-search">
            <i class="pi pi-search" aria-hidden="true"></i>
            <input type="text" placeholder="Search name or arcana…" aria-label="Search personas by name or arcana" [value]="filter().search" (input)="patch({ search: $any($event.target).value })" />
          </span>
          <button class="p3-btn" type="button" [class.is-on]="showFilters()" (click)="showFilters.set(!showFilters())">
            <i class="pi pi-filter" aria-hidden="true"></i><span>Filters</span>
          </button>
          <button class="p3-btn" type="button" [class.is-on]="filter().owned" [attr.aria-pressed]="filter().owned" (click)="patch({ owned: !filter().owned })">
            <i class="pi" [class.pi-check-circle]="filter().owned" [class.pi-book]="!filter().owned" aria-hidden="true"></i><span>In compendium</span>
          </button>
          @if (active()) {
            <button class="p3-btn" type="button" (click)="clear()"><i class="pi pi-times" aria-hidden="true"></i><span>Clear</span></button>
          }
        </div>

        @if (showFilters()) {
          <div class="p3-filters">
            <div><span class="p3-filters__label">Arcana</span>
              <app-chip-multiselect label="Arcana" [options]="arcanaOptions" [selected]="filter().arcana" (toggle)="toggle('arcana', $event)" /></div>
            <div><span class="p3-filters__label">Obtained by</span>
              <app-chip-multiselect label="Obtained by" [options]="availabilityOptions" [selected]="filter().availability" (toggle)="toggle('availability', $event)" /></div>
            <div><span class="p3-filters__label">Inheritance</span>
              <app-chip-multiselect label="Inheritance type" [options]="inheritOptions()" [selected]="filter().inherits" (toggle)="toggle('inherits', $event)" /></div>
            <div><span class="p3-filters__label">Level</span>
              <app-range-control label="Level" [min]="1" [max]="99" [lo]="filter().levelMin" [hi]="filter().levelMax" (loChange)="patch({ levelMin: $event })" (hiChange)="patch({ levelMax: $event })" /></div>
            <div><span class="p3-filters__label">Affinity</span>
              <select class="p3-select" aria-label="Affinity relation" [value]="filter().affinityRelation ?? ''" (change)="setRelation($any($event.target).value)">
                <option value="">any relation</option>
                @for (r of relations; track r) { <option [value]="r" [selected]="r === filter().affinityRelation">{{ cap(r) }}</option> }
              </select>
              <span class="p3-muted">to</span>
              <select class="p3-select" aria-label="Affinity element" [value]="filter().affinityElement ?? ''" [disabled]="!filter().affinityRelation" (change)="patch({ affinityElement: $any($event.target).value || null })">
                <option value="">any element</option>
                @for (e of elements; track e.id) { <option [value]="e.id" [selected]="e.id === filter().affinityElement">{{ e.label }}</option> }
              </select>
            </div>
          </div>
        }

        <div class="p3-table list-page__body">
          <div class="list-page__table">
            <div class="p3-row p3-row--head personas-grid" role="row">
              <button [class.is-sort]="filter().sort === 'name'" (click)="setSort('name')">Name{{ caret('name') }}</button>
              <button class="col-arcana" [class.is-sort]="filter().sort === 'arcana'" (click)="setSort('arcana')">Arcana{{ caret('arcana') }}</button>
              <button class="p3-num" [class.is-sort]="filter().sort === 'level'" (click)="setSort('level')">Lv{{ caret('level') }}</button>
              <span class="col-md">Obtained</span>
              <span class="col-lg">
                <span class="p3-stats-inline">
                  @for (s of statCols; track s.key) { <button [title]="'Sort by ' + s.label" [class.is-sort]="filter().sort === s.key" (click)="setSort(s.key)">{{ s.abbrev }}</button> }
                </span>
              </span>
              <span>Affinities</span>
            </div>
            <app-virtual-list class="list-page__scroll" [items]="visible()" [itemSize]="44" [row]="rowTpl" [trackBy]="trackId" />
          </div>
          <ng-template #rowTpl let-d>
            <a class="p3-row p3-row--body personas-grid" [routerLink]="nav.link('personas', d.id)">
              <span class="p3-strong">
                @if (owned().has(d.id)) { <i class="pi pi-check-circle p3-owned" aria-label="In your compendium"></i> }
                {{ d.name }}
                <small class="p3-muted m-arcana">{{ arcanaLabel(d.arcana) }}</small>
              </span>
              <span class="p3-muted col-arcana">{{ arcanaLabel(d.arcana) }}</span>
              <span class="p3-num">{{ d.level }}</span>
              <span class="col-md p3-muted">{{ kindLabel(d) }}</span>
              <span class="col-lg"><span class="p3-stats-inline">
                @for (s of statCols; track s.key) { <span>{{ d.stats[s.key] }}</span> }
              </span></span>
              <span><app-affinity-grid [affinities]="d.affinities" [elements]="affinityElements" /></span>
            </a>
          </ng-template>
          @if (visible().length === 0) {
            <p class="p3-empty">No personas match these filters. <button type="button" class="p3-linkbtn" (click)="clear()">Clear filters</button></p>
          }
        </div>
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .personas-grid { grid-template-columns: minmax(8rem, 1.6fr) 5.5rem 2.5rem 8rem 9rem minmax(13rem, 15rem); min-width: 50rem; }
    .m-arcana { display: none; }
    @media (max-width: 767.98px) {
      // Arcana folds under the name so the affinity grid fits a phone without sideways scrolling.
      .personas-grid { grid-template-columns: minmax(4.5rem, 1fr) 1.6rem minmax(12.5rem, 13rem); gap: 0.35rem; min-width: 0; }
      .col-md, .col-lg, .col-arcana { display: none; }
      .m-arcana { display: block; font-size: 0.72rem; font-weight: 400; line-height: 1.1; }
    }
  `,
})
export class PersonaList {
  protected readonly data = inject(P3rDataService);
  protected readonly nav = inject(GameRouteContext);
  private readonly compendium = inject(P3rCompendiumStore);

  protected readonly filter = createUrlState<PersonaFilter>({ parse: parsePersonaFilter, serialize: serializePersonaFilter });
  protected readonly showFilters = signal(false);

  protected readonly statCols = STAT_COLUMNS;
  protected readonly relations = RELATIONS;
  protected readonly elements = P3R_AFFINITY_ELEMENTS;
  protected readonly affinityElements = P3R_AFFINITY_ELEMENTS;
  protected readonly arcanaLabel = arcanaLabel;

  protected readonly arcanaOptions: readonly ChipOption[] = ARCANA_ORDER.map((a) => ({ value: a, label: arcanaLabel(a) }));
  /** The inherit types any persona actually has, in upstream order. */
  protected readonly inheritOptions = computed<readonly ChipOption[]>(() => {
    const used = new Set(this.personas().map((p) => p.inheritType));
    return inheritTypes(this.data.data()?.inheritMatrix ?? {}).filter((t) => used.has(t)).map((t) => ({ value: t, label: inheritTypeLabel(t) }));
  });
  protected readonly availabilityOptions: readonly ChipOption[] = [
    ...(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => ({ value: k, label: KIND_LABEL[k] })),
    ...UNLOCK_GROUPS.map((g) => ({ value: g, label: UNLOCK_LABEL[g] })),
  ];

  protected readonly owned = computed(() => new Set(this.compendium.entryMap().keys()));
  protected readonly personas = computed<readonly Persona[]>(() => this.data.data()?.personas ?? []);
  protected readonly visible = computed(() => sortPersonas(filterPersonas(this.personas(), this.filter(), this.owned()), this.filter()));
  protected readonly active = computed(() => isPersonaFilterActive(this.filter()));
  protected readonly trackId = (d: Persona): string => d.id;

  protected kindLabel(d: Persona): string {
    return d.unlock ? `${KIND_LABEL[d.kind]} · gated` : KIND_LABEL[d.kind];
  }

  protected cap(s: string): string {
    return s[0].toUpperCase() + s.slice(1);
  }

  protected caret(key: PersonaSortKey): string {
    if (this.filter().sort !== key) return '';
    return this.filter().dir === 'asc' ? ' ▲' : ' ▼';
  }

  protected patch(partial: Partial<PersonaFilter>): void {
    this.filter.update((f) => ({ ...f, ...partial }));
  }

  protected toggle(key: 'arcana' | 'availability' | 'inherits', value: string): void {
    this.filter.update((f) => {
      const current = f[key];
      return { ...f, [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] };
    });
  }

  protected setRelation(value: string): void {
    const relation = (RELATIONS as readonly string[]).includes(value) ? (value as Affinity) : null;
    this.patch({ affinityRelation: relation, affinityElement: relation ? this.filter().affinityElement : null });
  }

  protected setSort(key: PersonaSortKey): void {
    this.filter.update((f) => (f.sort === key ? { ...f, dir: f.dir === 'asc' ? 'desc' : 'asc' } : { ...f, sort: key, dir: 'asc' }));
  }

  protected clear(): void {
    this.filter.set({ ...DEFAULT_PERSONA_FILTER });
  }
}
