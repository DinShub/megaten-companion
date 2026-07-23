import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { ChipMultiselect, type ChipOption } from '../../../../shared/filters/chip-multiselect';
import { RangeControl } from '../../../../shared/filters/range-control';
import type { Affinity, ElementId } from '../../model';
import { ELEMENT_ORDER } from '../../model/ids';
import { titleCase } from '../../ui/format';
import { isShadowFilterActive, type ShadowFilter } from './shadow-filter';

const RELATIONS: readonly Affinity[] = ['weak', 'resist', 'null', 'repel', 'drain'];

/**
 * Search + collapsible filters shared by the shadow and sub-boss lists (§4.2).
 * Controlled: the parent owns the {@link ShadowFilter} (in its URL state) and
 * every change emits a fresh filter. Passing a non-empty `rankOptions` reveals
 * the Mementos-rank facet used only by the sub-boss list.
 */
@Component({
  selector: 'app-shadow-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChipMultiselect, RangeControl],
  template: `
    <div class="toolbar">
      <span class="toolbar__search">
        <i class="pi pi-search" aria-hidden="true"></i>
        <input type="text" [placeholder]="searchPlaceholder()" [attr.aria-label]="searchPlaceholder()" [value]="filter().search" (input)="patch({ search: $any($event.target).value })" />
      </span>
      <button class="toolbar__btn" type="button" [class.is-on]="showFilters()" (click)="showFilters.set(!showFilters())">
        <i class="pi pi-filter" aria-hidden="true"></i><span>Filters</span>
        @if (active()) { <span class="toolbar__dot"></span> }
      </button>
      @if (active()) { <button class="toolbar__btn" type="button" (click)="clear.emit()"><i class="pi pi-times" aria-hidden="true"></i><span>Clear</span></button> }
    </div>

    @if (showFilters()) {
      <div class="filters">
        <div class="filters__row"><span class="filters__label">Arcana</span>
          <app-chip-multiselect label="Arcana" [options]="arcanaOptions()" [selected]="filter().arcana" (toggle)="toggleList('arcana', $event)" /></div>
        @if (areaOptions().length) {
          <div class="filters__row"><span class="filters__label">Area</span>
            <app-chip-multiselect label="Area" [options]="areaOptions()" [selected]="filter().area" (toggle)="toggleList('area', $event)" /></div>
        }
        @if (rankOptions().length) {
          <div class="filters__row"><span class="filters__label">Request rank</span>
            <app-chip-multiselect label="Request rank" [options]="rankOptions()" [selected]="filter().rank" (toggle)="toggleList('rank', $event)" /></div>
        }
        <div class="filters__row"><span class="filters__label">Level</span>
          <app-range-control label="Level" [min]="1" [max]="99" [lo]="filter().levelMin" [hi]="filter().levelMax" (loChange)="patch({ levelMin: $event })" (hiChange)="patch({ levelMax: $event })" /></div>
        <div class="filters__row"><span class="filters__label">Affinity</span>
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
  `,
  styles: `
    .toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 1rem; }
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

    .filters { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.9rem 1rem; margin-bottom: 1rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.25)); border-radius: var(--p-border-radius, 8px); background: var(--p-surface-800, rgba(127,127,127,0.06)); }
    .filters__row { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
    .filters__label { flex: 0 0 6rem; font-size: 0.82rem; font-weight: 600; color: var(--p-text-muted-color); }
    .filters__affinity {
      display: inline-flex; align-items: center; gap: 0.4rem;
      select { padding: 0.3rem 0.5rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); border-radius: var(--p-border-radius, 6px); background: var(--p-content-background); color: var(--p-text-color); font: inherit; font-size: 0.85rem; }
      span { color: var(--p-text-muted-color); font-size: 0.85rem; }
    }
  `,
})
export class ShadowFilterBar {
  readonly filter = input.required<ShadowFilter>();
  readonly arcanaOptions = input.required<readonly ChipOption[]>();
  readonly areaOptions = input<readonly ChipOption[]>([]);
  readonly rankOptions = input<readonly ChipOption[]>([]);
  readonly searchPlaceholder = input('Search name or arcana…');

  readonly change = output<ShadowFilter>();
  readonly clear = output<void>();

  protected readonly showFilters = signal(false);
  protected readonly relations = RELATIONS;
  protected readonly elements = ELEMENT_ORDER;
  protected readonly titleCase = titleCase;

  protected readonly active = computed(() => isShadowFilterActive(this.filter()));

  protected patch(partial: Partial<ShadowFilter>): void {
    this.change.emit({ ...this.filter(), ...partial });
  }

  protected toggleList(key: 'arcana' | 'area' | 'rank', value: string): void {
    const current = this.filter()[key];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    this.change.emit({ ...this.filter(), [key]: next });
  }

  protected setRelation(value: string): void {
    const relation = (RELATIONS as readonly string[]).includes(value) ? (value as Affinity) : null;
    this.change.emit({
      ...this.filter(),
      affinityRelation: relation,
      affinityElement: relation ? this.filter().affinityElement : null,
    });
  }
}
