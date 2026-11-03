import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { Smt1DataService } from '../../data/smt1-data.service';
import type { Skill, SkillElementId } from '../../model';
import { SKILL_ELEMENT_ORDER } from '../../model/ids';
import { SKILL_ELEMENT_LABEL } from '../../ui/smt1-format';

const USERS_SHOWN = 4;

/**
 * Every skill, by element. SMT1 skills come with the demon, so each row lists
 * the demons that have it instead of who can learn it.
 */
@Component({
  selector: 'app-smt1-skill-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState],
  template: `
    @if (data.data(); as d) {
      <div class="g1-page">
        <div class="g1-runhead">
          <div>
            <h1><span class="g1-runhead__jp g1-plate" lang="ja">スキル一覧</span>Skills</h1>
            <p>Every skill, by element. A demon's skills come with it, so each skill lists the demons that have it.</p>
          </div>
        </div>

        <ul class="g1-chips" aria-label="Element">
          <li><button type="button" class="g1-chip" [attr.aria-pressed]="element() === null" (click)="element.set(null)">All<small>{{ d.skills.length }}</small></button></li>
          @for (e of usedElements(); track e) {
            <li><button type="button" class="g1-chip" [attr.aria-pressed]="element() === e" (click)="element.set(e)">{{ label[e] }}<small>{{ countOf(e) }}</small></button></li>
          }
        </ul>
        <div class="g1-toolbar">
          <label class="g1-field">
            <span>Search</span>
            <input type="search" placeholder="Skill, katakana, effect or demon" [value]="query()" (input)="query.set($any($event.target).value)" />
          </label>
          <p class="g1-count" aria-live="polite"><b>{{ shownCount() }}</b> of {{ d.skills.length }}</p>
        </div>

        <div class="g1-tbl-scroll">
          <table class="g1-tbl g1-tbl--skills">
            <thead><tr><th scope="col">Skill</th><th scope="col">MP</th><th scope="col">Power</th><th scope="col">Target</th><th scope="col">Effect</th><th scope="col">Demons</th></tr></thead>
            <tbody>
              @for (g of groups(); track g.element) {
                <tr class="group"><td colspan="6">{{ label[g.element] }}<small>{{ g.skills.length }}</small></td></tr>
                @for (s of g.skills; track s.id) {
                  <tr tabindex="0" (click)="open(s)" (keydown.enter)="open(s)">
                    <td class="g1-strong"><ruby><a [routerLink]="nav.link('skills', s.id)" tabindex="-1">{{ s.name }}</a><rt lang="ja">{{ s.jp }}</rt></ruby></td>
                    <td class="g1-num">{{ s.mp ?? '–' }}</td>
                    <td class="g1-num">{{ s.power ?? '–' }}</td>
                    <td class="g1-dim">{{ s.target ?? '–' }}</td>
                    <td class="g1-dim g1-fx">{{ s.effect ?? '–' }}</td>
                    <td class="g1-users">
                      @let users = usersOf(s);
                      @for (u of users.slice(0, usersShown); track u.id; let last = $last) {
                        <a [routerLink]="nav.link('demons', u.id)" (click)="$event.stopPropagation()">{{ u.name }}</a>@if (!last) {, }
                      }
                      @if (users.length > usersShown) { <span class="g1-dim"> and {{ users.length - usersShown }} more</span> }
                      @if (!users.length) { <span class="g1-dim">No demon</span> }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
        <p class="g1-foot">105 skills from upstream's SMT1 skill-data.json and jap-skills.json (SNES-era data, believed unchanged on PS1).</p>
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
})
export class Smt1SkillList {
  protected readonly data = inject(Smt1DataService);
  protected readonly nav = inject(GameRouteContext);
  private readonly router = inject(Router);
  protected readonly label = SKILL_ELEMENT_LABEL;
  protected readonly usersShown = USERS_SHOWN;

  protected readonly query = signal('');
  protected readonly element = signal<SkillElementId | null>(null);

  protected readonly usedElements = computed(() => SKILL_ELEMENT_ORDER.filter((e) => (this.data.data()?.skills ?? []).some((s) => s.element === e)));

  protected readonly groups = computed(() => {
    const skills = this.data.data()?.skills ?? [];
    const q = this.query().trim().toLowerCase();
    const el = this.element();
    return SKILL_ELEMENT_ORDER.flatMap((element) => {
      if (el && el !== element) return [];
      const list = skills
        .filter((s) => s.element === element)
        .filter((s) => !q || `${s.name} ${s.jp ?? ''} ${s.effect ?? ''} ${s.target ?? ''} ${this.usersOf(s).map((u) => u.name).join(' ')}`.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name));
      return list.length ? [{ element, skills: list }] : [];
    });
  });

  protected readonly shownCount = computed(() => this.groups().reduce((n, g) => n + g.skills.length, 0));

  protected countOf(e: SkillElementId): number {
    return (this.data.data()?.skills ?? []).filter((s) => s.element === e).length;
  }

  protected usersOf(s: Skill): { id: string; name: string }[] {
    const byId = this.data.demonsById();
    return (this.data.skillUsers().get(s.id) ?? []).map((id) => ({ id, name: byId.get(id)?.name ?? id }));
  }

  protected open(s: Skill): void {
    void this.router.navigate(this.nav.link('skills', s.id));
  }
}
