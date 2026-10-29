import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { PersonaPicker } from '../../../../shared/persona-picker/persona-picker';
import { SkillChip } from '../../../../shared/skill-chip/skill-chip';
import { P3rDataService } from '../../data/p3r-data.service';
import type { Skill } from '../../model';
import {
  findRoutes,
  MAX_WANTED_SKILLS,
  type Objective,
  type PoolMode,
  type RouteNode,
  type RouteSearchResult,
  routeSteps,
} from '../../routing/p3r-route-finder';
import { formatNumber, arcanaLabel } from '../../ui/p3r-format';
import { P3rFusionStore } from './p3r-fusion.store';

const OBJECTIVES: readonly { id: Objective; label: string }[] = [
  { id: 'fewest-steps', label: 'Fewest fusions' },
  { id: 'cheapest', label: 'Cheapest' },
  { id: 'fewest-unowned', label: 'Fewest unowned' },
];

/**
 * Route finder: pick a target and the skills you want it to end up with; get
 * ranked fusion trees built from your compendium (and, optionally, any fusable
 * persona at your level), each as a numbered `A + B → C` list
 * with how every wanted skill gets there. `?target=<id>` deep-links a target.
 */
@Component({
  selector: 'app-p3r-route-finder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState, PersonaPicker, SkillChip],
  template: `
    @if (data.ready()) {
      <div class="p3-page">
        <div class="p3-cols">
          <section class="p3-panel rf__inputs">
            <h2>Target</h2>
            @if (target(); as t) {
              <div class="rf__chip">
                <a class="p3-strong" [routerLink]="nav.link('personas', t.id)">{{ t.name }}</a>
                <span class="p3-muted">{{ arcanaLabel(t.arcana) }} · Lv {{ t.level }}</span>
                <button type="button" class="p3-linkbtn" (click)="setTarget(null)" aria-label="Change target"><i class="pi pi-times" aria-hidden="true"></i></button>
              </div>
            } @else {
              <app-persona-picker [options]="store.pickerOptions()" [compendiumOnly]="false" placeholder="Which persona do you want?" (picked)="setTarget($event.id)" />
            }

            <h2>Wanted skills <small class="p3-muted">({{ wanted().length }}/{{ maxSkills }})</small></h2>
            <div class="p3-pills">
              @for (s of wantedSkills(); track s.id) {
                <button type="button" class="rf__skill" (click)="toggleSkill(s.id)" [attr.aria-label]="'Remove ' + s.name">
                  <app-skill-chip [name]="s.name" [element]="s.element" [unique]="s.unique" /> <i class="pi pi-times" aria-hidden="true"></i>
                </button>
              }
            </div>
            @if (wanted().length < maxSkills) {
              <span class="p3-search rf__skillsearch">
                <i class="pi pi-plus" aria-hidden="true"></i>
                <input type="text" placeholder="Add a skill…" aria-label="Add a wanted skill" [value]="skillQuery()" (input)="skillQuery.set($any($event.target).value)" />
              </span>
              @if (skillMatches().length) {
                <div class="p3-pills rf__matches">
                  @for (s of skillMatches(); track s.id) {
                    <button type="button" class="rf__skill" (click)="toggleSkill(s.id)"><app-skill-chip [name]="s.name" [element]="s.element" [unique]="s.unique" /></button>
                  }
                </div>
              }
            }
          </section>

          <section class="p3-panel rf__inputs">
            <h2>Pool</h2>
            <div class="p3-seg" role="group" aria-label="Pool">
              <button type="button" [class.is-on]="pool() === 'compendium'" (click)="pool.set('compendium')">My compendium</button>
              <button type="button" [class.is-on]="pool() === 'available'" (click)="pool.set('available')">+ personas at my level</button>
            </div>
            <p class="p3-note">Adds every fusable persona at or below your protagonist level (Lv {{ store.protagonistLevel() }}) — the ones Shuffle Time or an early fusion can hand you.</p>
            <h2>Rank by</h2>
            <div class="p3-seg" role="group" aria-label="Rank by">
              @for (o of objectives; track o.id) {
                <button type="button" [class.is-on]="objective() === o.id" (click)="objective.set(o.id)">{{ o.label }}</button>
              }
            </div>
            <h2>Max fusions deep</h2>
            <select class="p3-select" aria-label="Max depth" [value]="depth()" (change)="depth.set(+$any($event.target).value)">
              @for (d of depths; track d) { <option [value]="d" [selected]="d === depth()">{{ d }}</option> }
            </select>
            @if (depth() > 3) { <p class="p3-note">Deeper searches take longer and may stop at the time budget.</p> }
            <div class="rf__go">
              <button type="button" class="p3-btn p3-btn--primary" [disabled]="!target() || searching()" (click)="search()">
                <i class="pi" [class.pi-search]="!searching()" [class.pi-spin]="searching()" [class.pi-spinner]="searching()" aria-hidden="true"></i>
                {{ searching() ? 'Searching…' : 'Find routes' }}
              </button>
            </div>
          </section>
        </div>

        @if (result(); as res) {
          @for (p of res.problems; track p) { <p class="p3-warn" role="alert"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i> {{ p }}</p> }
          @if (res.incomplete) { <p class="p3-warn"><i class="pi pi-clock" aria-hidden="true"></i> The search hit its time budget — these are the best found so far.</p> }
          @if (res.routes.length) {
            <p class="p3-muted">{{ res.routes.length }} route{{ res.routes.length === 1 ? '' : 's' }} in {{ res.elapsedMs }} ms.</p>
          }
          @for (r of res.routes; track $index; let i = $index) {
            <section class="p3-panel rf__route" [class.is-complete]="r.complete">
              <header class="rf__head">
                <strong>Route {{ i + 1 }}</strong>
                <span class="p3-tag">{{ r.steps }} fusion{{ r.steps === 1 ? '' : 's' }}</span>
                <span class="p3-tag">¥{{ formatNumber(r.cost) }} recall</span>
                <span class="p3-tag">{{ r.unowned }} not owned</span>
                @if (wanted().length) { <span class="p3-tag" [class.p3-tag--accent]="r.complete">{{ satisfied(r) }}/{{ wanted().length }} skills</span> }
              </header>
              @if (r.steps === 0) {
                <p class="p3-muted">Already in your compendium — recall it.</p>
              }
              <ol class="rf__steps">
                @for (s of steps(r.tree); track $index) {
                  <li>
                    @for (n of s.ingredients; track $index; let last = $last) {
                      <a [routerLink]="nav.link('personas', id(n))" [class.is-leaf]="n.kind === 'leaf'">{{ store.personaName(id(n)) }}</a>
                      @if (n.kind === 'leaf') { <small class="p3-muted">{{ n.owned ? 'owned' : 'get' }}</small> }
                      @if (!last) { <span class="p3-plus">+</span> }
                    }
                    <span class="p3-plus">→</span>
                    <a class="p3-strong" [routerLink]="nav.link('personas', s.resultId)">{{ store.personaName(s.resultId) }}</a>
                  </li>
                }
              </ol>
              @for (a of r.assignments; track a.skillId) {
                @if (!a.satisfied) { <p class="p3-note"><i class="pi pi-times-circle" aria-hidden="true"></i> {{ a.reason }}</p> }
              }
            </section>
          }
          <p class="p3-note">Skill carry assumes every eligible skill can pass through a fusion; how many the game actually passes on per fusion isn't modelled upstream.</p>
        }
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .rf__inputs { display: flex; flex-direction: column; gap: 0.5rem; h2 { margin-bottom: 0; } }
    .rf__chip { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.6rem; .p3-linkbtn { margin-left: auto; } }
    .rf__skill { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0; border: 0; background: transparent; color: var(--p-text-muted-color); cursor: pointer; font: inherit; }
    .rf__skillsearch { flex: 0 0 auto; }
    .rf__go { margin-top: 0.5rem; }
    .rf__route { display: flex; flex-direction: column; gap: 0.5rem; &.is-complete { border-color: var(--p-primary-color); } }
    .rf__head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
    .rf__steps { margin: 0; padding-left: 1.4rem; display: flex; flex-direction: column; gap: 0.3rem;
      li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.35rem; }
      a { text-decoration: none; } a.is-leaf { color: var(--p-text-color); } small { font-size: 0.72rem; } }
  `,
})
export class P3rRouteFinder {
  protected readonly data = inject(P3rDataService);
  protected readonly store = inject(P3rFusionStore);
  protected readonly nav = inject(GameRouteContext);
  private readonly route = inject(ActivatedRoute);

  protected readonly arcanaLabel = arcanaLabel;
  protected readonly formatNumber = formatNumber;
  protected readonly objectives = OBJECTIVES;
  protected readonly depths = [1, 2, 3, 4, 5];
  protected readonly maxSkills = MAX_WANTED_SKILLS;
  protected readonly steps = routeSteps;

  protected readonly targetId = signal<string | null>(this.route.snapshot.queryParamMap.get('target'));
  protected readonly wanted = signal<string[]>([]);
  protected readonly skillQuery = signal('');
  protected readonly pool = signal<PoolMode>('compendium');
  protected readonly objective = signal<Objective>('fewest-steps');
  protected readonly depth = signal(3);
  protected readonly searching = signal(false);
  protected readonly result = signal<RouteSearchResult | null>(null);

  protected readonly target = computed(() => {
    const id = this.targetId();
    return id ? this.store.persona(id) : undefined;
  });

  protected readonly wantedSkills = computed(() =>
    this.wanted().map((id) => this.store.skill(id)).filter((s): s is Skill => s != null),
  );

  protected readonly skillMatches = computed(() => {
    const q = this.skillQuery().trim().toLowerCase();
    if (q.length < 2) return [];
    const chosen = new Set(this.wanted());
    return (this.data.data()?.skills ?? [])
      .filter((s) => !chosen.has(s.id) && s.name.toLowerCase().includes(q))
      .slice(0, 12);
  });

  protected setTarget(id: string | null): void {
    this.targetId.set(id);
    this.result.set(null);
  }

  protected toggleSkill(id: string): void {
    this.wanted.update((w) => (w.includes(id) ? w.filter((x) => x !== id) : w.length < MAX_WANTED_SKILLS ? [...w, id] : w));
    this.skillQuery.set('');
  }

  protected search(): void {
    const engine = this.store.engine();
    const data = this.data.data();
    const targetId = this.targetId();
    if (!engine || !data || !targetId) return;
    this.searching.set(true);
    // Yield a frame so the "Searching…" state paints before the synchronous search runs.
    setTimeout(() => {
      this.result.set(
        findRoutes(engine, data, this.store.ctx(), {
          targetId,
          skillIds: this.wanted(),
          objective: this.objective(),
          maxDepth: this.depth(),
          pool: this.pool(),
        }),
      );
      this.searching.set(false);
    });
  }

  protected id(n: RouteNode): string {
    return n.kind === 'leaf' ? n.personaId : n.resultId;
  }

  protected satisfied(r: { assignments: readonly { satisfied: boolean }[] }): number {
    return r.assignments.filter((a) => a.satisfied).length;
  }
}
