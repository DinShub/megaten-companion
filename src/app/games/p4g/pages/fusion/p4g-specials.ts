import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { P4gCompendiumStore } from '../../compendium/p4g-compendium.store';
import { P4gDataService } from '../../data/p4g-data.service';
import type { PersonaId } from '../../model';
import { arcanaLabel, UNLOCK_LABEL } from '../../ui/p4g-format';

/**
 * Everything the arcana charts can't explain, on one page: the fixed special
 * recipes (two to twelve personas at once) and the personas an unlock gates.
 */
@Component({
  selector: 'app-p4g-specials',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState],
  template: `
    @if (data.ready()) {
      <div class="p4-page">
        <section class="p4-panel">
          <h2>Special fusions</h2>
          <p class="p4-note">Fuse every persona in the recipe at once. The calculator's forward mode takes two or three; the bigger recipes are done in the Velvet Room's special fusion menu.</p>
          <ul class="p4-list">
            @for (s of specials(); track s.id) {
              <li class="sp__row">
                <span class="sp__result">
                  <a class="p4-strong" [routerLink]="nav.link('personas', s.id)">@if (owned().has(s.id)) { <i class="pi p4-owned pi-check-circle" aria-label="In your compendium"></i> }{{ s.name }}</a>
                  <small class="p4-muted">{{ s.meta }}</small>
                </span>
                <span class="sp__parts">
                  @for (id of s.ingredientIds; track id; let i = $index) {
                    @if (i > 0) { <span class="p4-plus" aria-hidden="true">+</span> }
                    <a class="p4-pill" [routerLink]="nav.link('personas', id)">@if (owned().has(id)) { <i class="pi pi-check-circle p4-owned" aria-label="In your compendium"></i> }{{ name(id) }}</a>
                  }
                  @if (s.note) { <small class="p4-muted sp__note">{{ s.note }}</small> }
                </span>
              </li>
            }
          </ul>
        </section>

        <section class="p4-panel">
          <h2>Unlock-gated personas</h2>
          <p class="p4-note">Switch a group off in Settings and its personas drop out of every result and recipe.</p>
          <ul class="p4-list">
            @for (g of gated(); track g.id) {
              <li class="sp__row">
                <span class="sp__result"><a class="p4-strong" [routerLink]="nav.link('personas', g.id)">{{ g.name }}</a><small class="p4-muted">{{ g.meta }}</small></span>
                <small class="p4-muted">{{ g.group }} · {{ g.condition }}</small>
              </li>
            }
          </ul>
        </section>
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .sp__row { flex-wrap: wrap; align-items: flex-start; }
    .sp__result { display: flex; flex-direction: column; gap: 0.1rem; min-width: 10rem; }
    .sp__parts { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 0.35rem; max-width: 44rem; }
    .sp__note { flex-basis: 100%; text-align: right; }
    small { font-size: 0.78rem; }
  `,
})
export class P4gSpecials {
  protected readonly data = inject(P4gDataService);
  protected readonly nav = inject(GameRouteContext);
  private readonly compendium = inject(P4gCompendiumStore);

  protected readonly owned = computed(() => new Set(this.compendium.entryMap().keys()));

  protected readonly specials = computed(() =>
    (this.data.data()?.specialRecipes ?? [])
      .map((r) => {
        const p = this.data.personasById().get(r.resultId);
        return {
          id: r.resultId,
          name: p?.name ?? r.resultId,
          level: p?.level ?? 0,
          meta: p ? `${arcanaLabel(p.arcana)} · Lv ${p.level}` : '',
          ingredientIds: r.ingredientIds,
          note: p?.unlock ? `Needs ${p.unlock.condition}` : '',
        };
      })
      .sort((a, b) => a.level - b.level),
  );

  protected readonly gated = computed(() =>
    (this.data.data()?.personas ?? [])
      .filter((p) => p.unlock)
      .map((p) => ({
        id: p.id,
        name: p.name,
        level: p.level,
        meta: `${arcanaLabel(p.arcana)} · Lv ${p.level}`,
        group: UNLOCK_LABEL[p.unlock!.group],
        condition: p.unlock!.condition,
      }))
      .sort((a, b) => a.level - b.level),
  );

  protected name(id: PersonaId): string {
    return this.data.personasById().get(id)?.name ?? id;
  }
}
