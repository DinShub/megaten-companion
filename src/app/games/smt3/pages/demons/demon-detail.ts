import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';

import { AffinityGrid } from '../../../../shared/affinity-grid/affinity-grid';
import { GameRouteContext } from '../../../../shared/game-route';
import { InheritMask } from '../../../../shared/inherit-mask/inherit-mask';
import { LoadState } from '../../../../shared/load-state/load-state';
import { Smt3CompendiumStore } from '../../compendium/smt3-compendium.store';
import { Smt3DataService } from '../../data/smt3-data.service';
import { nativeSkills, summonCost } from '../../fusion';
import type { Demon } from '../../model';
import { AILMENT_ORDER } from '../../model/ids';
import {
  AILMENT_LABEL,
  formatAcquisition,
  formatNumber,
  inheritRow,
  KIND_LABEL,
  raceLabel,
  SMT3_AFFINITY_ELEMENTS,
  SMT3_INHERIT_ELEMENTS,
  UNLOCK_LABEL,
} from '../../ui/smt3-format';
import { Smt3RecipeTable } from '../../ui/smt3-recipe-table';
import { Smt3FusionStore } from '../fusion/smt3-fusion.store';

const STAT_CELLS = [
  { key: 'hp', label: 'HP' },
  { key: 'mp', label: 'MP' },
  { key: 'strength', label: 'St' },
  { key: 'magic', label: 'Ma' },
  { key: 'vitality', label: 'Vi' },
  { key: 'agility', label: 'Ag' },
  { key: 'luck', label: 'Lu' },
] as const;

/**
 * Demon detail: everything a companion needs on one page — stats, affinities,
 * ailment resistances, the inheritance mask, the learn-set (each skill linked),
 * how to obtain it (recipes, Deathstone fusion, evolution, recruitment), its
 * evolution, its field encounter data, and every fusion it takes part in.
 */
@Component({
  selector: 'app-demon-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AffinityGrid, InheritMask, LoadState, Smt3RecipeTable],
  template: `
    @if (data.ready()) {
      @if (demon(); as d) {
        <article class="s3-page">
          <a class="s3-back" [routerLink]="nav.link('demons')"><i class="pi pi-arrow-left" aria-hidden="true"></i> All demons</a>

          <header class="s3-detail-head">
            <div>
              <h1>{{ d.name }}</h1>
              <div class="s3-tags">
                <span class="s3-tag">{{ raceLabel(d.race) }}</span>
                <span class="s3-tag">Lv {{ d.level }}</span>
                <span class="s3-tag s3-tag--accent">{{ kindLabel[d.kind] }}</span>
                @if (d.personality) { <span class="s3-tag" title="Negotiation personality">{{ cap(d.personality) }}</span> }
                @if (d.age || d.gender) { <span class="s3-tag">{{ ageGender(d) }}</span> }
              </div>
              @if (d.unlock) {
                <p class="s3-line"><i class="pi pi-lock" aria-hidden="true"></i> {{ unlockLabel[d.unlock.group] }} — {{ d.unlock.condition }}</p>
              }
              @if (d.prereq) {
                <p class="s3-line"><i class="pi pi-info-circle" aria-hidden="true"></i> {{ d.prereq }}</p>
              }
            </div>
            <div class="s3-actions">
              @if (registered(); as entry) {
                <span class="s3-btn s3-btn--owned"><i class="pi pi-check-circle" aria-hidden="true"></i> Registered · Lv {{ entry.level }}</span>
                <a class="s3-btn" [routerLink]="nav.link('compendium')" [queryParams]="{ edit: d.id }"><i class="pi pi-pencil" aria-hidden="true"></i> Manage</a>
                <button class="s3-btn" type="button" (click)="compendium.remove(d.id)"><i class="pi pi-times" aria-hidden="true"></i> Unregister</button>
              } @else {
                <button class="s3-btn s3-btn--primary" type="button" (click)="register(d)"><i class="pi pi-plus" aria-hidden="true"></i> Register in compendium</button>
              }
              <a class="s3-btn" [routerLink]="nav.link('fusion', 'route')" [queryParams]="{ target: d.id }"><i class="pi pi-sitemap" aria-hidden="true"></i> Find a route</a>
            </div>
          </header>

          <div class="s3-cols">
            <section class="s3-panel">
              <h2>Affinities</h2>
              <app-affinity-grid [affinities]="d.affinities" [elements]="affinityElements" />
              @if (ailments().length) {
                <p class="s3-note">Ailments: @for (a of ailments(); track a; let last = $last) { {{ a }}{{ last ? '' : ', ' }} }</p>
              }
              <h2>Can inherit</h2>
              <app-inherit-mask [allowed]="inheritRow(d)" [elements]="inheritElements" />
              <p class="s3-note">Skills of a ticked body type can pass to {{ d.name }}; every other skill can be inherited by any demon.</p>
            </section>

            <section class="s3-panel">
              <h2>Stats</h2>
              <div class="s3-statcells">
                @for (s of statCells; track s.key) {
                  <div><small>{{ s.label }}</small><strong>{{ d.stats[s.key] }}</strong></div>
                }
              </div>
              <p class="s3-note">Est. compendium recall cost: {{ cost(d) }} Macca (upstream's estimate from base stats).</p>
              @if (evolveTo(); as e) {
                <h2>Evolves into</h2>
                <p><a [routerLink]="nav.link('demons', e.id)">{{ e.name }}</a>&nbsp;<span class="s3-muted">at Lv {{ e.level }}</span></p>
              }
              @if (evolveFrom(); as e) {
                <h2>Evolves from</h2>
                <p><a [routerLink]="nav.link('demons', e.id)">{{ e.name }}</a>&nbsp;<span class="s3-muted">at Lv {{ e.level }}</span></p>
              }
            </section>
          </div>

          <section class="s3-panel">
            <h2>Skills</h2>
            <ul class="s3-list">
              @for (s of skillRows(); track s.id) {
                <li>
                  <a [routerLink]="nav.link('skills', s.id)">
                    <span class="el-dot" [attr.data-el]="s.element" aria-hidden="true"></span>
                    <span>{{ s.name }}</span>
                    @if (s.unique) { <i class="pi pi-lock s3-muted" title="Unique — not inheritable" aria-hidden="true"></i> }
                  </a>
                  <span class="s3-side" [class.is-accent]="s.innate">{{ s.acquisition }}</span>
                </li>
              }
            </ul>
          </section>

          <section class="s3-panel">
            <h2>How to obtain</h2>
            @switch (d.kind) {
              @case ('fiend') {
                @if (deathstoneRace(); as race) {
                  <p>Fuse any pair that would produce a <strong>{{ raceLabel(race) }}</strong> demon while holding a <strong>Deathstone</strong>, in the Kagutsuchi phase named above — the result becomes {{ d.name }} instead.</p>
                }
              }
              @case ('evolution') {
                @if (evolveFrom(); as e) {
                  <p>Only by evolving <a [routerLink]="nav.link('demons', e.id)">{{ e.name }}</a> (at Lv {{ e.level }}). Fusion cannot make {{ d.name }}.</p>
                }
              }
              @case ('recruit') {
                <p>{{ d.name }} cannot be fused{{ d.unlock ? ' — ' + d.unlock.condition : d.prereq ? ' — ' + d.prereq : '.' }}</p>
              }
              @default {
                <app-smt3-recipe-table [recipes]="recipes()" mode="reverse" [empty]="'No pair makes ' + d.name + ' under the current unlock settings.'" />
              }
            }
          </section>

          @if (d.enemy; as e) {
            <section class="s3-panel">
              <h2>In the field</h2>
              <dl class="s3-kv">
                @if (e.locations.length) { <dt>Found in</dt><dd>{{ e.locations.join(' · ') }}</dd> }
                @if (e.hp !== null) { <dt>Enemy HP / MP</dt><dd>{{ e.hp }} / {{ e.mp ?? '—' }}</dd> }
                @if (e.exp !== null) { <dt>EXP</dt><dd>{{ e.exp }}</dd> }
                @if (e.macca !== null) { <dt>Macca</dt><dd>{{ e.macca }}</dd> }
                @if (e.drops.length) { <dt>Drops</dt><dd>{{ e.drops.join(', ') }}</dd> }
              </dl>
              @if (e.skillIds.length) {
                <h2>Uses in battle</h2>
                <div class="s3-pills">
                  @for (id of e.skillIds; track id) {
                    <a class="s3-pill" [routerLink]="nav.link('skills', id)">{{ skillName(id) }}</a>
                  }
                </div>
              }
            </section>
          }

          <section class="s3-panel">
            <h2>Fuses into</h2>
            <p class="s3-note">Every result of fusing {{ d.name }} with one other demon.</p>
            <app-smt3-recipe-table [recipes]="fusionsFrom()" mode="forward" [empty]="d.name + ' fuses with nothing under the current unlock settings.'" />
          </section>
        </article>
      } @else {
        <div class="s3-missing">
          <p>No demon with id “{{ id() }}”.</p>
          <a class="s3-btn" [routerLink]="nav.link('demons')">Back to demons</a>
        </div>
      }
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
})
export class DemonDetail {
  protected readonly data = inject(Smt3DataService);
  protected readonly nav = inject(GameRouteContext);
  protected readonly compendium = inject(Smt3CompendiumStore);
  private readonly fusion = inject(Smt3FusionStore);
  private readonly route = inject(ActivatedRoute);

  protected readonly statCells = STAT_CELLS;
  protected readonly affinityElements = SMT3_AFFINITY_ELEMENTS;
  protected readonly inheritElements = SMT3_INHERIT_ELEMENTS;
  protected readonly kindLabel = KIND_LABEL;
  protected readonly unlockLabel = UNLOCK_LABEL;
  protected readonly raceLabel = raceLabel;
  protected readonly inheritRow = inheritRow;

  protected readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('id') ?? '',
  });

  protected readonly demon = computed<Demon | undefined>(() => this.data.demonsById().get(this.id()));
  protected readonly registered = computed(() => this.compendium.entryMap().get(this.id()));

  protected readonly ailments = computed(() => {
    const d = this.demon();
    if (!d) return [];
    return AILMENT_ORDER.filter((a) => d.ailments[a]).map((a) => `${cap(d.ailments[a]!)} ${AILMENT_LABEL[a]}`);
  });

  protected readonly skillRows = computed(() => {
    const d = this.demon();
    if (!d) return [];
    return d.learnedSkills.map((ls) => {
      const skill = this.data.skillsById().get(ls.skillId);
      return {
        id: ls.skillId,
        name: skill?.name ?? ls.skillId,
        element: skill?.element ?? 'passive',
        unique: skill?.unique ?? false,
        acquisition: formatAcquisition(ls),
        innate: ls.kind === 'innate',
      };
    });
  });

  protected readonly evolveTo = computed(() => this.link(this.demon()?.evolvesTo));
  protected readonly evolveFrom = computed(() => this.link(this.demon()?.evolvesFrom));

  protected readonly deathstoneRace = computed(
    () => this.data.data()?.specialRecipes.deathstone.find((f) => f.resultId === this.id())?.race ?? null,
  );

  protected readonly recipes = computed(() => this.fusion.recipesFor(this.id()));
  protected readonly fusionsFrom = computed(() => this.fusion.fusionsFrom(this.id()));

  protected register(d: Demon): void {
    this.compendium.upsert({ demonId: d.id, level: d.level, skillIds: nativeSkills(d) });
  }

  protected cost(d: Demon): string {
    return formatNumber(summonCost(d));
  }

  protected skillName(id: string): string {
    return this.data.skillsById().get(id)?.name ?? id;
  }

  protected ageGender(d: Demon): string {
    return [d.age, d.gender].filter(Boolean).map((s) => cap(s!)).join(' ');
  }

  protected cap(s: string): string {
    return cap(s);
  }

  private link(l: { demonId: string; level: number } | null | undefined) {
    if (!l) return null;
    return { id: l.demonId, name: this.data.demonsById().get(l.demonId)?.name ?? l.demonId, level: l.level };
  }
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
