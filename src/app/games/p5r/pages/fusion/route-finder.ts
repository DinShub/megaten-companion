import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { LoadState } from '../../../../shared/load-state/load-state';
import { PersonaPicker, type PickerOption } from '../../../../shared/persona-picker/persona-picker';
import { GameDataService } from '../../data/game-data.service';
import type { PoolMode } from '../../fusion';
import { DEFAULT_MAX_DEPTH } from '../../routing';
import type { Objective } from '../../routing';
import { SKILL_ELEMENT_NAMES } from '../../ui/format';
import { FusionStore } from './fusion.store';
import { RouteFinderStore } from './route-finder.store';
import { RouteCard } from './route-card';

const OBJECTIVE_LABELS: Record<Objective, string> = {
  'fewest-steps': 'Fewest steps',
  cheapest: 'Cheapest',
  'fewest-unowned': 'Fewest unowned',
};

interface SkillChip {
  readonly id: string;
  readonly name: string;
  readonly element: string;
}

/**
 * Route finder (§4.7.3, §7, task 52) — the headline feature. Pick a target and
 * the skills you want on it; the search (in a Web Worker) returns ranked fusion
 * trees, each a full recipe with per-step skill-carry annotations, ownership
 * badges, unlock conditions, and typed diagnostics for anything it can't deliver.
 * Never a dead end: a route missing a skill is shown, ranked below complete
 * routes, with the gap explained (§7.4).
 *
 * All three objective metrics (steps / yen / unowned) are shown for every route
 * regardless of which one is sorting them, so the trade-off is eyeballable
 * without re-running (§7.3).
 */
@Component({
  selector: 'app-route-finder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadState, PersonaPicker, RouteCard],
  template: `
    @if (data.ready()) {
      <div class="rf">
        <section class="controls">
          <div class="ctl ctl--wide">
            <span class="ctl__label">Target persona</span>
            <app-persona-picker
              [options]="fusion.pickerOptions()"
              [(compendiumOnly)]="rosterMode"
              placeholder="Persona you want to build…"
              (picked)="onTarget($event.id)"
            />
          </div>

          <div class="ctl ctl--wide">
            <span class="ctl__label">Desired skills <small>optional</small></span>
            <app-persona-picker
              [options]="skillOptions()"
              placeholder="Add a skill to carry…"
              (picked)="addSkill($event.id)"
            />
            @if (skillChips().length) {
              <div class="chips">
                @for (s of skillChips(); track s.id) {
                  <button type="button" class="chip" (click)="removeSkill(s.id)">
                    <span class="el-dot" [attr.data-el]="s.element" aria-hidden="true"></span>{{ s.name }}
                    <i class="pi pi-times" aria-hidden="true"></i>
                  </button>
                }
              </div>
            }
          </div>

          <div class="ctl">
            <span class="ctl__label">Objective</span>
            <div class="seg" role="group" aria-label="Objective">
              @for (o of objectives; track o) {
                <button type="button" class="seg__btn" [class.is-on]="objective() === o" (click)="objective.set(o)">{{ objLabel(o) }}</button>
              }
            </div>
          </div>

          <div class="ctl">
            <span class="ctl__label">Parent pool</span>
            <div class="seg" role="group" aria-label="Pool">
              <button type="button" class="seg__btn" [class.is-on]="pool() === 'compendium'" (click)="pool.set('compendium')">Compendium</button>
              <button type="button" class="seg__btn" [class.is-on]="pool() === 'obtainable'" (click)="pool.set('obtainable')">Obtainable</button>
            </div>
          </div>

          <div class="ctl">
            <span class="ctl__label">Max depth</span>
            <div class="depth">
              <button type="button" class="step" (click)="setDepth(-1)" [disabled]="maxDepth() <= 1" aria-label="Fewer">−</button>
              <span class="depth__val">{{ maxDepth() }}</span>
              <button type="button" class="step" (click)="setDepth(1)" [disabled]="maxDepth() >= 4" aria-label="More">+</button>
            </div>
          </div>

          <div class="ctl ctl--go">
            @if (store.searching()) {
              <button type="button" class="btn btn--cancel" (click)="store.cancel()"><i class="pi pi-times" aria-hidden="true"></i> Cancel</button>
            } @else {
              <button type="button" class="btn btn--go" [disabled]="!targetId()" (click)="find()"><i class="pi pi-sitemap" aria-hidden="true"></i> Find routes</button>
            }
          </div>
        </section>

        @if (maxDepth() >= 4) {
          <p class="hint"><i class="pi pi-clock" aria-hidden="true"></i> Depth 4 explores far more combinations — the search can take a few seconds.</p>
        }

        @if (store.searching()) {
          <p class="status"><i class="pi pi-spin pi-spinner" aria-hidden="true"></i> Searching fusion routes…</p>
        }
        @if (store.error(); as e) {
          <p class="warn" role="alert"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i> {{ e }}</p>
        }

        @if (store.result(); as res) {
          @if (res.incomplete) {
            <p class="warn"><i class="pi pi-clock" aria-hidden="true"></i> Search hit its time budget — showing the best routes found so far, which may be incomplete.</p>
          }

          @if (res.routes.length) {
            <div class="summary">
              <span>{{ res.routes.length }} {{ res.routes.length === 1 ? 'route' : 'routes' }}</span>
              @if (res.truncated) { <span class="muted">· more exist, showing the top {{ res.routes.length }}</span> }
              <span class="muted">· explored {{ res.nodesExpanded }} options in {{ res.elapsedMs }} ms</span>
            </div>

            <ol class="routes">
              @for (route of res.routes; track $index; let i = $index) {
                <li><app-route-card [route]="route" [objective]="objective()" [rank]="i + 1" [asked]="askedSkills()" /></li>
              }
            </ol>
          } @else {
            <section class="deadend">
              <i class="pi pi-map deadend__icon" aria-hidden="true"></i>
              <div>
                <p class="deadend__title">No route found — here's why:</p>
                <ul class="deadend__list">
                  @for (d of res.diagnostics; track $index) { <li>{{ d.message }}</li> }
                </ul>
              </div>
            </section>
          }
        } @else if (!store.searching()) {
          <p class="prompt">Pick a target, add any skills you want it to carry, then <strong>Find routes</strong>.</p>
        }
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .rf { display: flex; flex-direction: column; gap: 1.1rem; }
    .controls { display: flex; flex-wrap: wrap; gap: 0.9rem 1.1rem; align-items: flex-end; padding: 1rem 1.15rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.25)); border-radius: 10px; background: var(--p-surface-800, rgba(127,127,127,0.05)); }
    .ctl { display: flex; flex-direction: column; gap: 0.4rem; }
    .ctl--wide { flex: 1 1 20rem; min-width: 16rem; }
    .ctl--go { margin-left: auto; }
    .ctl__label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--p-text-muted-color); small { text-transform: none; letter-spacing: 0; opacity: 0.7; } }

    .seg { display: inline-flex; gap: 0.2rem; padding: 0.2rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.25)); border-radius: 999px; }
    .seg__btn { padding: 0.35rem 0.7rem; border: 0; border-radius: 999px; background: transparent; color: var(--p-text-muted-color); font: inherit; font-size: 0.82rem; white-space: nowrap; cursor: pointer; &:hover { color: var(--p-text-color); } &.is-on { background: var(--p-primary-color); color: var(--p-primary-contrast-color, #fff); } }

    .depth { display: inline-flex; align-items: center; gap: 0.5rem; }
    .step { width: 2rem; height: 2rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); border-radius: 6px; background: transparent; color: var(--p-text-color); font: inherit; font-size: 1.1rem; cursor: pointer; &:disabled { opacity: 0.4; cursor: default; } }
    .depth__val { font-variant-numeric: tabular-nums; min-width: 1ch; text-align: center; }

    .btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.55rem 1.1rem; border: 0; border-radius: 8px; font: inherit; font-weight: 600; cursor: pointer; }
    .btn--go { background: var(--p-primary-color); color: var(--p-primary-contrast-color, #fff); &:disabled { opacity: 0.5; cursor: default; } }
    .btn--cancel { background: var(--p-surface-700, rgba(127,127,127,0.2)); color: var(--p-text-color); }

    .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .chip { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.55rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); border-radius: 999px; background: transparent; color: var(--p-text-color); font: inherit; font-size: 0.82rem; cursor: pointer; .pi-times { font-size: 0.7rem; color: var(--p-text-muted-color); } &:hover { border-color: var(--p-primary-color); } }

    .hint, .status { display: flex; align-items: center; gap: 0.45rem; margin: 0; color: var(--p-text-muted-color); font-size: 0.88rem; }
    .warn { display: flex; align-items: center; gap: 0.45rem; margin: 0; padding: 0.55rem 0.75rem; border-radius: 6px; background: color-mix(in srgb, #f59e0b 13%, transparent); font-size: 0.88rem; }

    .summary { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: baseline; font-size: 0.88rem; }
    .muted { color: var(--p-text-muted-color); }

    .routes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.85rem; }

    .deadend { display: flex; gap: 0.8rem; padding: 1rem 1.15rem; border-radius: 8px; background: color-mix(in srgb, #f59e0b 10%, transparent); }
    .deadend__icon { font-size: 1.4rem; color: #f59e0b; }
    .deadend__title { margin: 0 0 0.3rem; font-weight: 600; }
    .deadend__list { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; }
    .prompt { color: var(--p-text-muted-color); padding: 1.5rem 0; text-align: center; }
  `,
})
export class RouteFinder {
  protected readonly data = inject(GameDataService);
  protected readonly store = inject(RouteFinderStore);
  protected readonly fusion = inject(FusionStore);

  protected readonly objectives: readonly Objective[] = ['fewest-steps', 'cheapest', 'fewest-unowned'];

  protected readonly targetId = signal<string | null>(null);
  /** Target picker starts on the full roster — you're usually building an unowned goal. */
  protected readonly rosterMode = signal(false);
  protected readonly skillIds = signal<string[]>([]);
  protected readonly objective = signal<Objective>('fewest-steps');
  protected readonly pool = signal<PoolMode>('compendium');
  protected readonly maxDepth = signal(DEFAULT_MAX_DEPTH);

  protected readonly askedSkills = computed(() => this.skillIds().length);

  /** All skills as picker options, subtitled by element (the itemization picker trick). */
  protected readonly skillOptions = computed<PickerOption[]>(() =>
    (this.data.data()?.skills ?? []).map((s) => ({ id: s.id, name: s.name, arcana: this.elementName(s.element) })),
  );

  protected readonly skillChips = computed<SkillChip[]>(() =>
    this.skillIds().map((id) => {
      const skill = this.fusion.skill(id);
      return { id, name: skill?.name ?? id, element: skill?.element ?? 'passive' };
    }),
  );

  // ---- input handlers ---------------------------------------------------

  protected onTarget(id: string): void {
    this.targetId.set(id);
    this.store.reset(); // last search was for a different target
  }

  protected addSkill(id: string): void {
    this.skillIds.update((ids) => (ids.includes(id) ? ids : [...ids, id]));
  }

  protected removeSkill(id: string): void {
    this.skillIds.update((ids) => ids.filter((s) => s !== id));
  }

  protected setDepth(delta: number): void {
    this.maxDepth.update((d) => Math.min(4, Math.max(1, d + delta)));
  }

  protected find(): void {
    const targetId = this.targetId();
    if (!targetId) return;
    this.store.search(
      { targetId, skillIds: this.skillIds(), objective: this.objective(), maxDepth: this.maxDepth() },
      this.pool(),
    );
  }

  // ---- display helpers --------------------------------------------------

  protected objLabel(o: Objective): string {
    return OBJECTIVE_LABELS[o];
  }

  protected elementName(el: string): string {
    return SKILL_ELEMENT_NAMES[el as keyof typeof SKILL_ELEMENT_NAMES] ?? el;
  }
}
