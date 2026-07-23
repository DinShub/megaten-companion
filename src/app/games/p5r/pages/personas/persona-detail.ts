import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';

import { AffinityGrid } from '../../../../shared/affinity-grid/affinity-grid';
import { InheritMask } from '../../../../shared/inherit-mask/inherit-mask';
import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { CompendiumStore } from '../../compendium/compendium.store';
import { defaultEntryFor } from '../../compendium/quick-add';
import { GameDataService } from '../../data/game-data.service';
import type { LearnedSkill, LearnedTrait, Persona, Shadow, Skill } from '../../model';
import {
  acquisitionOrder,
  formatAcquisition,
  inheritRow,
  STAT_COLUMNS,
  titleCase,
} from '../../ui/format';

const KIND_LABEL: Record<Persona['kind'], string> = {
  normal: 'Fusable',
  special: 'Special',
  treasure: 'Treasure demon',
  party: 'Party',
};

interface SkillRow {
  readonly id: string;
  readonly name: string;
  readonly element: string;
  readonly unique: boolean;
  readonly acquisition: string;
  readonly innate: boolean;
}

/**
 * Persona detail (§4.1, task 20). Every field the header spec lists, plus the
 * cross-links that task 20 gates on: each learned skill → its skill page, the
 * itemization cards → their skills, the shadow counterpart → its entry, advanced
 * recipe ingredients → their personas. The register control links to the
 * compendium (its quick-add prefill lands in Phase 4).
 */
@Component({
  selector: 'app-persona-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AffinityGrid, InheritMask, LoadState],
  template: `
    @if (data.ready()) {
      @if (persona(); as p) {
        <article class="detail">
          <a class="back" [routerLink]="nav.link('personas')"><i class="pi pi-arrow-left" aria-hidden="true"></i> All personas</a>

          <header class="head">
            <div class="head__main">
              <h1 class="head__name">{{ p.name }}</h1>
              <div class="head__meta">
                <span class="tag">{{ titleCase(p.arcana) }}</span>
                <span class="tag">Lv {{ p.level }}</span>
                <span class="tag tag--kind">{{ kindLabel(p.kind) }}</span>
                @if (traitName(p.traitId); as tn) { <span class="tag tag--trait">Trait: {{ tn }}</span> }
              </div>
              @if (p.unlock) {
                <p class="head__unlock"><i class="pi pi-lock" aria-hidden="true"></i> {{ unlockLabel(p.unlock.group) }} — {{ p.unlock.condition }}</p>
              }
              @if (p.prereq) {
                <p class="head__unlock"><i class="pi pi-map-marker" aria-hidden="true"></i> {{ p.prereq }}</p>
              }
            </div>
            <div class="head__actions">
              @if (registered(); as entry) {
                <span class="btn btn--owned"><i class="pi pi-check-circle" aria-hidden="true"></i> Registered · Lv {{ entry.level }}</span>
                <a class="btn" [routerLink]="nav.link('compendium')"><i class="pi pi-pencil" aria-hidden="true"></i> Manage</a>
                <button class="btn" type="button" (click)="unregister(p.id)"><i class="pi pi-times" aria-hidden="true"></i> Unregister</button>
              } @else {
                <button class="btn btn--primary" type="button" (click)="register(p)"><i class="pi pi-plus" aria-hidden="true"></i> Register in compendium</button>
              }
              @if (shadow(); as s) {
                <a class="btn" [routerLink]="nav.link('shadow', s.id)"><i class="pi pi-eye" aria-hidden="true"></i> Shadow entry</a>
              }
            </div>
          </header>

          <div class="cols">
            <section class="panel">
              <h2 class="panel__title">Affinities</h2>
              <app-affinity-grid [affinities]="p.affinities" />
              <h2 class="panel__title">Inherits</h2>
              <app-inherit-mask [allowed]="inheritMask()" />
              <p class="panel__note">Inherit type: <strong>{{ inheritLabel(p.inheritType) }}</strong></p>
            </section>

            <section class="panel">
              <h2 class="panel__title">Stats</h2>
              <div class="stats">
                @for (s of statCols; track s.key) {
                  <div class="stats__cell">
                    <span class="stats__abbr" [title]="s.label">{{ s.abbrev }}</span>
                    <span class="stats__val">{{ p.stats[s.key] }}</span>
                    @if (p.growth) { <span class="stats__grow" title="Growth">+{{ p.growth[s.key] }}</span> }
                  </div>
                }
              </div>
              @if (p.maxStats) { <p class="panel__note">Values shown grow toward level-99 maxima.</p> }
              @else if (!p.growth) { <p class="panel__note">No growth data (party persona).</p> }
            </section>
          </div>

          <section class="panel">
            <h2 class="panel__title">Skills</h2>
            <ul class="skills">
              @for (s of skillRows(); track s.id) {
                <li class="skills__row">
                  <a class="skills__link" [routerLink]="nav.link('skills', s.id)">
                    <span class="el-dot" [attr.data-el]="s.element" aria-hidden="true"></span>
                    <span class="skills__name">{{ s.name }}</span>
                    @if (s.unique) { <i class="pi pi-lock skills__lock" title="Unique — not inheritable" aria-hidden="true"></i> }
                  </a>
                  <span class="skills__acq" [class.is-innate]="s.innate">{{ s.acquisition }}</span>
                </li>
              }
            </ul>
            @if (traitRows().length) {
              <h3 class="panel__sub">Traits</h3>
              <ul class="skills">
                @for (t of traitRows(); track t.id) {
                  <li class="skills__row">
                    <span class="skills__name" [title]="t.description">{{ t.name }}</span>
                    <span class="skills__acq" [class.is-innate]="t.innate">{{ t.acquisition }}</span>
                  </li>
                }
              </ul>
            }
          </section>

          <section class="panel">
            <h2 class="panel__title">Itemization</h2>
            <div class="item">
              <div class="item__col">
                <span class="item__lbl">Normal</span>
                @if (itemCard(p.itemization.normal); as c) {
                  <a class="item__card" [routerLink]="nav.link('skills', c.id)"><span class="el-dot" [attr.data-el]="c.element"></span>{{ c.name }} card</a>
                } @else if (p.itemization.normalItem) {
                  <span class="item__plain">{{ p.itemization.normalItem }}</span>
                } @else { <span class="item__plain">—</span> }
              </div>
              <div class="item__col">
                <span class="item__lbl">Fusion Alarm</span>
                @if (itemCard(p.itemization.alarm); as c) {
                  <a class="item__card" [routerLink]="nav.link('skills', c.id)"><span class="el-dot" [attr.data-el]="c.element"></span>{{ c.name }} card</a>
                } @else if (p.itemization.alarmItem) {
                  <span class="item__plain">{{ p.itemization.alarmItem }}</span>
                } @else { <span class="item__plain">—</span> }
              </div>
            </div>
          </section>

          <section class="panel">
            <h2 class="panel__title">Recipes producing {{ p.name }}</h2>
            @if (advancedIngredients(); as ings) {
              <p class="panel__note">Advanced (special) fusion:</p>
              <div class="reciperow">
                @for (ing of ings; track ing.id; let last = $last) {
                  <a class="pill" [routerLink]="nav.link('personas', ing.id)">{{ ing.name }}</a>
                  @if (!last) { <span class="plus" aria-hidden="true">+</span> }
                }
              </div>
            }
            <p class="panel__note">
              <a class="link" [routerLink]="nav.link('fusion', 'calculator')">Open the fusion calculator</a>
              to enumerate every recipe — full reverse fusion lands with the calculator (Phase 6).
            </p>
          </section>
        </article>
      } @else {
        <div class="missing">
          <p>No persona with id “{{ id() }}”.</p>
          <a class="btn" [routerLink]="nav.link('personas')">Back to personas</a>
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
    .tag--kind { color: var(--p-primary-color); }
    .head__unlock { margin: 0.5rem 0 0; color: var(--p-text-muted-color); font-size: 0.88rem; display: flex; align-items: center; gap: 0.4rem; }
    .head__actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }

    .btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.8rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); border-radius: var(--p-border-radius, 6px); color: var(--p-text-color); text-decoration: none; font-size: 0.9rem; &:hover { border-color: var(--p-primary-color); } }
    .btn--primary { border-color: var(--p-primary-color); color: var(--p-primary-color); }
    .btn--owned { border-color: color-mix(in srgb, #22c55e 55%, transparent); color: #4ade80; cursor: default; }
    button.btn { font: inherit; cursor: pointer; }

    .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1rem; }
    .panel { padding: 1rem 1.15rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.2)); border-radius: var(--p-border-radius, 8px); background: var(--p-surface-800, rgba(127,127,127,0.05)); }
    .panel__title { margin: 0 0 0.6rem; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--p-text-muted-color); }
    .panel__title:not(:first-child) { margin-top: 1.1rem; }
    .panel__sub { margin: 1rem 0 0.5rem; font-size: 0.9rem; }
    .panel__note { margin: 0.6rem 0 0; color: var(--p-text-muted-color); font-size: 0.85rem; }
    .link { color: var(--p-primary-color); }

    .stats { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .stats__cell { display: flex; flex-direction: column; align-items: center; gap: 0.1rem; min-width: 3rem; padding: 0.4rem; border-radius: 6px; background: var(--p-surface-700, rgba(127,127,127,0.12)); }
    .stats__abbr { font-size: 0.7rem; color: var(--p-text-muted-color); }
    .stats__val { font-size: 1.1rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .stats__grow { font-size: 0.72rem; color: var(--p-primary-color); }

    .skills { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .skills__row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.4rem 0; border-top: 1px solid var(--p-content-border-color, rgba(127,127,127,0.12)); &:first-child { border-top: 0; } }
    .skills__link { display: inline-flex; align-items: center; gap: 0.45rem; color: var(--p-text-color); text-decoration: none; &:hover .skills__name { color: var(--p-primary-color); } }
    .skills__name { font-weight: 500; }
    .skills__lock { font-size: 0.7rem; color: var(--p-text-muted-color); }
    .skills__acq { font-size: 0.8rem; color: var(--p-text-muted-color); font-variant-numeric: tabular-nums; }
    .skills__acq.is-innate { color: var(--p-primary-color); }

    .item { display: flex; flex-wrap: wrap; gap: 1.5rem; }
    .item__col { display: flex; flex-direction: column; gap: 0.35rem; }
    .item__lbl { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--p-text-muted-color); }
    .item__card { display: inline-flex; align-items: center; gap: 0.4rem; color: var(--p-text-color); text-decoration: none; &:hover { color: var(--p-primary-color); } }
    .item__plain { color: var(--p-text-muted-color); }

    .reciperow { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
    .pill { padding: 0.25rem 0.6rem; border-radius: 999px; background: var(--p-surface-700, rgba(127,127,127,0.16)); color: var(--p-text-color); text-decoration: none; font-size: 0.85rem; &:hover { color: var(--p-primary-color); } }
    .plus { color: var(--p-text-muted-color); }


    .missing { padding: 3rem 1rem; text-align: center; color: var(--p-text-muted-color); display: flex; flex-direction: column; gap: 1rem; align-items: center; }
  `,
})
export class PersonaDetail {
  protected readonly data = inject(GameDataService);
  protected readonly nav = inject(GameRouteContext);
  private readonly compendium = inject(CompendiumStore);
  private readonly route = inject(ActivatedRoute);

  protected readonly statCols = STAT_COLUMNS;
  protected readonly titleCase = titleCase;

  /** The compendium entry for this persona, if registered (task 30). Reactive. */
  protected readonly registered = computed(() => this.compendium.entryMap().get(this.id()));

  protected register(persona: Persona): void {
    this.compendium.upsert(defaultEntryFor(persona));
  }

  protected unregister(personaId: string): void {
    this.compendium.remove(personaId);
  }

  protected readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('id') ?? '',
  });

  private readonly byId = computed(() => {
    const map = new Map<string, Persona>();
    for (const p of this.data.data()?.personas ?? []) map.set(p.id, p);
    return map;
  });
  private readonly skillsById = computed(() => {
    const map = new Map<string, Skill>();
    for (const s of this.data.data()?.skills ?? []) map.set(s.id, s);
    return map;
  });
  private readonly traitsById = computed(() => {
    const map = new Map<string, { name: string; description: string }>();
    for (const t of this.data.data()?.traits ?? []) map.set(t.id, t);
    return map;
  });

  protected readonly persona = computed<Persona | undefined>(() => this.byId().get(this.id()));

  protected readonly shadow = computed<Shadow | undefined>(() => {
    const id = this.id();
    return this.data.data()?.shadows.find((s) => s.personaId === id);
  });

  protected readonly inheritMask = computed(() => {
    const p = this.persona();
    const matrix = this.data.data()?.inheritMatrix;
    return p && matrix ? inheritRow(matrix, p.inheritType) : {};
  });

  protected readonly skillRows = computed<SkillRow[]>(() => {
    const p = this.persona();
    if (!p) return [];
    return [...p.learnedSkills]
      .sort((a, b) => acquisitionOrder(a) - acquisitionOrder(b))
      .map((ls: LearnedSkill) => {
        const skill = this.skillsById().get(ls.skillId);
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

  protected readonly traitRows = computed(() => {
    const p = this.persona();
    if (!p) return [];
    return [...p.learnedTraits]
      .sort((a, b) => acquisitionOrder(a) - acquisitionOrder(b))
      .map((lt: LearnedTrait) => {
        const trait = this.traitsById().get(lt.traitId);
        return {
          id: lt.traitId,
          name: trait?.name ?? lt.traitId,
          description: trait?.description ?? '',
          acquisition: formatAcquisition(lt),
          innate: lt.kind === 'innate',
        };
      });
  });

  protected readonly advancedIngredients = computed(() => {
    const p = this.persona();
    const recipes = this.data.data()?.advancedRecipes.recipes;
    if (!p || !recipes) return null;
    const recipe = recipes.find((r) => r.resultId === p.id);
    if (!recipe) return null;
    return recipe.ingredientIds.map((id) => ({ id, name: this.byId().get(id)?.name ?? id }));
  });

  protected itemCard(skillId: string | null): { id: string; name: string; element: string } | null {
    if (!skillId) return null;
    const skill = this.skillsById().get(skillId);
    return skill ? { id: skill.id, name: skill.name, element: skill.element } : null;
  }

  protected traitName(id: string | null): string | null {
    if (!id) return null;
    return this.traitsById().get(id)?.name ?? id;
  }

  protected kindLabel(kind: Persona['kind']): string {
    return KIND_LABEL[kind];
  }

  protected inheritLabel(type: string): string {
    return type === 'none' ? 'None' : titleCase(type);
  }

  protected unlockLabel(group: string): string {
    return group === 'dlc' ? 'DLC' : titleCase(group);
  }
}
