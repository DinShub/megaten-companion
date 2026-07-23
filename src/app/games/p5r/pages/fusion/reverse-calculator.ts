import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { InheritMask } from '../../../../shared/inherit-mask/inherit-mask';
import { OwnershipBadge } from '../../../../shared/ownership-badge/ownership-badge';
import { PersonaPicker } from '../../../../shared/persona-picker/persona-picker';
import type { FusionPath, Recipe } from '../../fusion';
import type { Persona } from '../../model';
import { titleCase } from '../../ui/format';
import { FusionStore } from './fusion.store';

const PATH_BADGE: Record<FusionPath, string> = {
  'different-arcana': 'Standard',
  'same-arcana': 'Same arcana',
  treasure: 'Treasure',
  advanced: 'Advanced',
};

interface Ingredient {
  readonly id: string;
  readonly name: string;
  readonly arcana: string;
  readonly level: number;
  readonly owned: boolean;
  readonly ownedLevel: number | null;
  readonly cost: number;
}

interface RecipeRow {
  readonly key: string;
  readonly path: FusionPath;
  readonly ingredients: readonly Ingredient[];
  /** Every ingredient is registered — a recipe you can make right now (§4.7.2). */
  readonly canDoNow: boolean;
  /** Total re-summon cost of the ingredients (§6.8), the secondary sort key. */
  readonly totalCost: number;
}

/**
 * Reverse fusion calculator (§4.7.2, task 42). Pick a target and see **every**
 * recipe that makes it — different-arcana, same-arcana and treasure pairings in
 * one list, advanced recipes in their own section — each row showing both
 * parents, their base levels, the re-summon cost and ownership badges. Rows you
 * can make right now (all parents registered) sort first, then by cost.
 *
 * The target picker defaults to the full roster: a reverse lookup is usually for
 * something you want to *build*, not something you already own.
 */
@Component({
  selector: 'app-reverse-calculator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PersonaPicker, OwnershipBadge, InheritMask],
  template: `
    <div class="rev">
      <section class="target-pick">
        <span class="target-pick__label">Target persona</span>
        <app-persona-picker
          [options]="store.pickerOptions()"
          [(compendiumOnly)]="rosterMode"
          placeholder="Search for a persona to make…"
          (picked)="targetId.set($event.id)"
        />
      </section>

      @if (target(); as t) {
        <header class="target">
          <div>
            <h2 class="target__name">
              <a [routerLink]="nav.link('personas', t.id)">{{ t.name }}</a>
              <app-ownership-badge [registered]="isOwned(t.id)" [level]="ownedLevel(t.id)" />
            </h2>
            <div class="target__meta">
              <span class="tag">{{ titleCase(t.arcana) }}</span>
              <span class="tag">Lv {{ t.level }}</span>
              <span class="tag">Cost {{ fmt(cost(t.id)) }}</span>
            </div>
          </div>
          <div class="target__mask">
            <span class="mini">Inherits</span>
            <app-inherit-mask [allowed]="store.inheritMask(t.inheritType)" />
          </div>
        </header>

        @if (levelCapped()) {
          <p class="warn"><i class="pi pi-lock" aria-hidden="true"></i>
            {{ t.name }} is level {{ t.level }} — above your protagonist's {{ store.protagonistLevel() }}.
            <a [routerLink]="nav.link('settings')">Raise it or lift the cap</a>.</p>
        }
        @if (t.kind === 'treasure') {
          <p class="note"><i class="pi pi-map-marker" aria-hidden="true"></i> Treasure demons are recruited, not fused@if (t.prereq) { — {{ t.prereq }} }.</p>
        } @else if (t.kind === 'party') {
          <p class="note">Party personas can't be produced by fusion.</p>
        } @else if (t.kind === 'special') {
          <p class="note"><i class="pi pi-star" aria-hidden="true"></i> Special persona — obtainable only through the advanced recipe below.</p>
        }

        @if (pairRows().length) {
          <section class="group">
            <h3 class="group__title">Standard recipes <span class="group__count">{{ pairRows().length }}</span></h3>
            <ul class="rows">
              @for (row of pairRows(); track row.key) {
                <li class="row" [class.row--ready]="row.canDoNow">
                  <div class="row__ings">
                    @for (ing of row.ingredients; track ing.id; let last = $last) {
                      <a class="ing" [routerLink]="nav.link('personas', ing.id)">
                        <span class="ing__name">{{ ing.name }}</span>
                        <span class="ing__meta">{{ ing.arcana }} · Lv {{ ing.level }}</span>
                        <app-ownership-badge [registered]="ing.owned" [level]="ing.ownedLevel" />
                      </a>
                      @if (!last) { <span class="plus" aria-hidden="true">+</span> }
                    }
                  </div>
                  <div class="row__tail">
                    <span class="badge-path" [attr.data-path]="row.path">{{ pathBadge(row.path) }}</span>
                    <span class="row__cost" title="Total re-summon cost">{{ fmt(row.totalCost) }}</span>
                    @if (row.canDoNow) { <span class="ready"><i class="pi pi-check" aria-hidden="true"></i> Ready</span> }
                  </div>
                </li>
              }
            </ul>
          </section>
        }

        @if (advancedRows().length) {
          <section class="group">
            <h3 class="group__title">Advanced (special) fusion <span class="group__count">{{ advancedRows().length }}</span></h3>
            <ul class="rows">
              @for (row of advancedRows(); track row.key) {
                <li class="row" [class.row--ready]="row.canDoNow">
                  <div class="row__ings">
                    @for (ing of row.ingredients; track ing.id; let last = $last) {
                      <a class="ing" [routerLink]="nav.link('personas', ing.id)">
                        <span class="ing__name">{{ ing.name }}</span>
                        <span class="ing__meta">{{ ing.arcana }} · Lv {{ ing.level }}</span>
                        <app-ownership-badge [registered]="ing.owned" [level]="ing.ownedLevel" />
                      </a>
                      @if (!last) { <span class="plus" aria-hidden="true">+</span> }
                    }
                  </div>
                  <div class="row__tail">
                    <span class="row__cost" title="Total re-summon cost">{{ fmt(row.totalCost) }}</span>
                    @if (row.canDoNow) { <span class="ready"><i class="pi pi-check" aria-hidden="true"></i> Ready</span> }
                  </div>
                </li>
              }
            </ul>
          </section>
        }

        @if (!pairRows().length && !advancedRows().length && !isUnfusable()) {
          <p class="empty">No fusion recipe produces {{ t.name }} with your current unlock settings.</p>
        }
      } @else {
        <p class="prompt">Pick a target to see every recipe that makes it.</p>
      }
    </div>
  `,
  styles: `
    .rev { display: flex; flex-direction: column; gap: 1.1rem; }
    .target-pick { display: flex; flex-direction: column; gap: 0.4rem; max-width: 32rem; }
    .target-pick__label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--p-text-muted-color); }

    .target { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between; align-items: flex-start; padding: 1rem 1.15rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.25)); border-radius: 10px; background: var(--p-surface-800, rgba(127,127,127,0.05)); }
    .target__name { margin: 0 0 0.45rem; font-size: 1.4rem; display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; a { color: var(--p-text-color); text-decoration: none; &:hover { color: var(--p-primary-color); } } }
    .target__meta { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .tag { padding: 0.15rem 0.55rem; border-radius: 999px; background: var(--p-surface-700, rgba(127,127,127,0.18)); font-size: 0.82rem; }
    .target__mask { display: flex; flex-direction: column; gap: 0.3rem; min-width: 12rem; }
    .mini { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--p-text-muted-color); }

    .warn, .note { display: flex; align-items: center; gap: 0.45rem; margin: 0; padding: 0.5rem 0.7rem; border-radius: 6px; font-size: 0.88rem; a { color: var(--p-primary-color); } }
    .warn { background: color-mix(in srgb, #f59e0b 14%, transparent); }
    .note { background: var(--p-surface-700, rgba(127,127,127,0.12)); color: var(--p-text-muted-color); }

    .group__title { display: flex; align-items: center; gap: 0.5rem; margin: 0.3rem 0 0.6rem; font-size: 0.9rem; }
    .group__count { padding: 0.05rem 0.45rem; border-radius: 999px; background: var(--p-surface-700, rgba(127,127,127,0.2)); font-size: 0.75rem; color: var(--p-text-muted-color); }
    .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
    .row { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; justify-content: space-between; padding: 0.55rem 0.75rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.16)); border-radius: 8px; background: var(--p-content-background); }
    .row--ready { border-color: color-mix(in srgb, #22c55e 45%, transparent); background: color-mix(in srgb, #22c55e 6%, transparent); }
    .row__ings { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.6rem; }
    .ing { display: inline-flex; flex-direction: column; gap: 0.05rem; text-decoration: none; color: var(--p-text-color); &:hover .ing__name { color: var(--p-primary-color); } }
    .ing__name { font-weight: 600; }
    .ing__meta { font-size: 0.75rem; color: var(--p-text-muted-color); text-transform: capitalize; }
    .plus { color: var(--p-text-muted-color); }
    .row__tail { display: inline-flex; align-items: center; gap: 0.6rem; }
    .badge-path { padding: 0.1rem 0.5rem; border-radius: 999px; font-size: 0.72rem; background: var(--p-surface-700, rgba(127,127,127,0.2)); color: var(--p-text-muted-color); }
    .badge-path[data-path='treasure'] { color: #fbbf24; background: color-mix(in srgb, #fbbf24 16%, transparent); }
    .badge-path[data-path='same-arcana'] { color: #a78bfa; background: color-mix(in srgb, #a78bfa 16%, transparent); }
    .row__cost { font-variant-numeric: tabular-nums; color: var(--p-text-muted-color); font-size: 0.88rem; }
    .ready { display: inline-flex; align-items: center; gap: 0.25rem; color: #4ade80; font-size: 0.78rem; font-weight: 600; }

    .empty, .prompt { color: var(--p-text-muted-color); padding: 1.25rem 0; text-align: center; }
  `,
})
export class ReverseCalculator {
  protected readonly store = inject(FusionStore);
  protected readonly nav = inject(GameRouteContext);
  protected readonly titleCase = titleCase;

  protected readonly targetId = signal<string | null>(null);
  /** Target picker starts on the full roster — you usually want an unowned goal. */
  protected readonly rosterMode = signal(false);

  protected readonly target = computed<Persona | undefined>(() => {
    const id = this.targetId();
    return id ? this.store.persona(id) : undefined;
  });

  protected readonly levelCapped = computed<boolean>(() => {
    const t = this.target();
    return !!t && this.store.enforceLevelCap() && t.level > this.store.protagonistLevel();
  });

  protected readonly isUnfusable = computed<boolean>(() => {
    const kind = this.target()?.kind;
    return kind === 'treasure' || kind === 'party';
  });

  /** Memoised in the engine per (target, unlock signature); cheap to re-read. */
  private readonly rawRecipes = computed<readonly Recipe[]>(() => {
    const engine = this.store.engine();
    const id = this.targetId();
    if (!engine || !id) return [];
    return engine.recipesFor(id, this.store.ctx());
  });

  protected readonly pairRows = computed<RecipeRow[]>(() =>
    this.buildRows(this.rawRecipes().filter((r) => r.path !== 'advanced')),
  );

  protected readonly advancedRows = computed<RecipeRow[]>(() =>
    this.buildRows(this.rawRecipes().filter((r) => r.path === 'advanced')),
  );

  private buildRows(recipes: readonly Recipe[]): RecipeRow[] {
    const engine = this.store.engine();
    const owned = this.store.ownedEntries();
    if (!engine) return [];
    const rows = recipes.map((recipe): RecipeRow => {
      const ingredients = recipe.ingredientIds.map((id): Ingredient => {
        const p = this.store.persona(id);
        const entry = owned.get(id);
        return {
          id,
          name: p?.name ?? id,
          arcana: p ? titleCase(p.arcana) : '',
          level: p?.level ?? 0,
          owned: entry != null,
          ownedLevel: entry?.level ?? null,
          cost: engine.summonCost(id),
        };
      });
      const totalCost = ingredients.reduce((sum, ing) => sum + (Number.isNaN(ing.cost) ? 0 : ing.cost), 0);
      return {
        key: `${recipe.path}:${[...recipe.ingredientIds].join('+')}`,
        path: recipe.path,
        ingredients,
        canDoNow: ingredients.every((ing) => ing.owned),
        totalCost,
      };
    });
    // "Recipes I can do right now" first, then cheapest (§4.7.2).
    return rows.sort(
      (a, b) =>
        Number(b.canDoNow) - Number(a.canDoNow) ||
        a.totalCost - b.totalCost ||
        a.key.localeCompare(b.key),
    );
  }

  protected isOwned(id: string): boolean {
    return this.store.ownedEntries().has(id);
  }

  protected ownedLevel(id: string): number | null {
    return this.store.ownedEntries().get(id)?.level ?? null;
  }

  protected cost(id: string): number {
    const c = this.store.engine()?.summonCost(id) ?? Number.NaN;
    return Number.isNaN(c) ? 0 : c;
  }

  /** Group a yen figure without the @angular/common DecimalPipe, which would drag
   * the number-formatting locale plumbing into the eager `main` chunk (§9.3). */
  protected fmt(n: number): string {
    return n.toLocaleString('en-US');
  }

  protected pathBadge(path: FusionPath): string {
    return PATH_BADGE[path];
  }
}
