import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import type { CardSource } from '../../model';
import type { Objective, Route, SkillAssignment } from '../../routing';
import { FusionStore } from './fusion.store';
import { RouteSteps } from './route-steps';

const CARD_KIND_LABELS: Record<CardSource['kind'], string> = {
  itemization: 'itemization',
  'itemization-alarm': 'Fusion Alarm itemization',
  negotiation: 'negotiation',
};

/**
 * One ranked route (§4.7.3): the metric row (all three objectives shown, the
 * active one highlighted — §7.3), the fusion recipe as a numbered step list, and
 * the per-skill resolution (source used, or the typed §7.4 gap). Split out of
 * {@link RouteFinder} so each component keeps its own 4 kB style budget (§9.3).
 */
@Component({
  selector: 'app-route-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouteSteps],
  template: `
    @let r = route();
    <div class="route" [class.route--partial]="!r.complete">
      <header class="route__head">
        <span class="route__rank">#{{ rank() }}</span>
        <div class="metrics">
          <span class="metric" [class.is-active]="objective() === 'fewest-steps'">{{ r.steps }} {{ r.steps === 1 ? 'fusion' : 'fusions' }}</span>
          <span class="metric" [class.is-active]="objective() === 'cheapest'">{{ fmt(r.cost) }} ¥</span>
          <span class="metric" [class.is-active]="objective() === 'fewest-unowned'">{{ r.unowned }} unowned</span>
        </div>
        @if (asked()) {
          @if (r.complete) {
            <span class="pill pill--ok"><i class="pi pi-check" aria-hidden="true"></i> all skills</span>
          } @else {
            <span class="pill pill--partial">{{ r.satisfiedCount }}/{{ asked() }} skills</span>
          }
        }
      </header>

      <div class="recipe">
        <app-route-steps [tree]="r.tree" />
      </div>

      @if (r.assignments.length) {
        <ul class="assign">
          @for (a of r.assignments; track a.skillId) {
            <li class="assign__row" [class.is-off]="!a.satisfied">
              <i class="pi" [class.pi-check-circle]="a.satisfied" [class.pi-times-circle]="!a.satisfied" aria-hidden="true"></i>
              <span class="assign__skill">{{ skillName(a.skillId) }}</span>
              <span class="assign__how">{{ assignmentLabel(a) }}</span>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .route { display: flex; flex-direction: column; gap: 0.7rem; padding: 0.9rem 1rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.2)); border-radius: 10px; background: var(--p-content-background); }
    .route--partial { border-style: dashed; }
    .route__head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; }
    .route__rank { font-weight: 700; color: var(--p-primary-color); }
    .metrics { display: inline-flex; flex-wrap: wrap; gap: 0.35rem; }
    .metric { padding: 0.1rem 0.5rem; border-radius: 999px; background: var(--p-surface-700, rgba(127,127,127,0.16)); font-size: 0.8rem; font-variant-numeric: tabular-nums; }
    .metric.is-active { background: color-mix(in srgb, var(--p-primary-color) 20%, transparent); color: var(--p-primary-color); font-weight: 600; }
    .pill { margin-left: auto; padding: 0.1rem 0.55rem; border-radius: 999px; font-size: 0.76rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.3rem; }
    .pill--ok { color: #4ade80; background: color-mix(in srgb, #22c55e 14%, transparent); }
    .pill--partial { color: #fbbf24; background: color-mix(in srgb, #fbbf24 15%, transparent); }

    .recipe { overflow-x: auto; padding: 0.1rem; }
    .assign { list-style: none; margin: 0; padding: 0.5rem 0 0; border-top: 1px solid var(--p-content-border-color, rgba(127,127,127,0.15)); display: flex; flex-direction: column; gap: 0.3rem; }
    .assign__row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4rem; font-size: 0.85rem; }
    .assign__row.is-off { color: var(--p-text-muted-color); }
    .assign__row .pi-check-circle { color: #4ade80; }
    .assign__row .pi-times-circle { color: #f59e0b; }
    .assign__skill { font-weight: 600; }
    .assign__how { color: var(--p-text-muted-color); }
  `,
})
export class RouteCard {
  readonly route = input.required<Route>();
  readonly objective = input.required<Objective>();
  readonly rank = input.required<number>();
  /** Number of requested skills — 0 hides the completeness pill. */
  readonly asked = input.required<number>();

  private readonly fusion = inject(FusionStore);

  protected skillName(id: string): string {
    return this.fusion.skill(id)?.name ?? id;
  }

  protected fmt(n: number): string {
    return n.toLocaleString('en-US');
  }

  /** One assignment's human explanation — the source it used, or the §7.4 gap. */
  protected assignmentLabel(a: SkillAssignment): string {
    if (!a.satisfied) return a.diagnostic?.message ?? 'Not available on this route.';
    switch (a.via) {
      case 'native':
        return 'Learned natively';
      case 'inherited':
        return `Inherited from ${this.fusion.personaName(a.sourcePersonaId ?? '')}`;
      case 'card': {
        const kind = a.cardKind ? CARD_KIND_LABELS[a.cardKind] : 'card';
        return `Skill card (${kind}) from ${this.cardSourceName(a)}`;
      }
      default:
        return '';
    }
  }

  private cardSourceName(a: SkillAssignment): string {
    const from = a.cardFrom ?? '';
    if (a.cardKind === 'negotiation') return this.fusion.shadowsById().get(from)?.name ?? from;
    return this.fusion.personaName(from);
  }
}
