import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ChipMultiselect, type ChipOption } from '../../../../shared/filters/chip-multiselect';
import { RangeControl } from '../../../../shared/filters/range-control';
import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { SkillChip } from '../../../../shared/skill-chip/skill-chip';
import { VirtualList } from '../../../../shared/virtual-list/virtual-list';
import { createUrlState } from '../../../../shared/url-query';
import { GameDataService } from '../../data/game-data.service';
import type { Skill } from '../../model';
import { formatSkillCost, SKILL_ELEMENT_NAMES } from '../../ui/format';
import {
  DEFAULT_SKILL_FILTER,
  filterSkills,
  isSkillFilterActive,
  parseSkillFilter,
  type SkillFilter,
  type SkillSortKey,
  serializeSkillFilter,
  sortSkills,
} from './skill-filter';

const SKILL_ELEMENTS: readonly string[] = [
  'phys', 'gun', 'fire', 'ice', 'elec', 'wind', 'psy', 'nuke', 'bless', 'curse',
  'almighty', 'ailment', 'support', 'healing', 'passive',
];

const COST_OPTIONS: readonly ChipOption[] = [
  { value: 'sp', label: 'SP' },
  { value: 'hp-percent', label: '% HP' },
  { value: 'gauge', label: 'Gauge' },
  { value: 'none', label: 'No cost' },
];

const TARGET_OPTIONS: readonly ChipOption[] = [
  { value: '1 foe', label: '1 foe' },
  { value: 'All foes', label: 'All foes' },
  { value: '1 ally', label: '1 ally' },
  { value: 'All allies', label: 'All allies' },
  { value: 'Self', label: 'Self' },
  { value: 'Universal', label: 'Universal' },
];

const INHERITANCE_OPTIONS: readonly ChipOption[] = [
  { value: 'inheritable', label: 'Inheritable' },
  { value: 'unique', label: 'Unique' },
];

/**
 * Skill list (§4.3, task 23). All ~449 skills, virtual-scrolled, with the §4.3
 * filters and sort deep-linked in the URL. The card-availability column marks
 * which skills have a skill-card origin; the three distinct card kinds are shown
 * on the detail page.
 */
@Component({
  selector: 'app-skill-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ChipMultiselect, RangeControl, SkillChip, LoadState, VirtualList],
  template: `
    @if (data.ready()) {
      <div class="page list-page">
        <header class="page__head">
          <h1 class="page__title">Skills</h1>
          <span class="page__count">{{ visible().length }} of {{ skills().length }}</span>
        </header>

        <div class="toolbar">
          <span class="toolbar__search">
            <i class="pi pi-search" aria-hidden="true"></i>
            <input type="text" placeholder="Search name or effect…" aria-label="Search skills by name or effect" [value]="filter().search" (input)="patch({ search: $any($event.target).value })" />
          </span>
          <button class="toolbar__btn" type="button" [class.is-on]="showFilters()" (click)="showFilters.set(!showFilters())">
            <i class="pi pi-filter" aria-hidden="true"></i><span>Filters</span>
            @if (active()) { <span class="toolbar__dot"></span> }
          </button>
          @if (active()) { <button class="toolbar__btn" type="button" (click)="clear()"><i class="pi pi-times" aria-hidden="true"></i><span>Clear</span></button> }
        </div>

        @if (showFilters()) {
          <div class="filters">
            <div class="filters__row"><span class="filters__label">Element</span>
              <app-chip-multiselect label="Element" [options]="elementOptions" [selected]="filter().element" (toggle)="toggleList('element', $event)" /></div>
            <div class="filters__row"><span class="filters__label">Cost</span>
              <app-chip-multiselect label="Cost type" [options]="costOptions" [selected]="filter().costType" (toggle)="toggleList('costType', $event)" />
              <app-range-control label="Cost amount" [min]="0" [max]="200" [lo]="filter().costMin" [hi]="filter().costMax" (loChange)="patch({ costMin: $event })" (hiChange)="patch({ costMax: $event })" /></div>
            <div class="filters__row"><span class="filters__label">Target</span>
              <app-chip-multiselect label="Target" [options]="targetOptions" [selected]="filter().target" (toggle)="toggleList('target', $event)" /></div>
            <div class="filters__row"><span class="filters__label">Inheritance</span>
              <app-chip-multiselect label="Inheritance" [options]="inheritanceOptions" [selected]="filter().inheritance" (toggle)="toggleList('inheritance', $event)" />
              <button class="chip-toggle" type="button" [class.is-on]="filter().hasCard" [attr.aria-pressed]="filter().hasCard" (click)="patch({ hasCard: !filter().hasCard })">
                <i class="pi" [class.pi-check]="filter().hasCard" [class.pi-id-card]="!filter().hasCard" aria-hidden="true"></i> Has skill card
              </button></div>
          </div>
        }

        <div class="tablewrap list-page__body">
          <div class="grid grid--head" role="row">
            <button class="cell" [class.is-sort]="filter().sort === 'name'" (click)="setSort('name')">Name{{ caret('name') }}</button>
            <button class="cell col-md" [class.is-sort]="filter().sort === 'element'" (click)="setSort('element')">Element{{ caret('element') }}</button>
            <button class="cell cell--cost" [class.is-sort]="filter().sort === 'cost'" (click)="setSort('cost')">Cost{{ caret('cost') }}</button>
            <button class="cell col-md" [class.is-sort]="filter().sort === 'target'" (click)="setSort('target')">Target{{ caret('target') }}</button>
            <span class="cell col-lg">Effect</span>
            <span class="cell cell--card">Card</span>
          </div>

          <app-virtual-list class="list-page__scroll" [items]="visible()" [itemSize]="40" [row]="rowTpl" [trackBy]="trackId" />
          <ng-template #rowTpl let-s>
            <a class="grid grid--row" [routerLink]="nav.link('skills', s.id)">
              <span class="cell cell--name"><app-skill-chip [name]="s.name" [element]="s.element" [unique]="s.unique" /></span>
              <span class="cell col-md cell--el">{{ elementName(s.element) }}</span>
              <span class="cell cell--cost">{{ formatCost(s.cost) }}</span>
              <span class="cell col-md cell--target">{{ s.target }}</span>
              <span class="cell col-lg cell--effect">{{ s.description }}</span>
              <span class="cell cell--card">
                @if (s.cardSources.length) { <i class="pi pi-id-card" [title]="s.cardSources.length + ' card source(s)'" aria-label="Has skill card"></i> }
                @else { <span class="muted">—</span> }
              </span>
            </a>
          </ng-template>

          @if (visible().length === 0) {
            <p class="empty">No skills match these filters. <button type="button" class="linkbtn" (click)="clear()">Clear filters</button></p>
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
      &:hover { border-color: var(--p-primary-color); } &.is-on { border-color: var(--p-primary-color); color: var(--p-primary-color); }
    }
    .toolbar__dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--p-primary-color); }

    .filters { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.9rem 1rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.25)); border-radius: var(--p-border-radius, 8px); background: var(--p-surface-800, rgba(127,127,127,0.06)); }
    .filters__row { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
    .filters__label { flex: 0 0 6rem; font-size: 0.82rem; font-weight: 600; color: var(--p-text-muted-color); }
    .chip-toggle { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0.6rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); border-radius: 999px; background: transparent; color: var(--p-text-color); font: inherit; font-size: 0.82rem; cursor: pointer; &.is-on { border-color: var(--p-primary-color); color: var(--p-primary-color); } }

    .tablewrap { display: flex; flex-direction: column; overflow-x: auto; }
    .grid { display: grid; align-items: center; grid-template-columns: minmax(10rem, 1.5fr) 6rem 4.5rem 6rem minmax(12rem, 2fr) 3rem; gap: 0.5rem; padding: 0 0.5rem; min-width: 48rem; }
    .grid--head { position: sticky; top: 0; z-index: 1; height: 2.4rem; border-bottom: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); background: var(--p-content-background); font-size: 0.78rem; color: var(--p-text-muted-color); text-transform: uppercase; letter-spacing: 0.03em; }
    .grid--head .cell { background: transparent; border: 0; color: inherit; font: inherit; text-transform: inherit; letter-spacing: inherit; text-align: left; padding: 0; }
    button.cell { cursor: pointer; &:hover { color: var(--p-text-color); } &.is-sort { color: var(--p-primary-color); } }

    .grid--row { height: 100%; text-decoration: none; color: var(--p-text-color); border-bottom: 1px solid var(--p-content-border-color, rgba(127,127,127,0.12)); &:hover { background: var(--p-highlight-background, rgba(127,127,127,0.1)); } }
    .cell { overflow: hidden; }
    .cell--el, .cell--target { text-transform: capitalize; color: var(--p-text-muted-color); font-size: 0.88rem; }
    .cell--cost { font-variant-numeric: tabular-nums; font-size: 0.88rem; }
    .cell--effect { color: var(--p-text-muted-color); font-size: 0.82rem; text-overflow: ellipsis; white-space: nowrap; }
    .cell--card { text-align: center; color: var(--p-primary-color); }
    .muted { color: var(--p-text-muted-color); }

    .empty { padding: 2rem 1rem; text-align: center; color: var(--p-text-muted-color); }
    .linkbtn { border: 0; background: transparent; color: var(--p-primary-color); cursor: pointer; font: inherit; text-decoration: underline; }

    @media (max-width: 767.98px) {
      .grid { grid-template-columns: minmax(9rem, 1.6fr) 4.5rem 3rem; min-width: 0; }
      .col-md, .col-lg { display: none; }
    }
  `,
})
export class SkillList {
  protected readonly data = inject(GameDataService);
  protected readonly nav = inject(GameRouteContext);

  protected readonly filter = createUrlState<SkillFilter>({ parse: parseSkillFilter, serialize: serializeSkillFilter });
  protected readonly showFilters = signal(false);

  protected readonly elementOptions: readonly ChipOption[] = SKILL_ELEMENTS.map((e) => ({ value: e, label: SKILL_ELEMENT_NAMES[e as keyof typeof SKILL_ELEMENT_NAMES] }));
  protected readonly costOptions = COST_OPTIONS;
  protected readonly targetOptions = TARGET_OPTIONS;
  protected readonly inheritanceOptions = INHERITANCE_OPTIONS;

  protected readonly skills = computed<readonly Skill[]>(() => this.data.data()?.skills ?? []);
  protected readonly visible = computed(() => sortSkills(filterSkills(this.skills(), this.filter()), this.filter()));
  protected readonly active = computed(() => isSkillFilterActive(this.filter()));

  protected readonly formatCost = formatSkillCost;

  protected readonly trackId = (s: Skill): string => s.id;

  protected elementName(el: string): string {
    return SKILL_ELEMENT_NAMES[el as keyof typeof SKILL_ELEMENT_NAMES] ?? el;
  }

  protected caret(key: SkillSortKey): string {
    if (this.filter().sort !== key) return '';
    return this.filter().dir === 'asc' ? ' ▲' : ' ▼';
  }

  protected patch(partial: Partial<SkillFilter>): void {
    this.filter.update((f) => ({ ...f, ...partial }));
  }

  protected toggleList(key: 'element' | 'costType' | 'target' | 'inheritance', value: string): void {
    this.filter.update((f) => {
      const current = f[key];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...f, [key]: next };
    });
  }

  protected setSort(key: SkillSortKey): void {
    this.filter.update((f) => (f.sort === key ? { ...f, dir: f.dir === 'asc' ? 'desc' : 'asc' } : { ...f, sort: key, dir: 'asc' }));
  }

  protected clear(): void {
    this.filter.set({ ...DEFAULT_SKILL_FILTER });
  }
}
