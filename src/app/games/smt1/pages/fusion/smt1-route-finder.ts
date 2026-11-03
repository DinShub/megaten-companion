import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { PersonaPicker } from '../../../../shared/persona-picker/persona-picker';
import { Smt1DataService } from '../../data/smt1-data.service';
import { displayLevel } from '../../model';
import { findRoutes, flattenSteps, MAX_DEPTH, type Objective, type PoolMode, type RouteSearchResult } from '../../routing/smt1-route-finder';
import { Smt1FusionStore } from './smt1-fusion.store';

const OBJECTIVES: readonly { readonly id: Objective; readonly label: string }[] = [
  { id: 'fewest-steps', label: 'Fewest fusions' },
  { id: 'fewest-unowned', label: 'Fewest to get' },
  { id: 'cheapest', label: 'Cheapest' },
];

/**
 * Route finder: pick a target, and the guide lists the fusion chains that reach
 * it from the demons you own (or from anything at your hero level). Each route
 * prints as numbered steps, made in order. Pair fusions only — see the route
 * finder's header.
 */
@Component({
  selector: 'app-smt1-route-finder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState, PersonaPicker],
  template: `
    @if (data.ready()) {
      <div class="g1-page">
        <div class="g1-runhead">
          <div>
            <h1><span class="g1-runhead__jp g1-plate" lang="ja">合体経路</span>Route finder</h1>
            <p>Pick a demon you want. The guide finds the fusions that get you there.</p>
          </div>
        </div>

        <div class="g1-spread g1-spread--narrow">
          <div class="g1-col">
            <section class="g1-box" aria-labelledby="rf-target">
              <div class="g1-box__bar g1-plate"><h2 id="rf-target">Target</h2></div>
              <div class="g1-box__data">
                @if (target(); as t) {
                  <div class="g1-slot">
                    <h3 class="g1-box__name"><a [routerLink]="nav.link('demons', t.id)">{{ t.name }}</a></h3>
                    <button type="button" class="g1-btn g1-btn--small" (click)="targetId.set(null)" aria-label="Change target">Change</button>
                  </div>
                  <p class="g1-meta">Lv {{ level(t) }}</p>
                } @else {
                  <app-persona-picker [options]="store.pickerOptions()" [compendiumOnly]="false" placeholder="Which demon do you want?" (picked)="targetId.set($event.id)" />
                }
              </div>
            </section>

            <section class="g1-box" aria-labelledby="rf-opts">
              <div class="g1-box__bar g1-plate"><h2 id="rf-opts">Search</h2></div>
              <div class="g1-box__data g1-form">
                <p class="g1-label">Start from</p>
                <div class="g1-seg" role="group" aria-label="Start from">
                  <button type="button" [attr.aria-pressed]="pool() === 'compendium'" (click)="pool.set('compendium')">My compendium</button>
                  <button type="button" [attr.aria-pressed]="pool() === 'anything'" (click)="pool.set('anything')">Anything at my level</button>
                </div>
                <p class="g1-label">Rank by</p>
                <div class="g1-seg" role="group" aria-label="Rank by">
                  @for (o of objectives; track o.id) {
                    <button type="button" [attr.aria-pressed]="objective() === o.id" (click)="objective.set(o.id)">{{ o.label }}</button>
                  }
                </div>
                <label class="g1-field">
                  <span>Fusions deep</span>
                  <select [value]="depth()" (change)="depth.set(+$any($event.target).value)">
                    @for (n of depths; track n) { <option [value]="n" [selected]="n === depth()">{{ n }}</option> }
                  </select>
                </label>
                <button type="button" class="g1-btn g1-btn--spot" [disabled]="!target()" (click)="run()">Find routes</button>
                <p class="g1-legend">Pair fusions only. You own {{ store.owned().size }} demons; hero level {{ store.heroLevel() }}.</p>
              </div>
            </section>
          </div>

          <div class="g1-col g1-col--result" aria-live="polite">
            @if (result(); as res) {
              @if (res.routes.length) {
                <h2 class="g1-section-title">Routes<small>{{ res.routes.length }} found in {{ res.elapsedMs }} ms</small></h2>
                @for (route of res.routes; track $index; let n = $index) {
                  <section class="g1-box g1-route">
                    <div class="g1-box__bar g1-plate">
                      <h3>Route {{ n + 1 }}</h3>
                      <span>{{ route.steps }} {{ route.steps === 1 ? 'fusion' : 'fusions' }}@if (route.unowned) {, {{ route.unowned }} to get}</span>
                    </div>
                    <ol class="g1-steps">
                      @for (step of steps(route.tree); track $index) {
                        <li>
                          @for (id of step.ingredientIds; track id; let last = $last) {
                            <a [routerLink]="nav.link('demons', id)" [class.g1-owned]="store.isOwned(id)">{{ store.demonName(id) }}</a>@if (!last) { <span class="g1-op"> ＋ </span> }
                          }
                          <span class="g1-op"> ＝ </span><a class="g1-strong" [routerLink]="nav.link('demons', step.resultId)">{{ store.demonName(step.resultId) }}</a>
                        </li>
                      }
                    </ol>
                  </section>
                }
              } @else {
                @for (p of res.problems; track p) { <p class="g1-empty">{{ p }}</p> }
              }
            } @else {
              <p class="g1-empty">Pick a target and press Find routes.</p>
            }
          </div>
        </div>
        <p class="g1-foot">Owned demons are underlined in blue. A route never uses one demon twice.</p>
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
})
export class Smt1RouteFinder {
  protected readonly data = inject(Smt1DataService);
  protected readonly store = inject(Smt1FusionStore);
  protected readonly nav = inject(GameRouteContext);

  protected readonly objectives = OBJECTIVES;
  protected readonly depths = Array.from({ length: MAX_DEPTH }, (_, i) => i + 1);
  protected readonly level = displayLevel;
  protected readonly steps = flattenSteps;

  protected readonly targetId = signal<string | null>(null);
  protected readonly pool = signal<PoolMode>('compendium');
  protected readonly objective = signal<Objective>('fewest-steps');
  protected readonly depth = signal(3);
  protected readonly result = signal<RouteSearchResult | null>(null);

  protected readonly target = computed(() => {
    const id = this.targetId();
    return id ? (this.store.demon(id) ?? null) : null;
  });

  protected run(): void {
    const engine = this.store.engine();
    const t = this.target();
    const demons = this.data.data()?.demons;
    if (!engine || !t || !demons) return;
    this.result.set(
      findRoutes(engine, demons, { ...this.store.ctx(), owned: this.store.owned() }, {
        targetId: t.id,
        objective: this.objective(),
        maxDepth: this.depth(),
        pool: this.pool(),
      }),
    );
  }
}
