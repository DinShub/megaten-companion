import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AffinityGrid } from '../../../../shared/affinity-grid/affinity-grid';
import { ChipMultiselect, type ChipOption } from '../../../../shared/filters/chip-multiselect';
import { RangeControl } from '../../../../shared/filters/range-control';
import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { VirtualList } from '../../../../shared/virtual-list/virtual-list';
import { createUrlState } from '../../../../shared/url-query';
import { CompendiumStore } from '../../compendium/compendium.store';
import { GameDataService } from '../../data/game-data.service';
import type { Affinity, ElementId, Persona } from '../../model';
import { ARCANA_ORDER, ELEMENT_ORDER, INHERIT_TYPE_ORDER } from '../../model/ids';
import { STAT_COLUMNS, titleCase } from '../../ui/format';
import {
  DEFAULT_PERSONA_FILTER,
  filterPersonas,
  isPersonaFilterActive,
  parsePersonaFilter,
  type PersonaFilter,
  type PersonaSortKey,
  serializePersonaFilter,
  sortPersonas,
} from './persona-filter';
import { RansomTitle } from '../../ui/ransom-title';

const KIND_LABELS: Record<Persona['kind'], string> = {
  normal: 'Fusable',
  special: 'Special',
  treasure: 'Treasure',
  party: 'Party',
};

const AVAILABILITY_OPTIONS: readonly ChipOption[] = [
  { value: 'normal', label: 'Fusable' },
  { value: 'special', label: 'Special' },
  { value: 'treasure', label: 'Treasure' },
  { value: 'party', label: 'Party' },
  { value: 'story', label: 'Story-gated' },
  { value: 'confidant', label: 'Confidant' },
  { value: 'dlc', label: 'DLC' },
];

const RELATIONS: readonly Affinity[] = ['weak', 'resist', 'null', 'repel', 'drain'];

/**
 * Persona list (§4.1, task 19). All 242 personas, virtual-scrolled, with the §4.1
 * filters and sort kept in the URL query string so a filtered view restores on
 * reload. Ownership badges / the "in my compendium" filter are wired in Phase 4
 * (task 30), once the compendium store exists.
 */
@Component({
  selector: 'app-persona-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AffinityGrid, ChipMultiselect, RangeControl, LoadState, VirtualList, RansomTitle],
  template: `
    @if (data.ready()) {
      <div class="page list-page">
        <header class="page__head">
          <app-ransom-title class="page__title" text="Personas" />
          <span class="page__count">{{ visible().length }} of {{ personas().length }}</span>
        </header>

        <div class="toolbar">
          <span class="toolbar__search">
            <i class="pi pi-search" aria-hidden="true"></i>
            <input
              type="text"
              placeholder="Search name or arcana…"
              aria-label="Search personas by name or arcana"
              [value]="filter().search"
              (input)="patch({ search: $any($event.target).value })"
            />
          </span>
          <button class="toolbar__btn" type="button" [class.is-on]="showFilters()" (click)="showFilters.set(!showFilters())">
            <i class="pi pi-filter" aria-hidden="true"></i>
            <span>Filters</span>
            @if (active()) { <span class="toolbar__dot" aria-label="filters active"></span> }
          </button>
          <button class="toolbar__btn" type="button" [class.is-on]="filter().owned" [attr.aria-pressed]="filter().owned" (click)="patch({ owned: !filter().owned })" title="Show only personas in your compendium">
            <i class="pi" [class.pi-check-circle]="filter().owned" [class.pi-book]="!filter().owned" aria-hidden="true"></i>
            <span>In compendium</span>
          </button>
          @if (active()) {
            <button class="toolbar__btn" type="button" (click)="clear()">
              <i class="pi pi-times" aria-hidden="true"></i><span>Clear</span>
            </button>
          }
        </div>

        @if (showFilters()) {
          <div class="filters">
            <div class="filters__row">
              <span class="filters__label">Arcana</span>
              <app-chip-multiselect label="Arcana" [options]="arcanaOptions" [selected]="filter().arcana" (toggle)="toggleList('arcana', $event)" />
            </div>
            <div class="filters__row">
              <span class="filters__label">Inherit type</span>
              <app-chip-multiselect label="Inherit type" [options]="inheritOptions" [selected]="filter().inherit" (toggle)="toggleList('inherit', $event)" />
            </div>
            <div class="filters__row">
              <span class="filters__label">Availability</span>
              <app-chip-multiselect label="Availability" [options]="availabilityOptions" [selected]="filter().availability" (toggle)="toggleList('availability', $event)" />
            </div>
            <div class="filters__row">
              <span class="filters__label">Level</span>
              <app-range-control
                label="Level"
                [min]="1"
                [max]="99"
                [lo]="filter().levelMin"
                [hi]="filter().levelMax"
                (loChange)="patch({ levelMin: $event })"
                (hiChange)="patch({ levelMax: $event })"
              />
            </div>
            <div class="filters__row">
              <span class="filters__label">Affinity</span>
              <div class="filters__affinity">
                <select aria-label="Affinity relation" [value]="filter().affinityRelation ?? ''" (change)="setRelation($any($event.target).value)">
                  <option value="">any relation</option>
                  @for (r of relations; track r) { <option [value]="r">{{ titleCase(r) }}</option> }
                </select>
                <span>to</span>
                <select aria-label="Affinity element" [value]="filter().affinityElement ?? ''" (change)="patch({ affinityElement: $any($event.target).value || null })" [disabled]="!filter().affinityRelation">
                  <option value="">any element</option>
                  @for (e of elements; track e) { <option [value]="e">{{ titleCase(e) }}</option> }
                </select>
              </div>
            </div>
          </div>
        }

        <div class="tablewrap list-page__body">
          <div class="list-page__table">
            <div class="grid grid--head" role="row">
              <button class="cell cell--name" [class.is-sort]="filter().sort === 'name'" (click)="setSort('name')">Name{{ caret('name') }}</button>
              <button class="cell cell--arcana" [class.is-sort]="filter().sort === 'arcana'" (click)="setSort('arcana')">Arcana{{ caret('arcana') }}</button>
              <button class="cell cell--lv" [class.is-sort]="filter().sort === 'level'" (click)="setSort('level')">Lv{{ caret('level') }}</button>
              <button class="cell cell--inherit col-md" [class.is-sort]="filter().sort === 'inherit'" (click)="setSort('inherit')">Inherit{{ caret('inherit') }}</button>
              <span class="cell cell--trait col-lg">Trait</span>
              <span class="cell cell--stats col-lg">
                @for (s of statCols; track s.key) { <span class="stat" [title]="s.label">{{ s.abbrev }}</span> }
              </span>
              <span class="cell cell--aff">Affinities</span>
            </div>

            <app-virtual-list class="list-page__scroll" [items]="visible()" [itemSize]="44" [row]="rowTpl" [trackBy]="trackId" [attr.aria-rowcount]="visible().length" />
          </div>
          <ng-template #rowTpl let-p>
            <a class="grid grid--row" [routerLink]="nav.link('personas', p.id)">
              <span class="cell cell--name">
                @if (owned().has(p.id)) { <i class="pi pi-check-circle owned-dot" [title]="ownedTitle(p.id)" aria-label="In your compendium" aria-hidden="false"></i> }
                {{ p.name }}
              </span>
              <span class="cell cell--arcana">{{ titleCase(p.arcana) }}</span>
              <span class="cell cell--lv">{{ p.level }}</span>
              <span class="cell cell--inherit col-md">{{ inheritLabel(p.inheritType) }}</span>
              <span class="cell cell--trait col-lg">{{ traitName(p.traitId) }}</span>
              <span class="cell cell--stats col-lg">
                @for (s of statCols; track s.key) { <span class="stat" [title]="s.label">{{ p.stats[s.key] }}</span> }
              </span>
              <span class="cell cell--aff"><app-affinity-grid [affinities]="p.affinities" /></span>
            </a>
          </ng-template>

          @if (visible().length === 0) {
            <p class="empty">No persona fits that profile. <button type="button" class="linkbtn" (click)="clear()">Clear filters</button></p>
          }
        </div>
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .page { display: flex; flex-direction: column; gap: 1rem; }
    .page__head { display: flex; align-items: baseline; gap: 0.75rem; }
    .page__title { margin: 0; font-size: 1.5rem; }
    .page__count { color: var(--p-text-muted-color); font-size: 0.9rem; }

    .toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
    .toolbar__search {
      display: inline-flex; align-items: center; gap: 0.5rem; flex: 1 1 16rem;
      padding: 0.4rem 0.7rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3));
      border-radius: var(--p-border-radius, 6px); background: var(--p-content-background);
      .pi { color: var(--p-text-muted-color); }
      input { flex: 1 1 auto; border: 0; background: transparent; color: var(--p-text-color); font: inherit; outline: none; }
    }
    .toolbar__btn {
      display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.75rem;
      border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); border-radius: var(--p-border-radius, 6px);
      background: transparent; color: var(--p-text-color); font: inherit; font-size: 0.9rem; cursor: pointer;
      &:hover { border-color: var(--p-primary-color); }
      &.is-on { border-color: var(--p-primary-color); color: var(--p-primary-color); }
    }
    .toolbar__dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--p-primary-color); }

    .filters {
      display: flex; flex-direction: column; gap: 0.75rem; padding: 0.9rem 1rem;
      border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.25)); border-radius: var(--p-border-radius, 8px);
      background: var(--app-panel);
    }
    .filters__row { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
    .filters__label { flex: 0 0 6rem; font-size: 0.82rem; font-weight: 600; color: var(--p-text-muted-color); }
    .filters__affinity {
      display: inline-flex; align-items: center; gap: 0.4rem;
      select {
        padding: 0.3rem 0.5rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3));
        border-radius: var(--p-border-radius, 6px); background: var(--p-content-background); color: var(--p-text-color); font: inherit; font-size: 0.85rem;
      }
      span { color: var(--p-text-muted-color); font-size: 0.85rem; }
    }

    .tablewrap { display: flex; flex-direction: column; overflow-x: auto; }
    .grid {
      display: grid; align-items: center;
      grid-template-columns:
        minmax(8rem, 1.6fr) 6rem 3rem 6rem minmax(7rem, 1.2fr) 9rem minmax(13rem, 15rem);
      gap: 0.5rem; padding: 0 0.5rem; min-width: 52rem;
    }
    .grid--head {
      position: sticky; top: 0; z-index: 1; height: 2.4rem;
      border-bottom: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3));
      background: var(--p-content-background); font-size: 0.78rem; color: var(--p-text-muted-color); text-transform: uppercase; letter-spacing: 0.03em;
    }
    .grid--head .cell { background: transparent; border: 0; color: inherit; font: inherit; text-transform: inherit; letter-spacing: inherit; text-align: left; padding: 0; cursor: default; }
    /* Scoped under .grid--head: emulated-encapsulation attributes inflate the
       descendant '.grid--head .cell { color: inherit }' above a bare 'button.cell',
       so without the ancestor here the sort/hover colours never win. */
    .grid--head button.cell { cursor: pointer; &:hover { color: var(--p-text-color); } &.is-sort { color: var(--p-primary-color); } }

    .grid--row {
      height: 100%; text-decoration: none; color: var(--p-text-color);
      border-bottom: 1px solid var(--p-content-border-color, rgba(127,127,127,0.12));
      &:hover { background: var(--p-highlight-background, rgba(127,127,127,0.1)); }
    }
    .cell { overflow: hidden; }
    .cell--name { font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .cell--arcana, .cell--inherit { text-transform: capitalize; color: var(--p-text-muted-color); font-size: 0.9rem; }
    .cell--lv { text-align: right; font-variant-numeric: tabular-nums; }
    .cell--trait { color: var(--p-text-muted-color); font-size: 0.85rem; text-overflow: ellipsis; white-space: nowrap; }
    .cell--stats { display: inline-flex; gap: 0.35rem; font-variant-numeric: tabular-nums; font-size: 0.85rem; }
    .stat { min-width: 1.4rem; text-align: right; color: var(--p-text-muted-color); }

    .empty { padding: 2rem 1rem; text-align: center; color: var(--p-text-muted-color); }
    .linkbtn { border: 0; background: transparent; color: var(--p-primary-color); cursor: pointer; font: inherit; text-decoration: underline; }

    @media (max-width: 767.98px) {
      .grid { grid-template-columns: minmax(6rem, 1.6fr) 5rem 2.5rem minmax(11rem, 14rem); min-width: 0; }
      .col-md, .col-lg { display: none; }
    }
  `,
})
export class PersonaList {
  protected readonly data = inject(GameDataService);
  protected readonly nav = inject(GameRouteContext);
  private readonly compendium = inject(CompendiumStore);

  protected readonly filter = createUrlState<PersonaFilter>({
    parse: parsePersonaFilter,
    serialize: serializePersonaFilter,
  });

  /** Owned persona ids, for the badge glyph and the "in compendium" filter (task 30). */
  protected readonly owned = computed(() => new Set(this.compendium.entryMap().keys()));

  protected readonly showFilters = signal(false);
  protected readonly statCols = STAT_COLUMNS;
  protected readonly relations = RELATIONS;
  protected readonly elements = ELEMENT_ORDER;
  protected readonly titleCase = titleCase;

  protected readonly arcanaOptions: readonly ChipOption[] = ARCANA_ORDER.map((a) => ({ value: a, label: titleCase(a) }));
  protected readonly inheritOptions: readonly ChipOption[] = INHERIT_TYPE_ORDER.map((t) => ({
    value: t,
    label: t === 'none' ? 'None' : titleCase(t),
  }));
  protected readonly availabilityOptions = AVAILABILITY_OPTIONS;

  protected readonly personas = computed<readonly Persona[]>(() => this.data.data()?.personas ?? []);

  private readonly traitsById = computed(() => {
    const map = new Map<string, string>();
    for (const t of this.data.data()?.traits ?? []) map.set(t.id, t.name);
    return map;
  });

  protected readonly visible = computed(() =>
    sortPersonas(filterPersonas(this.personas(), this.filter(), this.owned()), this.filter()),
  );

  protected readonly active = computed(() => isPersonaFilterActive(this.filter()));

  protected readonly trackId = (p: Persona): string => p.id;

  protected ownedTitle(id: string): string {
    const level = this.compendium.entryFor(id)?.level;
    return level != null ? `In your compendium — Lv ${level}` : 'In your compendium';
  }

  protected traitName(id: string | null): string {
    return id ? (this.traitsById().get(id) ?? id) : '—';
  }

  protected inheritLabel(type: string): string {
    return type === 'none' ? '—' : titleCase(type);
  }

  protected caret(key: PersonaSortKey): string {
    if (this.filter().sort !== key) return '';
    return this.filter().dir === 'asc' ? ' ▲' : ' ▼';
  }

  protected patch(partial: Partial<PersonaFilter>): void {
    this.filter.update((f) => ({ ...f, ...partial }));
  }

  protected toggleList(key: 'arcana' | 'inherit' | 'availability', value: string): void {
    this.filter.update((f) => {
      const current = f[key];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...f, [key]: next };
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
