import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { Smt1CompendiumStore } from '../../compendium/smt1-compendium.store';
import { Smt1DataService } from '../../data/smt1-data.service';
import type { Demon, RaceId, SpeciesId } from '../../model';
import { displayLevel } from '../../model';
import { RACE_ORDER } from '../../model/ids';
import { alignmentLabel, raceLabel, speciesLabel } from '../../ui/smt1-format';
import { Smt1ResistHead, Smt1ResistStrip } from '../../ui/smt1-resist-strip';

/** Every demon, by race, with species chips and a search box. A row opens the demon's entry. */
@Component({
  selector: 'app-smt1-demon-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState, Smt1ResistStrip, Smt1ResistHead],
  template: `
    @if (data.data(); as d) {
      <div class="g1-page">
        <div class="g1-runhead">
          <div>
            <h1><span class="g1-runhead__jp g1-plate" lang="ja">悪魔一覧</span>Demons</h1>
            <p>Every demon, by race. Pick one to open its entry.</p>
          </div>
        </div>

        <ul class="g1-chips" aria-label="Species">
          <li><button type="button" class="g1-chip" [attr.aria-pressed]="species() === null" (click)="species.set(null)">All<small>{{ d.demons.length }}</small></button></li>
          @for (s of d.races.species; track s.id) {
            <li><button type="button" class="g1-chip" [attr.aria-pressed]="species() === s.id" (click)="species.set(s.id)">{{ speciesName(s.id) }}<small>{{ countIn(s.raceIds) }}</small></button></li>
          }
        </ul>
        <div class="g1-toolbar">
          <label class="g1-field">
            <span>Search</span>
            <input type="search" placeholder="Name, katakana, race or alignment" [value]="query()" (input)="query.set($any($event.target).value)" />
          </label>
          <p class="g1-count" aria-live="polite"><b>{{ shownCount() }}</b> of {{ d.demons.length }}</p>
        </div>

        <div class="g1-tbl-scroll">
          <table class="g1-tbl g1-tbl--demons">
            <thead><tr><th scope="col">Lv</th><th scope="col">Name</th><th scope="col">Katakana</th><th scope="col">Race</th><th scope="col">Alignment</th><th scope="col"><app-smt1-resist-head /></th></tr></thead>
            <tbody>
              @for (g of groups(); track g.race) {
                <tr class="group"><td colspan="6">{{ race(g.race) }}<small>{{ speciesName(g.species) }}, {{ g.total }}</small></td></tr>
                @for (m of g.demons; track m.id) {
                  <tr tabindex="0" (click)="open(m)" (keydown.enter)="open(m)">
                    <td class="g1-num">{{ level(m) }}</td>
                    <td class="g1-strong"><a [routerLink]="nav.link('demons', m.id)" tabindex="-1">{{ m.name }}</a>
                      @if (specials().has(m.id)) { <span class="g1-tag">Special</span> }
                      @if (store.has(m.id)) { <span class="g1-tag g1-tag--ink">Owned</span> }
                    </td>
                    <td class="g1-jp" lang="ja">{{ m.jp }}</td>
                    <td class="g1-dim">{{ race(m.race) }}</td>
                    <td class="g1-dim">{{ align(m) }}</td>
                    <td><app-smt1-resist-strip [affinities]="m.affinities" [withHead]="false" [label]="m.name + ' resistances'" /></td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
        <p class="g1-foot">252 demons from upstream's SMT1 demon-data.json, in upstream's species order (SNES-era data, believed unchanged on PS1).</p>
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
})
export class Smt1DemonList {
  protected readonly data = inject(Smt1DataService);
  protected readonly store = inject(Smt1CompendiumStore);
  protected readonly nav = inject(GameRouteContext);
  private readonly router = inject(Router);

  protected readonly race = raceLabel;
  protected readonly speciesName = speciesLabel;
  protected readonly level = displayLevel;
  protected readonly align = (d: Demon): string => alignmentLabel(d.alignment);

  protected readonly query = signal('');
  protected readonly species = signal<SpeciesId | null>(null);

  protected readonly specials = computed(() => new Set((this.data.data()?.specialRecipes.recipes ?? []).map((r) => r.resultId)));

  protected readonly groups = computed(() => {
    const d = this.data.data();
    if (!d) return [];
    const q = this.query().trim().toLowerCase();
    const sp = this.species();
    const speciesOf = new Map(d.races.races.map((r) => [r.id, r.species]));
    return RACE_ORDER.flatMap((race: RaceId) => {
      const all = d.demons.filter((m) => m.race === race).sort((a, b) => a.level - b.level);
      if (!all.length || (sp && speciesOf.get(race) !== sp)) return [];
      const demons = all.filter((m) => !q || `${m.name} ${m.jp ?? ''} ${m.race} ${alignmentLabel(m.alignment)}`.toLowerCase().includes(q));
      return demons.length ? [{ race, species: speciesOf.get(race)!, demons, total: all.length }] : [];
    });
  });

  protected readonly shownCount = computed(() => this.groups().reduce((n, g) => n + g.demons.length, 0));

  protected countIn(races: readonly RaceId[]): number {
    return (this.data.data()?.demons ?? []).filter((m) => races.includes(m.race)).length;
  }

  protected open(m: Demon): void {
    void this.router.navigate(this.nav.link('demons', m.id));
  }
}
