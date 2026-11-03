import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { Smt1CompendiumStore } from '../../compendium/smt1-compendium.store';
import { Smt1DataService } from '../../data/smt1-data.service';
import { displayLevel } from '../../model';
import { raceLabel, SKILL_ELEMENT_LABEL } from '../../ui/smt1-format';

/** One skill: what it does, and every demon that has it. */
@Component({
  selector: 'app-smt1-skill-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState],
  template: `
    @if (data.ready()) {
      @if (skill(); as s) {
        <div class="g1-page">
          <div class="g1-runhead">
            <div>
              <h1><span class="g1-runhead__jp g1-plate" lang="ja">スキル</span><ruby>{{ s.name }}<rt lang="ja">{{ s.jp }}</rt></ruby></h1>
              <p><a [routerLink]="nav.link('skills')">All skills</a></p>
            </div>
          </div>
          <div class="g1-spread g1-spread--narrow">
            <section class="g1-box" aria-labelledby="sk-t">
              <div class="g1-box__bar g1-plate"><h2 id="sk-t">{{ label[s.element] }}</h2><span>{{ s.mp ? s.mp + ' MP' : 'no MP' }}</span></div>
              <div class="g1-box__data">
                <dl class="g1-facts g1-facts--stack">
                  <div><dt>Element</dt><dd>{{ label[s.element] }}</dd></div>
                  <div><dt>MP</dt><dd>{{ s.mp ?? '–' }}</dd></div>
                  <div><dt>Power</dt><dd>{{ s.power ?? '–' }}</dd></div>
                  <div><dt>Target</dt><dd>{{ s.target ?? '–' }}</dd></div>
                  <div><dt>Effect</dt><dd>{{ s.effect ?? '–' }}</dd></div>
                </dl>
                @if (s.enemyOnly) { <p class="g1-meta">Upstream marks this as an enemy skill.</p> }
              </div>
            </section>
            <section aria-labelledby="us-t">
              <h2 class="g1-section-title" id="us-t">Demons with it<small>{{ users().length }}</small></h2>
              @if (users().length) {
                <ul class="g1-mates">
                  @for (d of users(); track d.id) {
                    <li><a [routerLink]="nav.link('demons', d.id)" [class.g1-owned]="compendium.has(d.id)">{{ d.name }}</a><span>{{ race(d.race) }}, Lv {{ level(d) }}</span></li>
                  }
                </ul>
              } @else {
                <p class="g1-empty">No demon has this skill.</p>
              }
            </section>
          </div>
        </div>
      } @else {
        <p class="g1-empty">No skill called “{{ id() }}”. <a [routerLink]="nav.link('skills')">Back to the list</a>.</p>
      }
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
})
export class Smt1SkillDetail {
  protected readonly data = inject(Smt1DataService);
  protected readonly compendium = inject(Smt1CompendiumStore);
  protected readonly nav = inject(GameRouteContext);
  protected readonly label = SKILL_ELEMENT_LABEL;
  protected readonly race = raceLabel;
  protected readonly level = displayLevel;

  protected readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });
  protected readonly skill = computed(() => this.data.skillsById().get(this.id()) ?? null);
  protected readonly users = computed(() => {
    const byId = this.data.demonsById();
    return (this.data.skillUsers().get(this.id()) ?? []).flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []));
  });
}
