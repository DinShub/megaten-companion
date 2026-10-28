import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ChipMultiselect, type ChipOption } from '../../../../shared/filters/chip-multiselect';
import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { createUrlState } from '../../../../shared/url-query';
import { VirtualList } from '../../../../shared/virtual-list/virtual-list';
import { P4gDataService } from '../../data/p4g-data.service';
import type { Skill } from '../../model';
import { SKILL_ELEMENT_ORDER } from '../../model/ids';
import { formatSkillCost, SKILL_ELEMENT_LABEL } from '../../ui/p4g-format';
import {
  DEFAULT_SKILL_FILTER,
  filterSkills,
  isSkillFilterActive,
  parseSkillFilter,
  serializeSkillFilter,
  type SkillFilter,
  type SkillSortKey,
  sortSkills,
} from './p4g-skill-filter';

const INHERIT_OPTIONS: readonly ChipOption[] = [
  { value: 'inheritable', label: 'Inheritable' },
  { value: 'unique', label: 'Unique' },
];

/** Skill list — every P4G skill, filterable by element, inheritability and skill card. */
@Component({
  selector: 'app-p4g-skill-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ChipMultiselect, LoadState, VirtualList],
  template: `
    @if (data.ready()) {
      <div class="p4-page list-page">
        <header class="p4-head">
          <h1>Skills</h1>
          <span class="p4-count">{{ visible().length }} of {{ skills().length }} on file</span>
        </header>

        <div class="p4-toolbar">
          <span class="p4-search">
            <i class="pi pi-search" aria-hidden="true"></i>
            <input type="text" placeholder="Search name or effect…" aria-label="Search skills by name or effect" [value]="filter().search" (input)="patch({ search: $any($event.target).value })" />
          </span>
          <button class="p4-btn" type="button" [class.is-on]="showFilters()" (click)="showFilters.set(!showFilters())">
            <i class="pi pi-filter" aria-hidden="true"></i><span>Filters</span>
          </button>
          @if (active()) {
            <button class="p4-btn" type="button" (click)="clear()"><i class="pi pi-times" aria-hidden="true"></i><span>Clear</span></button>
          }
        </div>

        @if (showFilters()) {
          <div class="p4-filters">
            <div><span class="p4-filters__label">Element</span>
              <app-chip-multiselect label="Element" [options]="elementOptions" [selected]="filter().elements" (toggle)="toggle('elements', $event)" /></div>
            <div><span class="p4-filters__label">Inheritance</span>
              <app-chip-multiselect label="Inheritance" [options]="inheritOptions" [selected]="filter().inherit" (toggle)="toggle('inherit', $event)" /></div>
            <div><span class="p4-filters__label">Skill card</span>
              <button class="p4-btn" type="button" [class.is-on]="filter().card" [attr.aria-pressed]="filter().card" (click)="patch({ card: !filter().card })">Has a skill card</button></div>
          </div>
        }

        <div class="p4-table list-page__body">
          <div class="list-page__table">
            <div class="p4-row p4-row--head skills-grid" role="row">
              <button [class.is-sort]="filter().sort === 'name'" (click)="setSort('name')">Name{{ caret('name') }}</button>
              <button [class.is-sort]="filter().sort === 'element'" (click)="setSort('element')">Element{{ caret('element') }}</button>
              <button class="p4-num" [class.is-sort]="filter().sort === 'cost'" (click)="setSort('cost')">Cost{{ caret('cost') }}</button>
              <span class="col-md">Target</span>
              <span class="col-md">Card</span>
              <span class="col-lg">Effect</span>
            </div>
            <app-virtual-list class="list-page__scroll" [items]="visible()" [itemSize]="44" [row]="rowTpl" [trackBy]="trackId" />
          </div>
          <ng-template #rowTpl let-s>
            <a class="p4-row p4-row--body skills-grid" [routerLink]="nav.link('skills', s.id)">
              <span class="p4-strong"><span class="el-dot" [attr.data-el]="s.element" aria-hidden="true"></span> {{ s.name }}</span>
              <span class="p4-muted">{{ elementName(s) }}</span>
              <span class="p4-num">{{ cost(s) }}</span>
              <span class="col-md p4-muted">{{ s.target }}</span>
              <span class="col-md p4-muted">{{ card(s) }}</span>
              <span class="col-lg p4-muted">{{ s.description }}</span>
            </a>
          </ng-template>
          @if (visible().length === 0) {
            <p class="p4-empty">No skills match these filters. <button type="button" class="p4-linkbtn" (click)="clear()">Clear filters</button></p>
          }
        </div>
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .skills-grid { grid-template-columns: minmax(9rem, 1.3fr) 5.5rem 4.5rem 6rem 7rem minmax(12rem, 2.5fr); min-width: 52rem; }
    .el-dot { display: inline-block; }
    @media (max-width: 767.98px) {
      .skills-grid { grid-template-columns: minmax(8rem, 1.6fr) 5rem 4rem; min-width: 0; }
      .col-md, .col-lg { display: none; }
    }
  `,
})
export class P4gSkillList {
  protected readonly data = inject(P4gDataService);
  protected readonly nav = inject(GameRouteContext);

  protected readonly filter = createUrlState<SkillFilter>({ parse: parseSkillFilter, serialize: serializeSkillFilter });
  protected readonly showFilters = signal(false);
  protected readonly elementOptions: readonly ChipOption[] = SKILL_ELEMENT_ORDER.map((e) => ({ value: e, label: SKILL_ELEMENT_LABEL[e] }));
  protected readonly inheritOptions = INHERIT_OPTIONS;

  protected readonly skills = computed<readonly Skill[]>(() => this.data.data()?.skills ?? []);
  protected readonly visible = computed(() => sortSkills(filterSkills(this.skills(), this.filter()), this.filter()));
  protected readonly active = computed(() => isSkillFilterActive(this.filter()));
  protected readonly trackId = (s: Skill): string => s.id;

  protected elementName(s: Skill): string {
    return SKILL_ELEMENT_LABEL[s.element];
  }

  protected cost(s: Skill): string {
    return formatSkillCost(s.cost);
  }

  protected card(s: Skill): string {
    if (s.unique) return 'Unique';
    return s.cardPersonaId ? (this.data.personasById().get(s.cardPersonaId)?.name ?? s.cardPersonaId) : '—';
  }

  protected caret(key: SkillSortKey): string {
    if (this.filter().sort !== key) return '';
    return this.filter().dir === 'asc' ? ' ▲' : ' ▼';
  }

  protected patch(partial: Partial<SkillFilter>): void {
    this.filter.update((f) => ({ ...f, ...partial }));
  }

  protected toggle(key: 'elements' | 'inherit', value: string): void {
    this.filter.update((f) => {
      const current = f[key];
      return { ...f, [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] };
    });
  }

  protected setSort(key: SkillSortKey): void {
    this.filter.update((f) => (f.sort === key ? { ...f, dir: f.dir === 'asc' ? 'desc' : 'asc' } : { ...f, sort: key, dir: 'asc' }));
  }

  protected clear(): void {
    this.filter.set({ ...DEFAULT_SKILL_FILTER });
  }
}
