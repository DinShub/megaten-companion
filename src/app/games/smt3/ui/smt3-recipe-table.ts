import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../shared/game-route';
import type { FusionPath, Recipe } from '../fusion';
import { Smt3FusionStore } from '../pages/fusion/smt3-fusion.store';
import { raceLabel } from './smt3-format';

const PATH_LABEL: Record<FusionPath, string> = {
  normal: 'Normal',
  'same-race': 'Same race',
  element: 'Element',
  mitama: 'Mitama',
  special: 'Special',
};

const PAGE = 40;

interface Row {
  readonly key: string;
  readonly cells: readonly { id: string; name: string; meta: string; owned: boolean }[];
  readonly path: string;
  readonly ownedCount: number;
  readonly haystack: string;
}

/**
 * A filterable, paged table of fusion pairs — the shared readout for reverse
 * fusion (target → pairs) and forward fusion (parent + partner → result).
 * `mode` picks which columns show: `reverse` lists both ingredients; `forward`
 * lists the partner and the result.
 */
@Component({
  selector: 'app-smt3-recipe-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="rt">
      <div class="s3-toolbar">
        <span class="s3-search">
          <i class="pi pi-filter" aria-hidden="true"></i>
          <input type="text" [placeholder]="mode() === 'reverse' ? 'Filter by ingredient…' : 'Filter by partner or result…'" aria-label="Filter recipes" [value]="query()" (input)="setQuery($any($event.target).value)" />
        </span>
        <button class="s3-btn" type="button" [class.is-on]="ownedOnly()" [attr.aria-pressed]="ownedOnly()" (click)="ownedOnly.set(!ownedOnly()); limit.set(page)">
          <i class="pi pi-book" aria-hidden="true"></i><span>{{ mode() === 'reverse' ? 'Owned ingredients' : 'Owned partners' }}</span>
        </button>
        <span class="s3-count">{{ filtered().length }} {{ filtered().length === 1 ? 'recipe' : 'recipes' }}</span>
      </div>

      @if (filtered().length) {
        <ul class="s3-list">
          @for (row of shown(); track row.key) {
            <li>
              <span class="rt__pair">
                @for (c of row.cells; track c.id; let i = $index) {
                  @if (i > 0) { <span class="s3-plus" aria-hidden="true">{{ mode() === 'forward' && i === 1 ? '→' : '+' }}</span> }
                  <a [routerLink]="nav.link('demons', c.id)">
                    @if (c.owned) { <i class="pi pi-check-circle s3-owned" aria-label="In your compendium"></i> }
                    <span>{{ c.name }}</span><small class="s3-muted">{{ c.meta }}</small>
                  </a>
                }
              </span>
              <span class="s3-side">{{ row.path }}</span>
            </li>
          }
        </ul>
        @if (filtered().length > limit()) {
          <button class="s3-btn rt__more" type="button" (click)="limit.set(limit() + page)">Show {{ remaining() }} more</button>
        }
      } @else {
        <p class="s3-empty">{{ empty() }}</p>
      }
    </div>
  `,
  styles: `
    .rt { display: flex; flex-direction: column; gap: 0.6rem; }
    .rt__pair { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem 0.5rem; small { margin-left: 0.3rem; font-size: 0.75rem; } }
    .rt__more { align-self: flex-start; }
  `,
})
export class Smt3RecipeTable {
  protected readonly store = inject(Smt3FusionStore);
  protected readonly nav = inject(GameRouteContext);

  readonly recipes = input.required<readonly Recipe[]>();
  readonly mode = input<'reverse' | 'forward'>('reverse');
  /** Message shown when nothing matches. */
  readonly empty = input('No recipes.');

  protected readonly page = PAGE;
  protected readonly query = signal('');
  protected readonly ownedOnly = signal(false);
  protected readonly limit = signal(PAGE);

  private readonly rows = computed<Row[]>(() => {
    const mode = this.mode();
    return this.store.rankRecipes(this.recipes()).map((r) => {
      const ids = mode === 'reverse' ? [...r.ingredientIds] : [r.ingredientIds[1], r.resultId];
      const cells = ids.map((id) => {
        const d = this.store.demon(id);
        return { id, name: d?.name ?? id, meta: d ? `${raceLabel(d.race)} ${d.level}` : '', owned: this.store.isOwned(id) };
      });
      const sources = mode === 'reverse' ? cells : cells.slice(0, 1);
      return {
        key: `${r.ingredientIds.join('+')}>${r.resultId}`,
        cells,
        path: PATH_LABEL[r.path],
        ownedCount: sources.filter((c) => c.owned).length,
        haystack: cells.map((c) => c.name.toLowerCase()).join(' '),
      };
    });
  });

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const sourceCount = this.mode() === 'reverse' ? 2 : 1;
    return this.rows().filter((r) => (!q || r.haystack.includes(q)) && (!this.ownedOnly() || r.ownedCount === sourceCount));
  });

  protected readonly shown = computed(() => this.filtered().slice(0, this.limit()));
  protected readonly remaining = computed(() => Math.min(PAGE, this.filtered().length - this.limit()));

  protected setQuery(value: string): void {
    this.query.set(value);
    this.limit.set(PAGE);
  }
}
