import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { Smt3CompendiumStore } from '../../compendium/smt3-compendium.store';
import { Smt3DataService } from '../../data/smt3-data.service';
import type { DemonId } from '../../model';
import { raceLabel } from '../../ui/smt3-format';

/**
 * Everything the race chart can't explain, on one page: fixed special
 * recipes, Deathstone Fiends, evolutions, and the recruit-only demons.
 */
@Component({
  selector: 'app-smt3-specials',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState],
  template: `
    @if (data.ready()) {
      <div class="s3-page">
        <section class="s3-panel">
          <h2>Special fusions</h2>
          <ul class="s3-list">
            @for (s of specials(); track s.id) {
              <li class="sp__row">
                <span class="sp__result">
                  <a class="s3-strong" [routerLink]="nav.link('demons', s.id)">@if (owned().has(s.id)) { <i class="pi pi-check-circle s3-owned" aria-label="In your compendium"></i> }{{ s.name }}</a>
                  <small class="s3-muted">{{ s.meta }}</small>
                </span>
                <span class="sp__pairs">
                  @for (p of s.pairs; track $index) {
                    <span class="s3-pill">
                      <a [routerLink]="nav.link('demons', p[0])">{{ name(p[0]) }}</a> + <a [routerLink]="nav.link('demons', p[1])">{{ name(p[1]) }}</a>
                    </span>
                  }
                  @if (s.note) { <small class="s3-muted">{{ s.note }}</small> }
                </span>
              </li>
            }
          </ul>
        </section>

        <section class="s3-panel">
          <h2>Deathstone fiends</h2>
          <p class="s3-note">Fuse any pair that would yield the race shown, while holding a Deathstone in the stated Kagutsuchi phase; the Fiend appears instead. Each must be defeated first.</p>
          <ul class="s3-list">
            @for (f of fiends(); track f.id) {
              <li class="sp__row">
                <span class="sp__result"><a class="s3-strong" [routerLink]="nav.link('demons', f.id)">{{ f.name }}</a><small class="s3-muted">Lv {{ f.level }} · aim for a {{ raceLabel(f.race) }}</small></span>
                <small class="s3-muted">{{ f.condition }}</small>
              </li>
            }
          </ul>
        </section>

        <div class="s3-cols">
          <section class="s3-panel">
            <h2>Evolutions</h2>
            <ul class="s3-list">
              @for (e of evolutions(); track e.from) {
                <li>
                  <span><a [routerLink]="nav.link('demons', e.from)">{{ name(e.from) }}</a> <span class="s3-plus">→</span> <a [routerLink]="nav.link('demons', e.to)">{{ name(e.to) }}</a></span>
                  <span class="s3-side">at Lv {{ e.level }}</span>
                </li>
              }
            </ul>
          </section>
          <section class="s3-panel">
            <h2>Recruit only</h2>
            <ul class="s3-list">
              @for (r of recruits(); track r.id) {
                <li class="sp__row">
                  <a class="s3-strong" [routerLink]="nav.link('demons', r.id)">{{ r.name }}</a>
                  <small class="s3-muted">{{ r.condition }}</small>
                </li>
              }
            </ul>
          </section>
        </div>
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .sp__row { flex-wrap: wrap; align-items: flex-start; }
    .sp__result { display: flex; flex-direction: column; gap: 0.1rem; min-width: 10rem; }
    .sp__pairs { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 0.35rem; max-width: 40rem; }
    small { font-size: 0.78rem; }
  `,
})
export class Smt3Specials {
  protected readonly data = inject(Smt3DataService);
  protected readonly nav = inject(GameRouteContext);
  private readonly compendium = inject(Smt3CompendiumStore);
  protected readonly raceLabel = raceLabel;

  protected readonly owned = computed(() => new Set(this.compendium.entryMap().keys()));

  protected readonly specials = computed(() => {
    const data = this.data.data();
    if (!data) return [];
    const byResult = new Map<DemonId, [DemonId, DemonId][]>();
    for (const p of data.specialRecipes.pairs) {
      const list = byResult.get(p.resultId) ?? [];
      list.push([p.ingredientIds[0], p.ingredientIds[1]]);
      byResult.set(p.resultId, list);
    }
    return [...byResult.entries()]
      .map(([id, pairs]) => {
        const d = this.data.demonsById().get(id);
        return {
          id,
          name: d?.name ?? id,
          level: d?.level ?? 0,
          meta: d ? `${raceLabel(d.race)} · Lv ${d.level}` : '',
          pairs,
          note: [d?.prereq, d?.unlock?.condition].filter(Boolean).join(' · '),
        };
      })
      .sort((a, b) => a.level - b.level);
  });

  protected readonly fiends = computed(() =>
    (this.data.data()?.specialRecipes.deathstone ?? [])
      .map((f) => {
        const d = this.data.demonsById().get(f.resultId);
        return { id: f.resultId, name: d?.name ?? f.resultId, level: d?.level ?? 0, race: f.race, condition: d?.unlock?.condition ?? '' };
      })
      .sort((a, b) => a.level - b.level),
  );

  protected readonly evolutions = computed(() =>
    (this.data.data()?.demons ?? [])
      .filter((d) => d.evolvesTo)
      .map((d) => ({ from: d.id, to: d.evolvesTo!.demonId, level: d.evolvesTo!.level }))
      .sort((a, b) => a.level - b.level),
  );

  protected readonly recruits = computed(() =>
    (this.data.data()?.demons ?? [])
      .filter((d) => d.kind === 'recruit')
      .map((d) => ({ id: d.id, name: d.name, condition: d.unlock?.condition ?? d.prereq ?? '—' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  protected name(id: DemonId): string {
    return this.data.demonsById().get(id)?.name ?? id;
  }
}
