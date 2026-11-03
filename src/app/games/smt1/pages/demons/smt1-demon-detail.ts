import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { MAX_NOTE_LENGTH } from '../../compendium/smt1-compendium-io';
import { Smt1CompendiumStore } from '../../compendium/smt1-compendium.store';
import { Smt1DataService } from '../../data/smt1-data.service';
import type { Recipe } from '../../fusion';
import type { Demon } from '../../model';
import { displayLevel } from '../../model';
import { alignmentLabel, COMBAT_COLUMNS, KIND_LABEL, PATH_LABEL, raceLabel, speciesLabel, STAT_COLUMNS } from '../../ui/smt1-format';
import { Smt1ResistStrip } from '../../ui/smt1-resist-strip';
import { Smt1SkillRows } from '../../ui/smt1-skill-rows';
import { Smt1FusionStore } from '../fusion/smt1-fusion.store';

const RECIPES_SHOWN = 12;
const MAKES_SHOWN = 24;

/**
 * One demon as a full guide entry: the big data box (katakana down a spot-blue
 * column, stats, resistances, skills, combat values), then how to make it, what
 * it makes, and the rest of its race with previous / next links.
 */
@Component({
  selector: 'app-smt1-demon-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState, Smt1ResistStrip, Smt1SkillRows],
  template: `
    @if (data.ready()) {
      @if (demon(); as d) {
        <div class="g1-page">
          <div class="g1-runhead">
            <div>
              <h1><span class="g1-runhead__jp g1-plate" lang="ja">悪魔データ</span>{{ d.name }}</h1>
              <p><a [routerLink]="nav.link('demons')">All demons</a></p>
            </div>
            <button type="button" class="g1-btn" [class.g1-btn--spot]="owned()" [attr.aria-pressed]="owned()" (click)="compendium.setOwned(d.id, !owned())">
              {{ owned() ? 'In your compendium' : 'Add to compendium' }}
            </button>
          </div>
          @if (owned()) {
            <label class="g1-field g1-field--note">
              <span>Note</span>
              <input type="text" [attr.maxlength]="maxNote" placeholder="Where you got it, what it's for" [value]="compendium.entryFor(d.id)?.note ?? ''" (change)="compendium.setNote(d.id, $any($event.target).value)" />
            </label>
          }

          <article class="g1-entry" aria-labelledby="d-name">
            <span class="g1-entry__kana g1-plate" lang="ja" aria-hidden="true">{{ d.jp }}</span>
            <div class="g1-entry__main">
              <div class="g1-entry__top">
                <h2 class="g1-entry__name" id="d-name">{{ d.name }}</h2>
                <dl class="g1-facts">
                  <div><dt>Race</dt><dd>{{ race(d.race) }}</dd></div>
                  <div><dt>Species</dt><dd>{{ speciesOfDemon() }}</dd></div>
                  <div><dt>Level</dt><dd>{{ level(d) }}</dd></div>
                  <div><dt>Alignment</dt><dd>{{ align(d) }}</dd></div>
                  <div><dt>Drops</dt><dd>{{ d.drop ?? '–' }}</dd></div>
                  <div><dt>Obtained</dt><dd>{{ kind[d.kind] }}</dd></div>
                </dl>
              </div>
              <h3 class="g1-plate">Stats</h3>
              <table class="g1-stats">
                <thead><tr>@for (c of stats; track c.key) { <th scope="col">{{ c.label }}</th> }</tr></thead>
                <tbody><tr>@for (c of stats; track c.key) { <td>{{ d.stats[c.key] }}</td> }</tr></tbody>
              </table>
              <h3 class="g1-plate">Resistances</h3>
              <div class="g1-aff-scroll"><app-smt1-resist-strip [affinities]="d.affinities" /></div>
              <p class="g1-legend">Numbers are the share of damage taken. Wk weak (black); Nu null, Rp repel, Dr drain (blue).</p>
              <div class="g1-entry__grid">
                <div><h3 class="g1-plate">Skills</h3><app-smt1-skill-rows [skillIds]="d.skillIds" /></div>
                <div>
                  <h3 class="g1-plate">Combat</h3>
                  <table class="g1-stats">
                    <thead><tr>@for (c of combat; track c.key) { <th scope="col">{{ c.label }}</th> }</tr></thead>
                    <tbody><tr>@for (c of combat; track c.key) { <td>{{ d.combat[c.key] }}</td> }</tr></tbody>
                  </table>
                </div>
              </div>
            </div>
          </article>

          <div class="g1-makes">
            <section aria-labelledby="mk-t">
              <h2 class="g1-section-title" id="mk-t">How to make it<small>{{ recipes().length }} {{ recipes().length === 1 ? 'pair' : 'pairs' }}</small></h2>
              @if (d.kind !== 'normal') {
                <p class="g1-empty">{{ d.name }} can't be fused. {{ d.kind === 'enemy' ? 'It only appears as an enemy.' : 'Recruit it instead.' }}</p>
              } @else {
                @if (special(); as s) {
                  <aside class="g1-point g1-halftone">
                    <span class="g1-point__mark g1-plate" lang="ja" aria-hidden="true">特殊</span>
                    <p><b>Special recipe.</b>
                      @for (id of s; track id; let last = $last) { <a [routerLink]="nav.link('demons', id)">{{ store.demonName(id) }}</a>@if (!last) { <span class="g1-op"> ＋ </span> } }
                      always make {{ d.name }}, whatever the race chart says.</p>
                  </aside>
                }
                @if (d.prereq) { <p class="g1-meta">Condition: {{ d.prereq }}.</p> }
                @if (recipes().length) {
                  <ul class="g1-list">
                    @for (r of recipes().slice(0, recipesShown()); track r.ingredientIds.join()) {
                      <li>
                        <span>@for (id of r.ingredientIds; track id; let last = $last) { <a [routerLink]="nav.link('demons', id)" [class.g1-owned]="compendium.has(id)">{{ store.demonName(id) }}</a>@if (!last) { <span class="g1-op"> ＋ </span> } }</span>
                        <span class="g1-dim">{{ pathLabel[r.path] }}</span>
                      </li>
                    }
                  </ul>
                  @if (recipes().length > recipesShown()) {
                    <button type="button" class="g1-btn g1-btn--small" (click)="recipesShown.set(recipes().length)">Show all {{ recipes().length }}</button>
                  }
                }
                <p class="g1-legend"><a [routerLink]="nav.link('fusion', 'calculator')" [queryParams]="{ target: d.id }">Open in the calculator</a> for triple fusions too, or <a [routerLink]="nav.link('fusion', 'route')">find a route</a>.</p>
              }
            </section>

            <section aria-labelledby="mt-t">
              <h2 class="g1-section-title" id="mt-t">{{ race(d.race) }}<small>the whole race, {{ mates().length }}</small></h2>
              <ul class="g1-mates">
                @for (m of mates(); track m.id) {
                  <li [class.is-here]="m.id === d.id"><a [routerLink]="nav.link('demons', m.id)" [attr.aria-current]="m.id === d.id ? 'page' : null">{{ m.name }}</a><span>Lv {{ level(m) }}</span></li>
                }
              </ul>
            </section>
          </div>

          <section aria-labelledby="fo-t">
            <h2 class="g1-section-title" id="fo-t">What it makes<small>with one partner, {{ makes().length }}</small></h2>
            <ul class="g1-list g1-list--columns">
              @for (f of makes().slice(0, makesShown()); track f.partnerId) {
                <li><span>＋ <a [routerLink]="nav.link('demons', f.partnerId)">{{ store.demonName(f.partnerId) }}</a></span><span>＝ <a class="g1-strong" [routerLink]="nav.link('demons', f.resultId)">{{ store.demonName(f.resultId) }}</a></span></li>
              }
            </ul>
            @if (makes().length > makesShown()) {
              <button type="button" class="g1-btn g1-btn--small" (click)="makesShown.set(makes().length)">Show all {{ makes().length }}</button>
            }
          </section>

          <nav class="g1-turn" aria-label="Previous and next in this race">
            @if (neighbours().prev; as p) { <a [routerLink]="nav.link('demons', p.id)">← Previous <b>{{ p.name }}</b></a> } @else { <span></span> }
            @if (neighbours().next; as n) { <a [routerLink]="nav.link('demons', n.id)">Next <b>{{ n.name }}</b> →</a> }
          </nav>
          <p class="g1-foot">From upstream's SMT1 tables (SNES-era, believed unchanged on PS1). Upstream's combat values are shown under its own labels.</p>
        </div>
      } @else {
        <p class="g1-empty">No demon called “{{ id() }}”. <a [routerLink]="nav.link('demons')">Back to the list</a>.</p>
      }
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
})
export class Smt1DemonDetail {
  protected readonly data = inject(Smt1DataService);
  protected readonly store = inject(Smt1FusionStore);
  protected readonly compendium = inject(Smt1CompendiumStore);
  protected readonly nav = inject(GameRouteContext);

  protected readonly race = raceLabel;
  protected readonly level = displayLevel;
  protected readonly align = (d: Demon): string => alignmentLabel(d.alignment);
  protected readonly stats = STAT_COLUMNS;
  protected readonly combat = COMBAT_COLUMNS;
  protected readonly kind = KIND_LABEL;
  protected readonly pathLabel = PATH_LABEL;
  protected readonly maxNote = MAX_NOTE_LENGTH;
  protected readonly recipesShown = signal(RECIPES_SHOWN);
  protected readonly makesShown = signal(MAKES_SHOWN);

  protected readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });
  protected readonly demon = computed(() => this.data.demonsById().get(this.id()) ?? null);
  protected readonly owned = computed(() => this.compendium.ownedIds().has(this.id()));

  protected readonly speciesOfDemon = computed(() => {
    const d = this.demon();
    const sp = d ? this.data.racesById().get(d.race)?.species : undefined;
    return sp ? speciesLabel(sp) : '–';
  });

  protected readonly special = computed(() => (this.demon() ? (this.store.engine()?.specialRecipeFor(this.demon()!.id) ?? null) : null));

  protected readonly recipes = computed<Recipe[]>(() => {
    const d = this.demon();
    return d ? this.store.rankRecipes(this.store.pairRecipesFor(d.id).filter((r) => r.path !== 'special')) : [];
  });

  protected readonly makes = computed(() => {
    const d = this.demon();
    const engine = this.store.engine();
    if (!d || !engine) return [];
    return engine.fusionsOf(d.id, this.store.ctx()).map((f) => ({ partnerId: f.partnerId, resultId: f.outcome.resultId }));
  });

  protected readonly mates = computed(() => {
    const d = this.demon();
    return d ? (this.data.data()?.demons ?? []).filter((m) => m.race === d.race).sort((a, b) => a.level - b.level) : [];
  });

  protected readonly neighbours = computed(() => {
    const list = this.mates();
    const i = list.findIndex((m) => m.id === this.id());
    return { prev: list[i - 1] ?? null, next: list[i + 1] ?? null };
  });
}
