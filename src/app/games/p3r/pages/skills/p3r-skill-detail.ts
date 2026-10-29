import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { P3rDataService } from '../../data/p3r-data.service';
import type { Skill } from '../../model';
import { arcanaLabel, formatSkillCost, inheritTypeLabel, inheritTypes, SKILL_ELEMENT_LABEL } from '../../ui/p3r-format';

/**
 * Skill detail: the numbers, which inheritance types can take it, its skill
 * card, every persona that learns it, and the shadows that use it.
 */
@Component({
  selector: 'app-p3r-skill-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState],
  template: `
    @if (data.ready()) {
      @if (skill(); as s) {
        <article class="p3-page">
          <a class="p3-back" [routerLink]="nav.link('skills')"><i class="pi pi-arrow-left" aria-hidden="true"></i> All skills</a>
          <header class="p3-detail-head">
            <div>
              <h1><span class="el-dot" [attr.data-el]="s.element" aria-hidden="true"></span> {{ s.name }}</h1>
              <div class="p3-tags">
                <span class="p3-tag">{{ elementLabel[s.element] }}</span>
                <span class="p3-tag">{{ cost(s) }}</span>
                <span class="p3-tag">{{ s.target }}</span>
                @if (s.rank < 90) { <span class="p3-tag" title="Upstream skill rank">Rank {{ s.rank }}</span> }
              </div>
            </div>
          </header>

          <div class="p3-cols">
            <section class="p3-panel">
              <h2>Effect</h2>
              <p>{{ s.description || '—' }}</p>
              @if (s.cardSources.length) {
                <p class="p3-line"><i class="pi pi-clone" aria-hidden="true"></i> Skill card: {{ s.cardSources.join(', ') }}</p>
              }
            </section>
            <section class="p3-panel">
              <h2>Inheritance</h2>
              @if (s.unique) {
                <p><i class="pi pi-lock" aria-hidden="true"></i> Unique — never passed on by fusion.</p>
              } @else if (takers().length === allTypes()) {
                <p>Any persona can inherit it.</p>
              } @else {
                <p>Personas with these inheritance types can receive it: <strong>{{ takers().join(', ') }}</strong>.</p>
              }
            </section>
          </div>

          <section class="p3-panel">
            <h2>Learned by</h2>
            @if (learners().length) {
              <ul class="p3-list">
                @for (l of learners(); track l.key) {
                  <li>
                    <a [routerLink]="nav.link(l.route, l.id)">{{ l.name }} <small class="p3-muted">{{ l.meta }}</small></a>
                    <span class="p3-side" [class.is-accent]="l.innate">{{ l.when }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="p3-muted">No persona learns it — it is enemy-only.</p>
            }
          </section>

          @if (enemyUsers().length) {
            <section class="p3-panel">
              <h2>Used by shadows</h2>
              <div class="p3-pills">
                @for (d of enemyUsers(); track d.id) {
                  <a class="p3-pill" [routerLink]="nav.link('shadows', d.id)">{{ d.name }}</a>
                }
              </div>
            </section>
          }
        </article>
      } @else {
        <div class="p3-missing">
          <p>Lookup failed: no skill with id “{{ id() }}” on file.</p>
          <a class="p3-btn" [routerLink]="nav.link('skills')">Back to skills</a>
        </div>
      }
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `h1 { display: flex; align-items: center; gap: 0.5rem; } .el-dot { width: 0.85rem; height: 0.85rem; }`,
})
export class P3rSkillDetail {
  protected readonly data = inject(P3rDataService);
  protected readonly nav = inject(GameRouteContext);
  private readonly route = inject(ActivatedRoute);

  protected readonly elementLabel = SKILL_ELEMENT_LABEL;
  protected readonly allTypes = computed(() => inheritTypes(this.data.data()?.inheritMatrix ?? {}).length);

  protected readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('id') ?? '',
  });

  protected readonly skill = computed<Skill | undefined>(() => this.data.skillsById().get(this.id()));

  protected readonly learners = computed(() =>
    (this.data.skillLearners().get(this.id()) ?? []).map((l) => {
      const d = this.data.personasById().get(l.id);
      return {
        key: `d:${l.id}`,
        route: 'personas',
        id: l.id,
        name: d?.name ?? l.id,
        meta: d ? `${arcanaLabel(d.arcana)} ${d.level}` : '',
        innate: l.innate,
        when: l.innate ? 'Innate' : l.theurgy ? 'Theurgy' : `Lv ${l.level}`,
      };
    }),
  );

  protected readonly enemyUsers = computed(() =>
    (this.data.shadowSkillUsers().get(this.id()) ?? []).map((id) => ({ id, name: this.data.shadowsById().get(id)?.name ?? id })),
  );

  /** The inheritance types that may take this skill's element. */
  protected readonly takers = computed(() => {
    const s = this.skill();
    const matrix = this.data.data()?.inheritMatrix;
    if (!s || !matrix) return [];
    return inheritTypes(matrix).filter((t) => matrix[t]?.[s.element]).map(inheritTypeLabel);
  });

  protected cost(s: Skill): string {
    return formatSkillCost(s.cost);
  }
}
