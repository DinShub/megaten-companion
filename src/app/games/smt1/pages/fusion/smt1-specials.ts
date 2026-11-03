import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { Smt1DataService } from '../../data/smt1-data.service';
import type { Demon, SpecialRecipe } from '../../model';
import { displayLevel } from '../../model';
import { raceLabel } from '../../ui/smt1-format';

type Filter = 'all' | 'named' | 'elements';

interface Card {
  readonly demon: Demon;
  readonly parts: readonly Demon[];
  readonly text: string | null;
}

/**
 * Every special recipe as a recipe card, grouped the way a guide would: named
 * parents, element pairs, element trios, and the one condition-only entry.
 * Then the demons fusion can't make at all.
 */
@Component({
  selector: 'app-smt1-specials',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState],
  template: `
    @if (data.ready()) {
      <div class="g1-page">
        <div class="g1-runhead">
          <div>
            <h1><span class="g1-runhead__jp g1-plate" lang="ja">特殊合体</span>Special fusions</h1>
            <p>Recipes that always give one particular demon, whatever the race chart says.</p>
          </div>
          <div class="g1-seg" role="group" aria-label="Show">
            <button type="button" [attr.aria-pressed]="filter() === 'all'" (click)="filter.set('all')">All</button>
            <button type="button" [attr.aria-pressed]="filter() === 'named'" (click)="filter.set('named')">Named parents</button>
            <button type="button" [attr.aria-pressed]="filter() === 'elements'" (click)="filter.set('elements')">Elements</button>
          </div>
        </div>

        @for (g of groups(); track g.title) {
          @if (filter() === 'all' || filter() === g.filter) {
            <section aria-labelledby="{{ g.id }}">
              <h2 class="g1-section-title" [id]="g.id">{{ g.title }}<small>{{ g.sub }}, {{ g.cards.length }}</small></h2>
              <div class="g1-cards">
                @for (c of g.cards; track c.demon.id) {
                  <a class="g1-card" [routerLink]="nav.link('demons', c.demon.id)">
                    <span class="g1-card__kana" lang="ja">{{ c.demon.jp }}</span>
                    <span class="g1-card__name">{{ c.demon.name }}</span>
                    <span class="g1-card__meta">{{ race(c.demon.race) }}, Lv {{ level(c.demon) }}</span>
                    <span class="g1-card__recipe">
                      @if (c.text) { {{ c.text }} } @else {
                        @for (p of c.parts; track p.id; let last = $last) { {{ p.name }}@if (!last) { <span class="g1-op"> ＋ </span> } }
                      }
                    </span>
                  </a>
                }
              </div>
            </section>
          }
        }

        <section aria-labelledby="nf-t">
          <h2 class="g1-section-title" id="nf-t">Can't be fused<small>recruit them, or meet them as enemies</small></h2>
          <ul class="g1-list g1-list--columns">
            @for (d of unfusable(); track d.id) {
              <li><a [routerLink]="nav.link('demons', d.id)">{{ d.name }}</a><span class="g1-dim">{{ race(d.race) }}, Lv {{ level(d) }}, {{ d.kind === 'enemy' ? 'enemy only' : 'recruit only' }}</span></li>
            }
          </ul>
        </section>
        <p class="g1-foot">Recipes from upstream's SMT1 special-recipes.json. Recruit-only and enemy-only follow upstream's SMT1 module: Messian and Gaean demons are recruited, Machines are met as enemies.</p>
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
})
export class Smt1Specials {
  protected readonly data = inject(Smt1DataService);
  protected readonly nav = inject(GameRouteContext);
  protected readonly race = raceLabel;
  protected readonly level = displayLevel;
  protected readonly filter = signal<Filter>('all');

  protected readonly groups = computed(() => {
    const d = this.data.data();
    if (!d) return [];
    const byId = this.data.demonsById();
    const isElement = (id: string): boolean => d.elementChart.elementIds.includes(id);
    const card = (r: SpecialRecipe): Card => ({ demon: byId.get(r.resultId)!, parts: r.ingredientIds.map((id) => byId.get(id)!), text: null });
    const recipes = d.specialRecipes.recipes;
    const named = recipes.filter((r) => !r.ingredientIds.every(isElement));
    const elems = recipes.filter((r) => r.ingredientIds.every(isElement));
    return [
      { id: 'sp-named', filter: 'named' as Filter, title: 'Named parents', sub: 'particular demons, always this result', cards: named.map(card) },
      { id: 'sp-pairs', filter: 'elements' as Filter, title: 'Element pairs', sub: 'two elements fused together', cards: elems.filter((r) => r.ingredientIds.length === 2).map(card) },
      { id: 'sp-trios', filter: 'elements' as Filter, title: 'Element trios', sub: 'three elements fused together', cards: elems.filter((r) => r.ingredientIds.length === 3).map(card) },
      {
        id: 'sp-cond',
        filter: 'named' as Filter,
        title: 'With a condition',
        sub: 'made under a rule, not from named parents',
        cards: d.specialRecipes.prereqs.map((p) => ({ demon: byId.get(p.resultId)!, parts: [], text: p.text })),
      },
    ];
  });

  protected readonly unfusable = computed(() => (this.data.data()?.demons ?? []).filter((d) => d.kind !== 'normal').sort((a, b) => a.level - b.level));
}
