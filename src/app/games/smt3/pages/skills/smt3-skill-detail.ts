import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { Smt3DataService } from '../../data/smt3-data.service';
import type { Skill } from '../../model';
import { formatSkillCost, INHERIT_LABEL, raceLabel, SKILL_ELEMENT_LABEL } from '../../ui/smt3-format';

/**
 * Skill detail: the numbers, who can inherit it, every demon and magatama that
 * learns it, and the demons that use it in the field.
 */
@Component({
  selector: 'app-smt3-skill-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState],
  template: `
    @if (data.ready()) {
      @if (skill(); as s) {
        <article class="s3-page">
          <a class="s3-back" [routerLink]="nav.link('skills')"><i class="pi pi-arrow-left" aria-hidden="true"></i> All skills</a>
          <header class="s3-detail-head">
            <div>
              <h1><span class="el-dot" [attr.data-el]="s.element" aria-hidden="true"></span> {{ s.name }}</h1>
              <div class="s3-tags">
                <span class="s3-tag">{{ elementLabel[s.element] }}</span>
                <span class="s3-tag">{{ cost(s) }}</span>
                <span class="s3-tag">{{ s.target }}</span>
                @if (s.rank < 90) { <span class="s3-tag" title="Upstream skill rank">Rank {{ s.rank }}</span> }
              </div>
            </div>
          </header>

          <div class="s3-cols">
            <section class="s3-panel">
              <h2>Effect</h2>
              <p>{{ s.description || '—' }}</p>
              @if (s.power !== null) {
                <dl class="s3-kv">
                  <dt>Power</dt><dd>{{ s.power }}</dd>
                  @if (s.hits; as h) { <dt>Hits</dt><dd>{{ h.min === h.max ? h.min : h.min + '–' + h.max }}</dd> }
                </dl>
              }
            </section>
            <section class="s3-panel">
              <h2>Inheritance</h2>
              @if (s.unique) {
                <p><i class="pi pi-lock" aria-hidden="true"></i> Unique — never passed on by fusion.</p>
              } @else if (s.inheritCategory) {
                <p>Only demons that can inherit <strong>{{ inheritLabel[s.inheritCategory] }}</strong> skills can receive it.</p>
              } @else {
                <p>Any demon can inherit it.</p>
              }
            </section>
          </div>

          <section class="s3-panel">
            <h2>Learned by</h2>
            @if (learners().length) {
              <ul class="s3-list">
                @for (l of learners(); track l.key) {
                  <li>
                    <a [routerLink]="nav.link(l.route, l.id)">{{ l.name }} <small class="s3-muted">{{ l.meta }}</small></a>
                    <span class="s3-side" [class.is-accent]="l.innate">{{ l.when }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="s3-muted">No demon or magatama learns it — it is enemy-only.</p>
            }
          </section>

          @if (enemyUsers().length) {
            <section class="s3-panel">
              <h2>Used by enemies</h2>
              <div class="s3-pills">
                @for (d of enemyUsers(); track d.id) {
                  <a class="s3-pill" [routerLink]="nav.link('demons', d.id)">{{ d.name }}</a>
                }
              </div>
            </section>
          }
        </article>
      } @else {
        <div class="s3-missing">
          <p>No skill with id “{{ id() }}”.</p>
          <a class="s3-btn" [routerLink]="nav.link('skills')">Back to skills</a>
        </div>
      }
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `h1 { display: flex; align-items: center; gap: 0.5rem; } .el-dot { width: 0.85rem; height: 0.85rem; }`,
})
export class Smt3SkillDetail {
  protected readonly data = inject(Smt3DataService);
  protected readonly nav = inject(GameRouteContext);
  private readonly route = inject(ActivatedRoute);

  protected readonly elementLabel = SKILL_ELEMENT_LABEL;
  protected readonly inheritLabel = INHERIT_LABEL;

  protected readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('id') ?? '',
  });

  protected readonly skill = computed<Skill | undefined>(() => this.data.skillsById().get(this.id()));

  protected readonly learners = computed(() =>
    (this.data.skillLearners().get(this.id()) ?? []).map((l) => {
      if (l.source === 'magatama') {
        const m = this.data.magatamaById().get(l.id);
        return { key: `m:${l.id}`, route: 'magatama', id: l.id, name: m?.name ?? l.id, meta: 'Magatama', innate: false, when: l.level === null ? 'Special unlock' : `Demi-fiend Lv ${l.level}` };
      }
      const d = this.data.demonsById().get(l.id);
      return {
        key: `d:${l.id}`,
        route: 'demons',
        id: l.id,
        name: d?.name ?? l.id,
        meta: d ? `${raceLabel(d.race)} ${d.level}` : '',
        innate: l.innate,
        when: l.innate ? 'Innate' : `Lv ${l.level}`,
      };
    }),
  );

  protected readonly enemyUsers = computed(() =>
    (this.data.enemySkillUsers().get(this.id()) ?? []).map((id) => ({ id, name: this.data.demonsById().get(id)?.name ?? id })),
  );

  protected cost(s: Skill): string {
    return formatSkillCost(s.cost);
  }
}
