import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../shared/game-route';
import type { Demon } from '../model';
import { displayLevel } from '../model';
import { alignmentLabel, raceLabel, STAT_COLUMNS } from './smt1-format';
import { Smt1ResistStrip } from './smt1-resist-strip';
import { Smt1SkillRows } from './smt1-skill-rows';

/**
 * The guide's demon data box: a spot-blue bar with the role and race, the
 * katakana written down the side, then the demon. `full` adds the stats table
 * and the resistance strip (the result box and the demon entry). Content
 * projected into the box replaces the name line, for the calculator's slots.
 */
@Component({
  selector: 'app-smt1-demon-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Smt1ResistStrip, Smt1SkillRows],
  template: `
    <section class="g1-box" [class.g1-box--result]="full()" [attr.aria-label]="role() + ': ' + demon().name">
      <div class="g1-box__bar g1-plate">
        <h2>{{ role() }}</h2>
        <span>{{ race(demon()) }}, Lv {{ level(demon()) }}</span>
      </div>
      <div class="g1-box__body">
        <span class="g1-kana" [class.g1-kana--spot]="full()" lang="ja" aria-hidden="true">{{ demon().jp }}</span>
        <div class="g1-box__data">
          <ng-content>
            <h3 class="g1-box__name"><a [routerLink]="nav.link('demons', demon().id)">{{ demon().name }}</a></h3>
          </ng-content>
          <p class="g1-meta">
            {{ align(demon()) }}, HP <b>{{ demon().stats.hp }}</b> MP <b>{{ demon().stats.mp }}</b>@if (demon().drop) {, drops <b>{{ demon().drop }}</b>}
          </p>
          @if (full()) {
            <table class="g1-stats">
              <thead><tr>@for (c of stats; track c.key) { <th scope="col">{{ c.label }}</th> }</tr></thead>
              <tbody><tr>@for (c of stats; track c.key) { <td>{{ demon().stats[c.key] }}</td> }</tr></tbody>
            </table>
            <h4 class="g1-plate">Resistances</h4>
            <div class="g1-aff-scroll"><app-smt1-resist-strip [affinities]="demon().affinities" /></div>
            <p class="g1-legend">Numbers are the share of damage taken. Wk weak (black); Nu null, Rp repel, Dr drain (blue).</p>
            <h4 class="g1-plate">Skills</h4>
          }
          <app-smt1-skill-rows [skillIds]="demon().skillIds" [class.g1-skills--wide]="full()" />
        </div>
      </div>
    </section>
  `,
})
export class Smt1DemonBox {
  protected readonly nav = inject(GameRouteContext);

  readonly demon = input.required<Demon>();
  readonly role = input('Demon');
  readonly full = input(false);

  protected readonly stats = STAT_COLUMNS;
  protected readonly race = (d: Demon): string => raceLabel(d.race);
  protected readonly level = displayLevel;
  protected readonly align = (d: Demon): string => alignmentLabel(d.alignment);
}
