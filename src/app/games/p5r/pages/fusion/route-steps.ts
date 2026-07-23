import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { OwnershipBadge } from '../../../../shared/ownership-badge/ownership-badge';
import type { FusionPath } from '../../fusion';
import type { RouteNode } from '../../routing';
import { FusionStore } from './fusion.store';

const PATH_BADGE: Record<FusionPath, string> = {
  'different-arcana': 'Standard',
  'same-arcana': 'Same arcana',
  treasure: 'Treasure',
  advanced: 'Advanced',
};

/** One ingredient of a step: a base persona you obtain, or the result of an earlier step. */
interface Unit {
  readonly id: string;
  readonly level: number;
  readonly owned: boolean;
  /** Set when this ingredient is produced by an earlier step (its 1-based number). */
  readonly fromStep: number | null;
  /** Requested skills this leaf is the source of. */
  readonly supplies: readonly string[];
}

/** One fusion in the recipe: `ingredients → result`, in the order you perform them. */
interface Step {
  readonly n: number;
  readonly ingredients: readonly Unit[];
  readonly resultId: string;
  readonly resultLevel: number;
  readonly path: FusionPath;
  readonly carries: readonly string[];
  /** The last step produces the target. */
  readonly isTarget: boolean;
}

/**
 * A route rendered as a **numbered recipe** (§4.7.3) instead of a nested tree:
 * one row per fusion, `A + B → C`, ordered bottom-up so you perform them top to
 * bottom and each result feeds a later step. Far more legible than the tree for a
 * multi-step chain — an ingredient produced earlier is tagged with its step, and
 * base personas you obtain carry their ownership badge and unlock condition.
 */
@Component({
  selector: 'app-route-steps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OwnershipBadge],
  template: `
    @if (steps().length) {
      <ol class="steps">
        @for (step of steps(); track step.n) {
          <li class="step">
            <span class="step__n">{{ step.n }}</span>
            <div class="step__eq">
              @for (ing of step.ingredients; track $index; let last = $last) {
                <span class="unit" [class.unit--made]="ing.fromStep !== null">
                  <a class="uname" [routerLink]="nav.link('personas', ing.id)">{{ name(ing.id) }}</a>
                  <span class="ulv">Lv {{ ing.level }}</span>
                  @if (ing.fromStep !== null) {
                    <span class="frm">from step {{ ing.fromStep }}</span>
                  } @else {
                    <app-ownership-badge [registered]="ing.owned" [level]="ing.owned ? ing.level : null" />
                    @for (s of ing.supplies; track s) { <span class="chip chip--supply">{{ skillName(s) }}</span> }
                    @if (gate(ing.id); as g) { <span class="gate"><i class="pi pi-lock" aria-hidden="true"></i>{{ g }}</span> }
                  }
                </span>
                @if (!last) { <span class="op">+</span> }
              }
              <span class="op op--arrow"><i class="pi pi-arrow-right" aria-hidden="true"></i></span>
              <span class="unit unit--result" [class.unit--target]="step.isTarget">
                <span class="badge-path" [attr.data-path]="step.path">{{ pathBadge(step.path) }}</span>
                <a class="uname" [routerLink]="nav.link('personas', step.resultId)">{{ name(step.resultId) }}</a>
                <span class="ulv">Lv {{ step.resultLevel }}</span>
                @if (step.isTarget) { <span class="tgt">target</span> }
                @for (s of step.carries; track s) { <span class="chip chip--carry"><i class="pi pi-arrow-up" aria-hidden="true"></i>{{ skillName(s) }}</span> }
              </span>
            </div>
          </li>
        }
      </ol>
    } @else {
      <p class="obtain">
        <i class="pi pi-check" aria-hidden="true"></i> Obtain
        <a class="uname" [routerLink]="nav.link('personas', leafId())">{{ name(leafId()) }}</a>
        directly — no fusion needed.
      </p>
    }
  `,
  styles: `
    .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
    .step { display: flex; align-items: flex-start; gap: 0.5rem; }
    .step__n { flex: 0 0 auto; width: 1.4rem; height: 1.4rem; margin-top: 0.15rem; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--app-panel-2); color: var(--p-text-muted-color); font-size: 0.75rem; font-variant-numeric: tabular-nums; }
    .step__eq { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem 0.4rem; }

    .unit { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; padding: 0.25rem 0.5rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.22)); border-radius: 7px; background: var(--p-content-background); }
    .unit--made { border-style: dashed; background: transparent; }
    .unit--result { border-color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 8%, transparent); }
    .unit--target { border-width: 2px; }

    .uname { font-weight: 600; color: var(--p-text-color); text-decoration: none; white-space: nowrap; &:hover { color: var(--p-primary-color); } }
    .ulv { font-size: 0.72rem; color: var(--p-text-muted-color); font-variant-numeric: tabular-nums; }
    .frm { font-size: 0.68rem; color: var(--p-text-muted-color); font-style: italic; }
    .tgt { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--p-primary-color); font-weight: 700; }
    .op { color: var(--p-text-muted-color); font-weight: 600; }
    .op--arrow { color: var(--p-primary-color); }

    .chip { display: inline-flex; align-items: center; gap: 0.2rem; padding: 0.05rem 0.4rem; border-radius: 999px; font-size: 0.68rem; white-space: nowrap; }
    .chip--carry { background: color-mix(in srgb, var(--p-primary-color) 18%, transparent); color: var(--p-primary-color); }
    .chip--supply { background: var(--app-panel-2); color: var(--p-text-color); }

    .badge-path { padding: 0.05rem 0.4rem; border-radius: 999px; font-size: 0.66rem; background: var(--app-panel-2); color: var(--p-text-muted-color); }
    .badge-path[data-path='treasure'] { color: var(--app-warn); background: color-mix(in srgb, #fbbf24 16%, transparent); }
    .badge-path[data-path='same-arcana'] { color: #a78bfa; background: color-mix(in srgb, #a78bfa 16%, transparent); }
    .badge-path[data-path='advanced'] { color: #f472b6; background: color-mix(in srgb, #f472b6 16%, transparent); }

    .gate { display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.66rem; color: var(--p-text-muted-color); }
    .obtain { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; margin: 0; font-size: 0.9rem; .pi-check { color: var(--app-success); } }
  `,
})
export class RouteSteps {
  readonly tree = input.required<RouteNode>();

  protected readonly store = inject(FusionStore);
  protected readonly nav = inject(GameRouteContext);

  /** The tree flattened to an ordered, numbered list of fusion steps (post-order). */
  protected readonly steps = computed<Step[]>(() => flatten(this.tree()));

  /** For a zero-fusion route (the target is obtainable directly), the sole leaf. */
  protected readonly leafId = computed<string>(() => {
    const node = this.tree();
    return node.kind === 'leaf' ? node.personaId : node.resultId;
  });

  protected name(id: string): string {
    return this.store.personaName(id);
  }

  protected skillName(id: string): string {
    return this.store.skill(id)?.name ?? id;
  }

  protected pathBadge(path: FusionPath): string {
    return PATH_BADGE[path];
  }

  /** The unlock condition or treasure prereq to flag on a base persona (§4.7.3). */
  protected gate(id: string): string | null {
    const persona = this.store.persona(id);
    return persona?.unlock?.condition ?? persona?.prereq ?? null;
  }
}

/**
 * Post-order flatten: emit each fusion after its children, so a step's produced
 * ingredients already have their numbers. The last step emitted is the target.
 */
function flatten(root: RouteNode): Step[] {
  const steps: Step[] = [];
  const stepOf = new Map<RouteNode, number>();

  const visit = (node: RouteNode): void => {
    if (node.kind !== 'fusion') return;
    for (const child of node.children) visit(child);
    const n = steps.length + 1;
    stepOf.set(node, n);
    steps.push({
      n,
      ingredients: node.children.map((child) => unitOf(child, stepOf)),
      resultId: node.resultId,
      resultLevel: node.level,
      path: node.path,
      carries: node.carries,
      isTarget: node === root,
    });
  };

  visit(root);
  return steps;
}

function unitOf(node: RouteNode, stepOf: ReadonlyMap<RouteNode, number>): Unit {
  if (node.kind === 'leaf') {
    return { id: node.personaId, level: node.level, owned: node.owned, fromStep: null, supplies: node.supplies };
  }
  return { id: node.resultId, level: node.level, owned: false, fromStep: stepOf.get(node) ?? null, supplies: [] };
}
