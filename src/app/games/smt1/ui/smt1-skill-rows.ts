import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../shared/game-route';
import { Smt1DataService } from '../data/smt1-data.service';
import type { Skill, SkillId } from '../model';
import { mpLabel, skillSummary } from './smt1-format';

/** A demon's fixed skills as ruled rows: name, MP, and one line of what it does. */
@Component({
  selector: 'app-smt1-skill-rows',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (skills().length) {
      <ul class="g1-skills">
        @for (s of skills(); track s.id) {
          <li>
            <span class="sk"><a [routerLink]="nav.link('skills', s.id)">{{ s.name }}</a></span>
            <span class="mp">{{ mp(s) }}</span>
            <span class="fx">{{ summary(s) }}</span>
          </li>
        }
      </ul>
    } @else {
      <p class="g1-dim">No skills.</p>
    }
  `,
})
export class Smt1SkillRows {
  private readonly data = inject(Smt1DataService);
  protected readonly nav = inject(GameRouteContext);

  readonly skillIds = input.required<readonly SkillId[]>();

  protected readonly skills = computed<Skill[]>(() =>
    this.skillIds().flatMap((id) => {
      const s = this.data.skillsById().get(id);
      return s ? [s] : [];
    }),
  );
  protected readonly mp = mpLabel;
  protected readonly summary = skillSummary;
}
