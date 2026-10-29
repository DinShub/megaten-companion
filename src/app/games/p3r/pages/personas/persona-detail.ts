import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';

import { AffinityGrid } from '../../../../shared/affinity-grid/affinity-grid';
import { GameRouteContext } from '../../../../shared/game-route';
import { InheritMask } from '../../../../shared/inherit-mask/inherit-mask';
import { LoadState } from '../../../../shared/load-state/load-state';
import { P3rCompendiumStore } from '../../compendium/p3r-compendium.store';
import { P3rDataService } from '../../data/p3r-data.service';
import { nativeSkills, summonCost } from '../../fusion';
import type { Persona } from '../../model';
import {
  arcanaLabel,
  formatAcquisition,
  formatNumber,
  inheritTypeLabel,
  inheritRow,
  KIND_LABEL,
  P3R_AFFINITY_ELEMENTS,
  P3R_INHERIT_ELEMENTS,
  STAT_COLUMNS,
  UNLOCK_LABEL,
} from '../../ui/p3r-format';
import { P3rRecipeTable } from '../../ui/p3r-recipe-table';
import { P3rFusionStore } from '../fusion/p3r-fusion.store';

/**
 * Persona detail: everything a companion needs on one page — stats, affinities,
 * the inheritance type, the learn-set (each skill linked, Theurgies marked), its
 * heart item, how to obtain it (its special recipe or every pair), and every
 * fusion it takes part in.
 */
@Component({
  selector: 'app-persona-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AffinityGrid, InheritMask, LoadState, P3rRecipeTable],
  template: `
    @if (data.ready()) {
      @if (persona(); as d) {
        <article class="p3-page">
          <a class="p3-back" [routerLink]="nav.link('personas')"><i class="pi pi-arrow-left" aria-hidden="true"></i> All personas</a>

          <header class="p3-detail-head">
            <div>
              <h1>{{ d.name }}</h1>
              <div class="p3-tags">
                <span class="p3-tag">{{ arcanaLabel(d.arcana) }}</span>
                <span class="p3-tag">Lv {{ d.level }}</span>
                <span class="p3-tag p3-tag--accent">{{ kindLabel[d.kind] }}</span>
              </div>
              @if (d.unlock) {
                <p class="p3-line"><i class="pi pi-lock" aria-hidden="true"></i> {{ unlockLabel[d.unlock.group] }} — {{ d.unlock.condition }}</p>
              }
            </div>
            <div class="p3-actions">
              @if (registered(); as entry) {
                <span class="p3-btn p3-btn--owned"><i class="pi pi-check-circle" aria-hidden="true"></i> Registered · Lv {{ entry.level }}</span>
                <a class="p3-btn" [routerLink]="nav.link('compendium')" [queryParams]="{ edit: d.id }"><i class="pi pi-pencil" aria-hidden="true"></i> Manage</a>
                <button class="p3-btn" type="button" (click)="compendium.remove(d.id)"><i class="pi pi-times" aria-hidden="true"></i> Unregister</button>
              } @else {
                <button class="p3-btn p3-btn--primary" type="button" (click)="register(d)"><i class="pi pi-plus" aria-hidden="true"></i> Register in compendium</button>
              }
              <a class="p3-btn" [routerLink]="nav.link('fusion', 'route')" [queryParams]="{ target: d.id }"><i class="pi pi-sitemap" aria-hidden="true"></i> Find a route</a>
            </div>
          </header>

          <div class="p3-cols">
            <section class="p3-panel">
              <h2>Affinities</h2>
              <app-affinity-grid [affinities]="d.affinities" [elements]="affinityElements" />
              <h2>Can inherit</h2>
              <app-inherit-mask [allowed]="inheritRow(matrix(), d.inheritType)" [elements]="inheritElements" />
              <p class="p3-note">{{ inheritLabel(d.inheritType) }} inheritance type. Ticked skill elements can pass to {{ d.name }} in a fusion; Almighty, special and passive skills always can.</p>
            </section>

            <section class="p3-panel">
              <h2>Stats</h2>
              <dl class="p3-meters">
                @for (s of statCols; track s.key) {
                  <div [title]="s.label">
                    <dt>{{ s.abbrev }}</dt>
                    <dd><span class="p3-num">{{ d.stats[s.key] }}</span><span class="p3-meter" [style.--v]="d.stats[s.key]" aria-hidden="true"></span></dd>
                  </div>
                }
              </dl>
              <p class="p3-note">Est. compendium recall cost: ¥{{ cost(d) }} (upstream's formula from base stats).</p>
              @if (d.heartItem; as h) {
                <p class="p3-line"><i class="pi pi-heart" aria-hidden="true"></i> Heart item: <strong>{{ h.name }}</strong> at Lv {{ h.level }}</p>
              }
            </section>
          </div>

          <section class="p3-panel">
            <h2>Skills</h2>
            <ul class="p3-list">
              @for (s of skillRows(); track s.id) {
                <li>
                  <a [routerLink]="nav.link('skills', s.id)">
                    <span class="el-dot" [attr.data-el]="s.element" aria-hidden="true"></span>
                    <span>{{ s.name }}</span>
                    @if (s.unique) { <i class="pi pi-lock p3-muted" title="Unique — not inheritable" aria-hidden="true"></i> }
                  </a>
                  <span class="p3-side" [class.is-accent]="s.innate">{{ s.acquisition }}</span>
                </li>
              }
            </ul>
            @if (hasTheurgy()) {
              <p class="p3-note">A Theurgy is the protagonist's: it becomes available while {{ d.name }} is in the stock, and is never inherited.</p>
            }
          </section>

          <section class="p3-panel">
            <h2>How to obtain</h2>
            @if (special(); as s) {
              <p>
                Special fusion of all {{ s.ingredientIds.length }} at once:
                @for (id of s.ingredientIds; track id; let last = $last) {
                  <a [routerLink]="nav.link('personas', id)">{{ personaName(id) }}</a>{{ last ? '.' : ' + ' }}
                }
              </p>
            } @else {
              <app-p3r-recipe-table [recipes]="recipes()" mode="reverse" [empty]="'No pair makes ' + d.name + ' under the current unlock settings.'" />
            }
          </section>

          <section class="p3-panel">
            <h2>Fuses into</h2>
            <p class="p3-note">Every result of fusing {{ d.name }} with one other persona.</p>
            <app-p3r-recipe-table [recipes]="fusionsFrom()" mode="forward" [empty]="d.name + ' fuses with nothing under the current unlock settings.'" />
          </section>
        </article>
      } @else {
        <div class="p3-missing">
          <p>Lookup failed: no persona with id “{{ id() }}” on file.</p>
          <a class="p3-btn" [routerLink]="nav.link('personas')">Back to personas</a>
        </div>
      }
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
})
export class PersonaDetail {
  protected readonly data = inject(P3rDataService);
  protected readonly nav = inject(GameRouteContext);
  protected readonly compendium = inject(P3rCompendiumStore);
  private readonly fusion = inject(P3rFusionStore);
  private readonly route = inject(ActivatedRoute);

  protected readonly statCols = STAT_COLUMNS;
  protected readonly affinityElements = P3R_AFFINITY_ELEMENTS;
  protected readonly inheritElements = P3R_INHERIT_ELEMENTS;
  protected readonly kindLabel = KIND_LABEL;
  protected readonly unlockLabel = UNLOCK_LABEL;
  protected readonly inheritLabel = inheritTypeLabel;
  protected readonly arcanaLabel = arcanaLabel;
  protected readonly inheritRow = inheritRow;
  protected readonly matrix = this.fusion.inheritMatrix;

  protected readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('id') ?? '',
  });

  protected readonly persona = computed<Persona | undefined>(() => this.data.personasById().get(this.id()));
  protected readonly registered = computed(() => this.compendium.entryMap().get(this.id()));

  protected readonly skillRows = computed(() => {
    const d = this.persona();
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

  protected readonly hasTheurgy = computed(() => this.persona()?.learnedSkills.some((s) => s.kind === 'theurgy') ?? false);

  protected readonly special = computed(() => this.fusion.specialFor(this.id()));
  protected readonly recipes = computed(() => this.fusion.recipesFor(this.id()));
  protected readonly fusionsFrom = computed(() => this.fusion.fusionsFrom(this.id()));

  protected register(d: Persona): void {
    this.compendium.upsert({ personaId: d.id, level: d.level, skillIds: nativeSkills(d) });
  }

  protected cost(d: Persona): string {
    return formatNumber(summonCost(d));
  }

  protected personaName(id: string): string {
    return this.data.personasById().get(id)?.name ?? id;
  }
}
