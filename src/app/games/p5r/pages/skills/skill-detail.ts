import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { CompendiumStore } from '../../compendium/compendium.store';
import { GameDataService } from '../../data/game-data.service';
import type { Persona, Shadow, Skill } from '../../model';
import { INHERIT_TYPE_ORDER } from '../../model/ids';
import {
  acquisitionOrder,
  formatAcquisition,
  formatSkillCost,
  SKILL_ELEMENT_NAMES,
  titleCase,
  typesThatInherit,
} from '../../ui/format';

interface CardRef {
  readonly id: string;
  readonly name: string;
}

/**
 * Skill detail (§4.3, task 23). Full effect, the personas that learn it natively
 * (with level), the three distinct card-source kinds each labelled and linked,
 * inheritance eligibility across all 14 inherit types, and the route-finder seed.
 */
@Component({
  selector: 'app-skill-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState],
  template: `
    @if (data.ready()) {
      @if (skill(); as s) {
        <article class="detail">
          <a class="back" [routerLink]="nav.link('skills')"><i class="pi pi-arrow-left" aria-hidden="true"></i> All skills</a>

          <header class="head">
            <div>
              <h1 class="head__name">
                <span class="el-dot" [attr.data-el]="s.element" aria-hidden="true"></span>{{ s.name }}
                @if (s.unique) { <i class="pi pi-lock head__lock" title="Unique — not inheritable" aria-hidden="true"></i> }
              </h1>
              <div class="head__meta">
                <span class="tag">{{ elementName(s.element) }}</span>
                <span class="tag">{{ formatCost(s.cost) }}</span>
                <span class="tag">{{ s.target }}</span>
                @if (s.unique) { <span class="tag tag--unique">Unique</span> }
              </div>
            </div>
            <a class="btn btn--primary" [routerLink]="nav.link('fusion', 'route')"><i class="pi pi-bolt" aria-hidden="true"></i> Plan a fusion with this skill</a>
          </header>

          <section class="panel">
            <h2 class="panel__title">Effect</h2>
            <p class="effect">{{ s.description }}</p>
            @if (s.cardLocations.length) {
              <p class="panel__note">Card found in: {{ s.cardLocations.join(', ') }}.</p>
            }
          </section>

          <div class="cols">
            <section class="panel">
              <h2 class="panel__title">Learned by</h2>
              @if (learnedBy().length) {
                <ul class="list">
                  @for (l of learnedBy(); track l.id) {
                    <li class="list__row">
                      <a class="list__link" [routerLink]="nav.link('personas', l.id)">
                        @if (l.owned) { <i class="pi pi-check-circle owned-dot" title="In your compendium" aria-label="In your compendium"></i> }
                        {{ l.name }}
                      </a>
                      <span class="list__acq" [class.is-innate]="l.innate">{{ l.acquisition }}</span>
                    </li>
                  }
                </ul>
              } @else {
                <p class="panel__note">No persona learns this natively — it comes only from a card or inheritance.</p>
              }
            </section>

            <section class="panel">
              <h2 class="panel__title">Inheritance eligibility</h2>
              @if (s.unique) {
                <p class="panel__note"><i class="pi pi-lock" aria-hidden="true"></i> Unique — cannot be inherited by any type.</p>
              } @else if (!s.inheritElement) {
                <p class="panel__note">Not element-gated — but almighty, support and passive skills are not inheritable through the mask.</p>
              } @else {
                <p class="panel__note">Which of the 14 inherit types can receive a {{ elementName(s.element) }} skill:</p>
                <div class="types">
                  @for (t of inheritTypes(); track t.type) {
                    <span class="type" [class.is-on]="t.on">{{ t.label }}</span>
                  }
                </div>
              }
            </section>
          </div>

          <section class="panel">
            <h2 class="panel__title">Card sources</h2>
            @if (hasAnyCard()) {
              <div class="cards">
                <div class="cards__col">
                  <span class="cards__lbl"><i class="pi pi-id-card" aria-hidden="true"></i> Itemization</span>
                  @if (itemization().length) {
                    @for (c of itemization(); track c.id) { <a class="pill" [routerLink]="nav.link('personas', c.id)">{{ c.name }}</a> }
                  } @else { <span class="muted">—</span> }
                </div>
                <div class="cards__col">
                  <span class="cards__lbl"><i class="pi pi-bell" aria-hidden="true"></i> Itemization (Fusion Alarm)</span>
                  @if (itemizationAlarm().length) {
                    @for (c of itemizationAlarm(); track c.id) { <a class="pill" [routerLink]="nav.link('personas', c.id)">{{ c.name }}</a> }
                  } @else { <span class="muted">—</span> }
                </div>
                <div class="cards__col">
                  <span class="cards__lbl"><i class="pi pi-comments" aria-hidden="true"></i> Negotiation</span>
                  @if (negotiation().length) {
                    @for (c of negotiation(); track c.id) { <a class="pill" [routerLink]="nav.link('shadow', c.id)">{{ c.name }}</a> }
                  } @else { <span class="muted">—</span> }
                </div>
              </div>
            } @else {
              <p class="panel__note">No skill card — this skill is not obtainable via itemization or negotiation.</p>
            }
          </section>
        </article>
      } @else {
        <div class="missing">
          <p>No skill with id “{{ id() }}”.</p>
          <a class="btn" [routerLink]="nav.link('skills')">Back to skills</a>
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
    .head__name { margin: 0 0 0.5rem; font-size: 1.7rem; display: inline-flex; align-items: center; gap: 0.5rem; }
    .head__lock { font-size: 1rem; color: var(--p-text-muted-color); }
    .head__meta { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .tag { padding: 0.15rem 0.55rem; border-radius: 999px; background: var(--app-panel-2); font-size: 0.82rem; }
    .tag--unique { color: var(--p-primary-color); }

    .btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.8rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); border-radius: var(--p-border-radius, 6px); color: var(--p-text-color); text-decoration: none; font-size: 0.9rem; &:hover { border-color: var(--p-primary-color); } }
    .btn--primary { border-color: var(--p-primary-color); color: var(--p-primary-color); }

    .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1rem; }
    .panel { padding: 1rem 1.15rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.2)); border-radius: var(--p-border-radius, 8px); background: var(--app-panel); }
    .panel__title { margin: 0 0 0.6rem; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--p-text-muted-color); }
    .panel__note { margin: 0.4rem 0 0; color: var(--p-text-muted-color); font-size: 0.85rem; display: flex; align-items: center; gap: 0.35rem; }
    .effect { margin: 0; font-size: 1.05rem; }

    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; max-height: 22rem; overflow-y: auto; }
    .list__row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.35rem 0; border-top: 1px solid var(--p-content-border-color, rgba(127,127,127,0.12)); &:first-child { border-top: 0; } }
    .list__link { color: var(--p-text-color); text-decoration: none; font-weight: 500; &:hover { color: var(--p-primary-color); } }
    .list__acq { font-size: 0.8rem; color: var(--p-text-muted-color); font-variant-numeric: tabular-nums; }
    .list__acq.is-innate { color: var(--p-primary-color); }

    .types { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .type { padding: 0.2rem 0.55rem; border-radius: 999px; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.25)); font-size: 0.8rem; color: var(--p-text-muted-color); opacity: 0.55; }
    .type.is-on { opacity: 1; border-color: var(--p-primary-color); color: var(--p-primary-color); background: var(--p-highlight-background, color-mix(in srgb, var(--p-primary-color) 14%, transparent)); }

    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 1.25rem; }
    .cards__col { display: flex; flex-direction: column; gap: 0.45rem; align-items: flex-start; }
    .cards__lbl { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--p-text-muted-color); }
    .pill { padding: 0.25rem 0.6rem; border-radius: 999px; background: var(--app-panel-2); color: var(--p-text-color); text-decoration: none; font-size: 0.85rem; &:hover { color: var(--p-primary-color); } }
    .muted { color: var(--p-text-muted-color); }


    .missing { padding: 3rem 1rem; text-align: center; color: var(--p-text-muted-color); display: flex; flex-direction: column; gap: 1rem; align-items: center; }
  `,
})
export class SkillDetail {
  protected readonly data = inject(GameDataService);

  constructor() {
    // Negotiation card sources read shadow data, in the on-demand extras (task 58).
    this.data.loadExtras();
  }
  protected readonly nav = inject(GameRouteContext);
  private readonly compendium = inject(CompendiumStore);
  private readonly route = inject(ActivatedRoute);

  protected readonly formatCost = formatSkillCost;

  protected readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('id') ?? '',
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
  private readonly shadowsById = computed(() => {
    const m = new Map<string, Shadow>();
    for (const s of this.data.data()?.shadows ?? []) m.set(s.id, s);
    return m;
  });

  protected readonly skill = computed<Skill | undefined>(() => this.skillsById().get(this.id()));

  protected readonly learnedBy = computed(() => {
    const learners = this.data.skillLearnedBy().get(this.id()) ?? [];
    const owned = this.compendium.entryMap();
    return [...learners]
      .sort((a, b) => acquisitionOrder(a) - acquisitionOrder(b) || 0)
      .map((l) => ({
        id: l.personaId,
        name: this.personasById().get(l.personaId)?.name ?? l.personaId,
        acquisition: formatAcquisition(l),
        innate: l.kind === 'innate',
        owned: owned.has(l.personaId),
      }));
  });

  private cardsOfKind(kind: 'itemization' | 'itemization-alarm' | 'negotiation'): CardRef[] {
    const s = this.skill();
    if (!s) return [];
    const lookup = kind === 'negotiation' ? this.shadowsById() : this.personasById();
    return s.cardSources
      .filter((c) => c.kind === kind)
      .map((c) => ({ id: c.from, name: lookup.get(c.from)?.name ?? c.from }));
  }

  protected readonly itemization = computed(() => this.cardsOfKind('itemization'));
  protected readonly itemizationAlarm = computed(() => this.cardsOfKind('itemization-alarm'));
  protected readonly negotiation = computed(() => this.cardsOfKind('negotiation'));
  protected readonly hasAnyCard = computed(() => (this.skill()?.cardSources.length ?? 0) > 0);

  protected readonly inheritTypes = computed(() => {
    const s = this.skill();
    const matrix = this.data.data()?.inheritMatrix;
    if (!s || !matrix) return [];
    const eligible = new Set(typesThatInherit(matrix, s.inheritElement, s.unique));
    return INHERIT_TYPE_ORDER.filter((t) => t !== 'none').map((type) => ({
      type,
      label: titleCase(type),
      on: eligible.has(type),
    }));
  });

  protected elementName(el: string): string {
    return SKILL_ELEMENT_NAMES[el as keyof typeof SKILL_ELEMENT_NAMES] ?? el;
  }
}
