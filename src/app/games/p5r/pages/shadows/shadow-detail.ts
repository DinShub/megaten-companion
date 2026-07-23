import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';

import { AffinityGrid } from '../../../../shared/affinity-grid/affinity-grid';
import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { GameDataService } from '../../data/game-data.service';
import type { AilmentId, Persona, Shadow, Skill } from '../../model';
import { AILMENT_ORDER } from '../../model/ids';
import { STAT_COLUMNS, titleCase } from '../../ui/format';

const AILMENT_LABELS: Record<AilmentId, string> = {
  burn: 'Burn',
  freeze: 'Freeze',
  shock: 'Shock',
  hama: 'Hama',
  mudo: 'Mudo',
  dizzy: 'Dizzy',
  fear: 'Fear',
  despair: 'Despair',
  brainwash: 'Brainwash',
  other: 'Other',
};

/**
 * Shadow detail (§4.2, task 21). Stats, affinities, ailment resistances, skill
 * list, drops (material / armour / skill card / items), encounter areas, and —
 * for sub-bosses — the Mementos request that spawns it. Links to the matching
 * persona entry where one exists.
 */
@Component({
  selector: 'app-shadow-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AffinityGrid, LoadState],
  template: `
    @if (data.ready()) {
      @if (shadow(); as s) {
        <article class="detail">
          <a class="back" [routerLink]="nav.link('shadows')"><i class="pi pi-arrow-left" aria-hidden="true"></i> All shadows</a>

          <header class="head">
            <div>
              <h1 class="head__name">{{ s.name }}</h1>
              <div class="head__meta">
                <span class="tag">{{ titleCase(s.arcana) }}</span>
                <span class="tag">Lv {{ s.level }}</span>
                <span class="tag">{{ s.kind === 'subboss' ? 'Sub-boss' : 'Shadow' }}</span>
              </div>
            </div>
            @if (persona(); as p) {
              <a class="btn" [routerLink]="nav.link('personas', p.id)"><i class="pi pi-users" aria-hidden="true"></i> Persona: {{ p.name }}</a>
            }
          </header>

          @if (s.request; as req) {
            <section class="panel panel--request">
              <h2 class="panel__title">Mementos request</h2>
              <p class="request__name">{{ req.name }}</p>
              <p class="panel__note">{{ req.date }} · Rank {{ req.rank }}</p>
            </section>
          }

          <div class="cols">
            <section class="panel">
              <h2 class="panel__title">Stats</h2>
              <div class="stats">
                <div class="stats__cell stats__cell--wide"><span class="stats__abbr">HP</span><span class="stats__val">{{ s.hp }}</span></div>
                <div class="stats__cell stats__cell--wide"><span class="stats__abbr">SP</span><span class="stats__val">{{ s.sp }}</span></div>
                @for (c of statCols; track c.key) {
                  <div class="stats__cell"><span class="stats__abbr" [title]="c.label">{{ c.abbrev }}</span><span class="stats__val">{{ s.stats[c.key] }}</span></div>
                }
              </div>
              <p class="panel__note">EXP {{ s.exp }} · {{ s.yen }} yen</p>
            </section>

            <section class="panel">
              <h2 class="panel__title">Affinities</h2>
              <app-affinity-grid [affinities]="s.affinities" />
              <h2 class="panel__title">Ailment resistances</h2>
              @if (resistedAilments().length) {
                <div class="chips">
                  @for (a of resistedAilments(); track a) { <span class="chip">{{ a }}</span> }
                </div>
              } @else {
                <p class="panel__note">No ailment resistances.</p>
              }
            </section>
          </div>

          <div class="cols">
            <section class="panel">
              <h2 class="panel__title">Skills</h2>
              @if (skillRows().length) {
                <div class="skills">
                  @for (k of skillRows(); track k.id) {
                    <a class="skills__link" [routerLink]="nav.link('skills', k.id)"><span class="el-dot" [attr.data-el]="k.element"></span>{{ k.name }}</a>
                  }
                </div>
              } @else { <p class="panel__note">No skill data.</p> }
            </section>

            <section class="panel">
              <h2 class="panel__title">Drops</h2>
              <ul class="drops">
                <li><span class="drops__lbl">Material</span><span>{{ s.drops.material ?? '—' }}</span></li>
                <li><span class="drops__lbl">Armour</span><span>{{ s.drops.armor ?? '—' }}</span></li>
                <li><span class="drops__lbl">Skill card</span>
                  @if (cardSkill(); as c) { <a class="link" [routerLink]="nav.link('skills', c.id)">{{ c.name }}</a> }
                  @else { <span>—</span> }
                </li>
                @if (s.drops.items.length) {
                  <li><span class="drops__lbl">Items</span><span>{{ s.drops.items.join(', ') }}</span></li>
                }
              </ul>
            </section>
          </div>

          <section class="panel">
            <h2 class="panel__title">Encounter areas</h2>
            @if (s.areas.length) {
              <div class="chips">
                @for (a of s.areas; track a) { <span class="chip">{{ a }}</span> }
              </div>
            } @else { <p class="panel__note">No area data.</p> }
          </section>
        </article>
      } @else {
        <div class="missing">
          <p>No shadow with id “{{ id() }}”.</p>
          <a class="btn" [routerLink]="nav.link('shadows')">Back to shadows</a>
        </div>
      }
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .detail { display: flex; flex-direction: column; gap: 1.25rem; }
    .back { display: inline-flex; align-items: center; gap: 0.35rem; color: var(--p-text-muted-color); text-decoration: none; font-size: 0.9rem; width: fit-content; &:hover { color: var(--p-primary-color); } }

    .head { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between; align-items: flex-start; }
    .head__name { margin: 0 0 0.5rem; font-size: 1.8rem; }
    .head__meta { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .tag { padding: 0.15rem 0.55rem; border-radius: 999px; background: var(--p-surface-700, rgba(127,127,127,0.16)); font-size: 0.82rem; }
    .btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.8rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); border-radius: var(--p-border-radius, 6px); color: var(--p-text-color); text-decoration: none; font-size: 0.9rem; &:hover { border-color: var(--p-primary-color); } }

    .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1rem; }
    .panel { padding: 1rem 1.15rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.2)); border-radius: var(--p-border-radius, 8px); background: var(--p-surface-800, rgba(127,127,127,0.05)); }
    .panel--request { border-color: color-mix(in srgb, var(--p-primary-color) 40%, transparent); }
    .panel__title { margin: 0 0 0.6rem; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--p-text-muted-color); }
    .panel__title:not(:first-child) { margin-top: 1.1rem; }
    .panel__note { margin: 0.6rem 0 0; color: var(--p-text-muted-color); font-size: 0.85rem; }
    .link { color: var(--p-primary-color); }
    .request__name { margin: 0; font-size: 1.15rem; font-weight: 600; }

    .stats { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .stats__cell { display: flex; flex-direction: column; align-items: center; gap: 0.1rem; min-width: 3rem; padding: 0.4rem; border-radius: 6px; background: var(--p-surface-700, rgba(127,127,127,0.12)); }
    .stats__cell--wide { min-width: 4rem; }
    .stats__abbr { font-size: 0.7rem; color: var(--p-text-muted-color); }
    .stats__val { font-size: 1.1rem; font-weight: 700; font-variant-numeric: tabular-nums; }

    .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .chip { padding: 0.2rem 0.55rem; border-radius: 999px; background: var(--p-surface-700, rgba(127,127,127,0.16)); font-size: 0.82rem; }

    .skills { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .skills__link { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.2rem 0.55rem; border-radius: 999px; background: var(--p-surface-700, rgba(127,127,127,0.16)); color: var(--p-text-color); text-decoration: none; font-size: 0.85rem; &:hover { color: var(--p-primary-color); } }

    .drops { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
    .drops li { display: flex; gap: 0.75rem; }
    .drops__lbl { flex: 0 0 5rem; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--p-text-muted-color); }


    .missing { padding: 3rem 1rem; text-align: center; color: var(--p-text-muted-color); display: flex; flex-direction: column; gap: 1rem; align-items: center; }
  `,
})
export class ShadowDetail {
  protected readonly data = inject(GameDataService);
  protected readonly nav = inject(GameRouteContext);
  private readonly route = inject(ActivatedRoute);

  protected readonly statCols = STAT_COLUMNS;
  protected readonly titleCase = titleCase;

  protected readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('id') ?? '',
  });

  private readonly byId = computed(() => {
    const m = new Map<string, Shadow>();
    for (const s of this.data.data()?.shadows ?? []) m.set(s.id, s);
    return m;
  });
  private readonly skillsById = computed(() => {
    const m = new Map<string, Skill>();
    for (const s of this.data.data()?.skills ?? []) m.set(s.id, s);
    return m;
  });
  private readonly personasById = computed(() => {
    const m = new Map<string, Persona>();
    for (const p of this.data.data()?.personas ?? []) m.set(p.id, p);
    return m;
  });

  protected readonly shadow = computed<Shadow | undefined>(() => this.byId().get(this.id()));

  protected readonly persona = computed<Persona | undefined>(() => {
    const pid = this.shadow()?.personaId;
    return pid ? this.personasById().get(pid) : undefined;
  });

  protected readonly skillRows = computed(() => {
    const s = this.shadow();
    if (!s) return [];
    return s.skillIds.map((id) => {
      const skill = this.skillsById().get(id);
      return { id, name: skill?.name ?? id, element: skill?.element ?? 'passive' };
    });
  });

  protected readonly resistedAilments = computed<string[]>(() => {
    const s = this.shadow();
    if (!s) return [];
    return AILMENT_ORDER.filter((a) => s.ailmentResists[a]).map((a) => AILMENT_LABELS[a]);
  });

  protected cardSkill(): { id: string; name: string } | null {
    const id = this.shadow()?.drops.cardSkillId;
    if (!id) return null;
    return { id, name: this.skillsById().get(id)?.name ?? id };
  }
}
