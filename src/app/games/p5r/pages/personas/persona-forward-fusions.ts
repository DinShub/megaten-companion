import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { OwnershipBadge } from '../../../../shared/ownership-badge/ownership-badge';
import type { FusionPath } from '../../fusion';
import type { Persona } from '../../model';
import { titleCase } from '../../ui/format';
import { FusionStore } from '../fusion/fusion.store';

const PATH_BADGE: Record<FusionPath, string> = {
  'different-arcana': 'Standard',
  'same-arcana': 'Same arcana',
  treasure: 'Treasure',
  advanced: 'Advanced',
};

/** How many partner chips a result shows before the "+N more" affordance. */
const PARTNER_CAP = 12;

/** One partner persona reached alongside the viewed persona to make a result. */
interface Partner {
  readonly id: string;
  readonly name: string;
  readonly arcana: string;
  readonly level: number;
  readonly owned: boolean;
  readonly ownedLevel: number | null;
  readonly path: FusionPath;
}

/** Every `ThisPersona + partner → result` grouped under the produced result. */
interface ResultGroup {
  readonly resultId: string;
  readonly name: string;
  readonly arcana: string;
  readonly level: number;
  readonly owned: boolean;
  readonly ownedLevel: number | null;
  /** At least one partner is registered — a fusion you can do right now. */
  readonly canDoNow: boolean;
  /** Result outranks the protagonist while the level cap is enforced (§6.3). */
  readonly capped: boolean;
  /** Distinct fusion paths that reach this result from the viewed persona. */
  readonly paths: readonly FusionPath[];
  /** Partners, owned-first then level/name (§4.7.2 ordering). */
  readonly partners: readonly Partner[];
}

/**
 * The forward-fusion complement of the "Recipes producing X" panel: every result
 * the viewed persona can *make* when used as a fusion ingredient (§6, the forward
 * side of {@link FusionEngine.recipesFor}). Reads the pure engine's `fusionsFrom`
 * through the {@link FusionStore} seam and groups the flat `P + X → Y` list by
 * result so a persona that produces dozens of results stays scannable — one row
 * per result, its partners as chips beneath.
 *
 * Self-contained: it takes only a `personaId` and injects the store + route
 * context, so `persona-detail` can drop it in as `<app-persona-forward-fusions
 * [personaId]="p.id" />` without wiring anything.
 */
@Component({
  selector: 'app-persona-forward-fusions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OwnershipBadge],
  template: `
    <section class="panel">
      <h2 class="panel__title">Fusions using {{ parentName() }}</h2>

      @if (store.engine()) {
        @if (isParty()) {
          <p class="note">
            <i class="pi pi-info-circle" aria-hidden="true"></i>
            Party personas can't be used as fusion material, so {{ parentName() }} produces no fusions.
          </p>
        } @else if (groups(); as gs) {
          @if (gs.length) {
            <p class="lead">
              {{ parentName() }} + another persona makes <strong>{{ gs.length }}</strong>
              {{ gs.length === 1 ? 'persona' : 'personas' }}.
              @if (readyCount(); as ready) {
                <span class="lead__ready"><i class="pi pi-check" aria-hidden="true"></i> {{ ready }} ready with a partner you own</span>
              }
            </p>

            <ul class="groups">
              @for (g of gs; track g.resultId) {
                <li class="grp" [class.grp--ready]="g.canDoNow">
                  <div class="grp__head">
                    <a class="grp__result" [routerLink]="nav.link('personas', g.resultId)">
                      <span class="grp__name">{{ g.name }}</span>
                      <span class="grp__meta">{{ g.arcana }} · Lv {{ g.level }}</span>
                    </a>
                    <div class="grp__tags">
                      <app-ownership-badge [registered]="g.owned" [level]="g.ownedLevel" />
                      @for (p of g.paths; track p) {
                        <span class="badge-path" [attr.data-path]="p">{{ pathBadge(p) }}</span>
                      }
                      @if (g.capped) {
                        <span class="badge-cap" title="Above your protagonist's level"><i class="pi pi-lock" aria-hidden="true"></i> Lv {{ g.level }}</span>
                      }
                      @if (g.canDoNow) {
                        <span class="ready"><i class="pi pi-check" aria-hidden="true"></i> Ready</span>
                      }
                    </div>
                  </div>

                  <div class="grp__partners">
                    <span class="grp__with">with</span>
                    @for (pt of visiblePartners(g); track pt.id) {
                      <a class="chip" [class.chip--owned]="pt.owned" [routerLink]="nav.link('personas', pt.id)">
                        <span class="chip__name">{{ pt.name }}</span>
                        <span class="chip__lv">Lv {{ pt.level }}</span>
                        @if (g.paths.length > 1) {
                          <span class="chip__path" [attr.data-path]="pt.path">{{ pathBadge(pt.path) }}</span>
                        }
                      </a>
                    }
                    @if (g.partners.length > partnerCap) {
                      @if (expanded().has(g.resultId)) {
                        <button class="chip chip--more" type="button" (click)="toggle(g.resultId)">Show fewer</button>
                      } @else {
                        <button class="chip chip--more" type="button" (click)="toggle(g.resultId)">+{{ g.partners.length - partnerCap }} more</button>
                      }
                    }
                  </div>
                </li>
              }
            </ul>
          } @else {
            <p class="note">No fusions produce a result from {{ parentName() }} with your current unlock settings.</p>
          }
        }
      }
    </section>
  `,
  styles: `
    :host { display: block; }

    .panel {
      padding: 1rem 1.15rem;
      border: 1px solid var(--p-content-border-color, rgba(127, 127, 127, 0.2));
      border-radius: var(--p-border-radius, 8px);
      background: var(--app-panel);
    }
    .panel__title {
      margin: 0 0 0.6rem;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--p-text-muted-color);
    }

    .note {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      margin: 0;
      padding: 0.5rem 0.7rem;
      border-radius: 6px;
      font-size: 0.88rem;
      background: var(--app-panel-2);
      color: var(--p-text-muted-color);
    }

    .lead {
      margin: 0 0 0.75rem;
      font-size: 0.9rem;
      color: var(--p-text-muted-color);
      strong { color: var(--p-text-color); }
      &__ready {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        margin-left: 0.35rem;
        color: var(--app-success);
        font-weight: 600;
      }
    }

    .groups {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .grp {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0.6rem 0.75rem;
      border: 1px solid var(--p-content-border-color, rgba(127, 127, 127, 0.16));
      border-radius: 8px;
      background: var(--p-content-background);
      &--ready {
        border-color: color-mix(in srgb, #22c55e 45%, transparent);
        background: color-mix(in srgb, #22c55e 6%, transparent);
      }
      &__head {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem 0.75rem;
        align-items: center;
        justify-content: space-between;
      }
      &__result {
        display: inline-flex;
        align-items: baseline;
        gap: 0.5rem;
        text-decoration: none;
        color: var(--p-text-color);
        &:hover .grp__name { color: var(--p-primary-color); }
      }
      &__name { font-weight: 600; font-size: 1rem; }
      &__meta {
        font-size: 0.78rem;
        color: var(--p-text-muted-color);
        text-transform: capitalize;
      }
      &__tags {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.4rem;
      }
      &__partners {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.35rem;
      }
      &__with {
        margin-right: 0.15rem;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--p-text-muted-color);
      }
    }

    .badge-path {
      padding: 0.1rem 0.5rem;
      border-radius: 999px;
      font-size: 0.72rem;
      background: var(--app-panel-2);
      color: var(--p-text-muted-color);
      &[data-path='treasure'] {
        color: var(--app-warn);
        background: color-mix(in srgb, #fbbf24 16%, transparent);
      }
      &[data-path='same-arcana'] {
        color: #a78bfa;
        background: color-mix(in srgb, #a78bfa 16%, transparent);
      }
      &[data-path='advanced'] {
        color: var(--p-primary-color);
        background: color-mix(in srgb, var(--p-primary-color) 14%, transparent);
      }
    }

    .badge-cap {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.1rem 0.5rem;
      border-radius: 999px;
      font-size: 0.72rem;
      color: var(--app-warn);
      background: color-mix(in srgb, #f59e0b 14%, transparent);
    }

    .ready {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      color: var(--app-success);
      font-size: 0.78rem;
      font-weight: 600;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.6rem;
      border: 1px solid transparent;
      border-radius: 999px;
      background: var(--app-panel-2);
      color: var(--p-text-color);
      text-decoration: none;
      font-size: 0.85rem;
      &:hover { color: var(--p-primary-color); }
      &--owned {
        border-color: color-mix(in srgb, #22c55e 45%, transparent);
        background: color-mix(in srgb, #22c55e 12%, transparent);
      }
      &--more {
        cursor: pointer;
        font: inherit;
        font-size: 0.8rem;
        color: var(--p-text-muted-color);
        &:hover { border-color: var(--p-primary-color); color: var(--p-primary-color); }
      }
      &__lv {
        font-size: 0.72rem;
        color: var(--p-text-muted-color);
        font-variant-numeric: tabular-nums;
      }
      &__path {
        padding: 0 0.35rem;
        border-radius: 999px;
        font-size: 0.65rem;
        background: var(--p-content-background);
        color: var(--p-text-muted-color);
      }
    }
  `,
})
export class PersonaForwardFusions {
  protected readonly store = inject(FusionStore);
  protected readonly nav = inject(GameRouteContext);
  protected readonly partnerCap = PARTNER_CAP;

  readonly personaId = input.required<string>();

  /** Which result groups have their full partner list expanded past the cap. */
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  private readonly parent = computed<Persona | undefined>(() => this.store.persona(this.personaId()));

  protected readonly parentName = computed<string>(() => this.parent()?.name ?? this.personaId());

  protected readonly isParty = computed<boolean>(() => this.parent()?.kind === 'party');

  /**
   * The engine's flat `fusionsFrom` list, bucketed by result. `fusionsFrom` is
   * memoised per (parent, unlock signature) in the engine, so re-reading it as
   * ownership/settings change is cheap; only the grouping here re-runs.
   */
  protected readonly groups = computed<readonly ResultGroup[]>(() => {
    const engine = this.store.engine();
    const id = this.personaId();
    if (!engine) return [];

    const raw = engine.fusionsFrom(id, this.store.ctx());
    if (!raw.length) return [];

    const owned = this.store.ownedEntries();
    const enforceCap = this.store.enforceLevelCap();
    const protagonistLevel = this.store.protagonistLevel();

    const buckets = new Map<string, { partners: Map<string, Partner>; paths: Set<FusionPath> }>();
    for (const recipe of raw) {
      const partnerId = recipe.ingredientIds.find((pid) => pid !== id) ?? recipe.ingredientIds[1];
      let bucket = buckets.get(recipe.resultId);
      if (!bucket) {
        bucket = { partners: new Map(), paths: new Set() };
        buckets.set(recipe.resultId, bucket);
      }
      bucket.paths.add(recipe.path);
      // A partner reaching the same result twice (e.g. same-arcana and treasure)
      // is one chip; the first path seen labels it when paths are mixed.
      if (!bucket.partners.has(partnerId)) {
        const p = this.store.persona(partnerId);
        const entry = owned.get(partnerId);
        bucket.partners.set(partnerId, {
          id: partnerId,
          name: p?.name ?? partnerId,
          arcana: p ? titleCase(p.arcana) : '',
          level: p?.level ?? 0,
          owned: entry != null,
          ownedLevel: entry?.level ?? null,
          path: recipe.path,
        });
      }
    }

    const groups: ResultGroup[] = [];
    for (const [resultId, bucket] of buckets) {
      const result = this.store.persona(resultId);
      const entry = owned.get(resultId);
      const partners = [...bucket.partners.values()].sort(
        (a, b) =>
          Number(b.owned) - Number(a.owned) || a.level - b.level || a.name.localeCompare(b.name),
      );
      groups.push({
        resultId,
        name: result?.name ?? resultId,
        arcana: result ? titleCase(result.arcana) : '',
        level: result?.level ?? 0,
        owned: entry != null,
        ownedLevel: entry?.level ?? null,
        canDoNow: partners.some((pt) => pt.owned),
        capped: !!result && enforceCap && result.level > protagonistLevel,
        paths: [...bucket.paths].sort(),
        partners,
      });
    }

    // Fusions you can do now first, then by result level, then name (§4.7.2).
    return groups.sort(
      (a, b) =>
        Number(b.canDoNow) - Number(a.canDoNow) || a.level - b.level || a.name.localeCompare(b.name),
    );
  });

  protected readonly readyCount = computed<number>(
    () => this.groups().filter((g) => g.canDoNow).length,
  );

  protected visiblePartners(g: ResultGroup): readonly Partner[] {
    return this.expanded().has(g.resultId) ? g.partners : g.partners.slice(0, this.partnerCap);
  }

  protected toggle(resultId: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(resultId)) next.delete(resultId);
      else next.add(resultId);
      return next;
    });
  }

  protected pathBadge(path: FusionPath): string {
    return PATH_BADGE[path];
  }
}
