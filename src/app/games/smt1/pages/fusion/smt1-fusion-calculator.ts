import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { PersonaPicker } from '../../../../shared/persona-picker/persona-picker';
import { Smt1DataService } from '../../data/smt1-data.service';
import type { FusionOutcome, FusionSuccess, Recipe } from '../../fusion';
import type { ChartResult, Demon, DemonId } from '../../model';
import { displayLevel } from '../../model';
import { PATH_LABEL, raceLabel, speciesLabel } from '../../ui/smt1-format';
import { Smt1DemonBox } from '../../ui/smt1-demon-box';
import { Smt1FusionStore } from './smt1-fusion.store';

type Mode = 'pair' | 'triple' | 'reverse';

const PAGE = 40;

/**
 * The SMT1 fusion calculator, printed as a guide page: the recipe as one line
 * with katakana over each name, data boxes for the parents and the result, and
 * a point box that explains which rule made it. **Pair** and **triple** fuse
 * forward; **reverse** lists every pair (and, on request, every trio) that makes
 * a target. `?a=&b=&c=` deep-link the parents, `?target=` a reverse lookup.
 */
@Component({
  selector: 'app-smt1-fusion-calculator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState, PersonaPicker, Smt1DemonBox],
  template: `
    @if (data.ready()) {
      <div class="g1-page">
        <div class="g1-runhead">
          <div>
            <h1><span class="g1-runhead__jp g1-plate" lang="ja">悪魔合体</span>Demon fusion</h1>
            <p>{{ mode() === 'reverse' ? 'Pick a demon to see every way to make it.' : 'Choose the demons to fuse. The guide shows what they make, and why.' }}</p>
          </div>
          <div class="g1-seg" role="group" aria-label="Fusion mode">
            <button type="button" [attr.aria-pressed]="mode() === 'pair'" (click)="setMode('pair')">Pair</button>
            <button type="button" [attr.aria-pressed]="mode() === 'triple'" (click)="setMode('triple')">Triple</button>
            <button type="button" [attr.aria-pressed]="mode() === 'reverse'" (click)="setMode('reverse')">Reverse</button>
          </div>
        </div>

        @if (mode() !== 'reverse') {
          <p class="g1-formula" aria-live="polite">
            @for (id of slots(); track $index; let i = $index; let last = $last) {
              @if (id && store.demon(id); as d) {
                <ruby>{{ d.name }}<rt lang="ja">{{ d.jp }}</rt></ruby>
              } @else {
                <span class="g1-formula__empty">…</span>
              }
              @if (!last) { <span class="g1-formula__op g1-plate" aria-label="plus">＋</span> }
            }
            <span class="g1-formula__op g1-plate" aria-label="makes">＝</span>
            @if (result(); as r) {
              <ruby class="g1-formula__result g1-plate">{{ r.name }}<rt lang="ja">{{ r.jp }}</rt></ruby>
            } @else {
              <span class="g1-formula__empty">？</span>
            }
          </p>

          <div class="g1-spread">
            <div class="g1-col">
              @for (id of slots(); track $index; let i = $index) {
                @if (id && store.demon(id); as d) {
                  <app-smt1-demon-box [demon]="d" [role]="'Parent ' + (i + 1)">
                    <div class="g1-slot">
                      <h3 class="g1-box__name"><a [routerLink]="nav.link('demons', d.id)">{{ d.name }}</a></h3>
                      @if (store.isOwned(d.id)) { <span class="g1-tag">Owned</span> }
                      <button type="button" class="g1-btn g1-btn--small" (click)="setSlot(i, null)" [attr.aria-label]="'Clear parent ' + (i + 1)">Clear</button>
                    </div>
                  </app-smt1-demon-box>
                } @else {
                  <section class="g1-box g1-box--empty" [attr.aria-label]="'Parent ' + (i + 1)">
                    <div class="g1-box__bar g1-plate"><h2>Parent {{ i + 1 }}</h2></div>
                    <div class="g1-box__data">
                      <app-persona-picker [options]="store.pickerOptions()" [compendiumOnly]="false" placeholder="Write in a demon…" (picked)="setSlot(i, $event.id)" />
                    </div>
                  </section>
                }
              }
            </div>

            <div class="g1-col g1-col--result">
              @if (result(); as r) {
                <app-smt1-demon-box [demon]="r" role="Result" [full]="true" />
                @if (success(); as o) {
                  @if (o.blockedByLevel) {
                    <p class="g1-warn">{{ r.name }} is level {{ level(r) }}, above your hero (Lv {{ store.heroLevel() }}). <a [routerLink]="nav.link('settings')">Raise the hero level or lift the cap.</a></p>
                  }
                  <aside class="g1-point g1-halftone" aria-label="How this result is made">
                    <span class="g1-point__mark g1-plate" lang="ja" aria-hidden="true">{{ o.path === 'special' ? '特殊' : '解説' }}</span>
                    <p><b>{{ pathLabel[o.path] }}.</b> {{ explain(o, r) }}</p>
                    @if (o.chartSays; as cell) { <p class="g1-dim">On the race chart alone, these would give {{ cellLabel(cell) }}.</p> }
                  </aside>
                }
              } @else if (outcome(); as o) {
                @if (!o.ok) { <p class="g1-empty" role="status">{{ o.message }}</p> }
              } @else {
                <p class="g1-empty">Write a demon in each slot and the result prints here.</p>
              }
            </div>
          </div>
        } @else {
          <div class="g1-spread">
            <div class="g1-col">
              @if (target(); as t) {
                <app-smt1-demon-box [demon]="t" role="Target" [full]="true">
                  <div class="g1-slot">
                    <h3 class="g1-box__name"><a [routerLink]="nav.link('demons', t.id)">{{ t.name }}</a></h3>
                    <button type="button" class="g1-btn g1-btn--small" (click)="targetId.set(null)" aria-label="Change target">Change</button>
                  </div>
                </app-smt1-demon-box>
              } @else {
                <section class="g1-box g1-box--empty" aria-label="Target">
                  <div class="g1-box__bar g1-plate"><h2>Target</h2></div>
                  <div class="g1-box__data">
                    <app-persona-picker [options]="store.pickerOptions()" [compendiumOnly]="false" placeholder="Which demon do you want?" (picked)="targetId.set($event.id)" />
                  </div>
                </section>
              }
            </div>
            <div class="g1-col g1-col--result">
              @if (target(); as t) {
                <div class="g1-toolbar">
                  <h2 class="g1-section-title">Recipes<small>{{ recipes().length }} {{ withTriples() ? 'pairs and trios' : 'pairs' }}</small></h2>
                  <label class="g1-check"><span class="g1-tick"><input type="checkbox" [checked]="withTriples()" (change)="withTriples.set($any($event.target).checked)" /><i></i><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 10.5 8 15 17 3.5" /></svg></span> Include triple fusions</label>
                </div>
                @if (t.kind !== 'normal') {
                  <p class="g1-empty">{{ t.name }} can't be fused. {{ t.kind === 'enemy' ? 'It only appears as an enemy.' : 'Recruit it instead.' }}</p>
                } @else if (!recipes().length) {
                  <p class="g1-empty">Nothing makes {{ t.name }} with these settings.</p>
                } @else {
                  <div class="g1-tbl-scroll">
                    <table class="g1-tbl">
                      <thead><tr><th scope="col">Ingredients</th><th scope="col">Rule</th><th scope="col">Owned</th></tr></thead>
                      <tbody>
                        @for (r of shown(); track r.ingredientIds.join()) {
                          <tr>
                            <td>
                              @for (id of r.ingredientIds; track id; let last = $last) {
                                <a class="g1-strong" [routerLink]="nav.link('demons', id)">{{ store.demonName(id) }}</a><span class="g1-dim"> Lv {{ levelOf(id) }}</span>@if (!last) { <span class="g1-op"> ＋ </span> }
                              }
                            </td>
                            <td class="g1-dim">{{ pathLabel[r.path] }}</td>
                            <td class="g1-num">{{ ownedCount(r) }}/{{ r.ingredientIds.length }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  @if (recipes().length > shown().length) {
                    <button type="button" class="g1-btn" (click)="limit.set(limit() + 200)">Show more ({{ recipes().length - shown().length }} left)</button>
                  }
                }
              }
            </div>
          </div>
        }
        <p class="g1-foot">Rules from upstream's SMT1 calculators; data from its SMT1 tables (SNES-era, believed unchanged on PS1).</p>
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
})
export class Smt1FusionCalculator {
  protected readonly data = inject(Smt1DataService);
  protected readonly store = inject(Smt1FusionStore);
  protected readonly nav = inject(GameRouteContext);

  protected readonly pathLabel = PATH_LABEL;
  protected readonly level = displayLevel;

  protected readonly mode = signal<Mode>('pair');
  private readonly ids = signal<(DemonId | null)[]>([null, null, null]);
  protected readonly targetId = signal<DemonId | null>(null);
  protected readonly withTriples = signal(false);
  protected readonly limit = signal(PAGE);

  constructor() {
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    const [a, b, c, target] = ['a', 'b', 'c', 'target'].map((k) => q.get(k));
    if (target) {
      this.targetId.set(target);
      this.mode.set('reverse');
    } else if (a || b || c) {
      this.ids.set([a, b, c]);
      if (c) this.mode.set('triple');
    } else {
      this.ids.set(['barong', 'rangda', null]);
    }
  }

  protected readonly slots = computed(() => (this.mode() === 'triple' ? this.ids() : this.ids().slice(0, 2)));

  protected readonly outcome = computed<FusionOutcome | null>(() => {
    const engine = this.store.engine();
    const ids = this.slots();
    if (!engine || ids.some((id) => !id)) return null;
    return engine.fuseAny(ids as DemonId[], this.store.ctx());
  });

  protected readonly success = computed<FusionSuccess | null>(() => {
    const o = this.outcome();
    return o?.ok ? o : null;
  });

  protected readonly result = computed<Demon | null>(() => {
    const o = this.success();
    return o ? (this.store.demon(o.resultId) ?? null) : null;
  });

  protected readonly target = computed(() => {
    const id = this.targetId();
    return id ? (this.store.demon(id) ?? null) : null;
  });

  protected readonly recipes = computed<Recipe[]>(() => {
    const t = this.target();
    if (!t) return [];
    const pairs = this.store.pairRecipesFor(t.id);
    const trios = this.withTriples() ? this.store.tripleRecipesFor(t.id).filter((r) => r.path !== 'special' || !pairs.some((p) => p.path === 'special')) : [];
    return this.store.rankRecipes([...pairs, ...trios]);
  });

  protected readonly shown = computed(() => this.recipes().slice(0, this.limit()));

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.limit.set(PAGE);
  }

  protected setSlot(i: number, id: DemonId | null): void {
    this.ids.update((list) => list.map((x, j) => (j === i ? id : x)));
  }

  protected levelOf(id: DemonId): number {
    const d = this.store.demon(id);
    return d ? displayLevel(d) : 0;
  }

  protected ownedCount(r: Recipe): number {
    return r.ingredientIds.filter((id) => this.store.isOwned(id)).length;
  }

  protected cellLabel(cell: ChartResult): string {
    if (cell.kind === 'race') return `a ${raceLabel(cell.id)}`;
    if (cell.kind === 'species') return `any ${speciesLabel(cell.id)}`;
    return this.store.demonName(cell.id);
  }

  /** One plain sentence on how the rule produced this result. */
  protected explain(o: FusionSuccess, r: Demon): string {
    const ds = this.slots().map((id) => (id ? this.store.demon(id) : undefined)).filter((d): d is Demon => !!d);
    const names = ds.map((d) => d.name).join(' and ');
    const bump = o.bumped ? ' That was one of the ingredients, so the next one up is taken.' : '';
    const clamp = o.clampedToCeiling ? ` The target is above the top of the race, so it stops at ${r.name}.` : '';
    switch (o.path) {
      case 'special':
        return `${names} always make ${r.name}.`;
      case 'normal':
      case 'species': {
        const [a, b] = ds;
        const pool = o.path === 'normal' ? raceLabel(r.race) : 'demon of that species';
        return `${raceLabel(a.race)} × ${raceLabel(b.race)} on the chart gives ${o.path === 'normal' ? `a ${pool}` : `any ${pool}`}. Their levels average to a target of Lv ${o.targetLevel}; the first ${pool} at or above it is ${r.name}.${bump}${clamp}`;
      }
      case 'element': {
        const partner = ds.find((d) => d.race !== 'element') ?? ds[0];
        return `The element moves ${partner.name} within the ${raceLabel(partner.race)} race, to ${r.name}.`;
      }
      case 'dark': {
        const sum = ds.reduce((n, d) => n + d.level, 0);
        const rule = sum % 7 === 0 ? 'a multiple of 7, so two ranks up' : sum % 5 === 0 ? 'a multiple of 5, so one rank up' : 'a multiple of 3, so one rank down';
        return `One of them is a dark demon. Their levels add up to ${sum}, ${rule} the other's race: ${r.name}.`;
      }
      case 'same-race':
        return `Two ${raceLabel(ds[0].race)} demons make this element.`;
      case 'triple': {
        const top = [...ds].sort((x, y) => y.level - x.level)[0];
        return `${top.name} is highest, so its species picks the column and the other two pick the row of the triple chart. The target is Lv ${Math.ceil((o.targetLevel ?? 0) * 10) / 10}; the first ${raceLabel(r.race)} at or above it is ${r.name}.${bump}`;
      }
    }
  }
}
