import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { createUrlState } from '../../../../shared/url-query';
import { GameDataService } from '../../data/game-data.service';
import type { Shadow, Skill } from '../../model';

interface MaterialRow {
  readonly name: string;
  readonly sources: readonly { id: string; name: string }[];
}

interface AccessoryRow {
  readonly id: string;
  readonly name: string;
  readonly skillId: string;
  readonly skillName: string;
}

/**
 * Drops index (§4.4, task 22) — a tab on the shadow list, not a page of its own.
 * Inverts shadow drops into `material → shadows that drop it` (the §5.2
 * `dropSources` index) and shows the orphaned accessory → skill mapping, which
 * converted cleanly (§14 Q4, `accessories.json`). Thin by design: it exists so
 * drop strings are searchable rather than buried in detail views.
 */
@Component({
  selector: 'app-drops-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState],
  template: `
    @if (data.ready()) {
      <div class="page">
        <div class="toolbar">
          <span class="toolbar__search">
            <i class="pi pi-search" aria-hidden="true"></i>
            <input type="text" placeholder="Search a material, accessory or skill…" aria-label="Search drops" [value]="query()" (input)="query.set($any($event.target).value)" />
          </span>
        </div>

        <section class="block">
          <h2 class="block__title">Materials &amp; armour <span class="count">{{ materials().length }}</span></h2>
          @if (materials().length) {
            <ul class="mats">
              @for (m of materials(); track m.name) {
                <li class="mats__row">
                  <span class="mats__name">{{ m.name }}</span>
                  <span class="mats__sources">
                    @for (src of m.sources; track src.id; let last = $last) {
                      <a class="link" [routerLink]="nav.link('shadow', src.id)">{{ src.name }}</a>@if (!last) {<span class="sep">, </span>}
                    }
                  </span>
                </li>
              }
            </ul>
          } @else { <p class="empty">No materials match “{{ query() }}”.</p> }
        </section>

        <section class="block">
          <h2 class="block__title">Accessories → skill <span class="count">{{ accessories().length }}</span></h2>
          <p class="block__note">An accessory grants its skill while equipped. Orphaned upstream and unvalidated against the game (§14 Q4).</p>
          @if (accessories().length) {
            <ul class="mats">
              @for (a of accessories(); track a.id) {
                <li class="mats__row">
                  <span class="mats__name">{{ a.name }}</span>
                  <span class="mats__sources"><a class="link" [routerLink]="nav.link('skills', a.skillId)">{{ a.skillName }}</a></span>
                </li>
              }
            </ul>
          } @else { <p class="empty">No accessories match “{{ query() }}”.</p> }
        </section>
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .page { display: flex; flex-direction: column; gap: 1.5rem; }
    .toolbar__search {
      display: inline-flex; align-items: center; gap: 0.5rem; width: 100%; max-width: 28rem;
      padding: 0.4rem 0.7rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3));
      border-radius: var(--p-border-radius, 6px); background: var(--p-content-background);
      .pi { color: var(--p-text-muted-color); }
      input { flex: 1 1 auto; border: 0; background: transparent; color: var(--p-text-color); font: inherit; outline: none; }
    }
    .block__title { margin: 0 0 0.5rem; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; }
    .count { font-size: 0.8rem; font-weight: 400; color: var(--p-text-muted-color); }
    .block__note { margin: 0 0 0.75rem; color: var(--p-text-muted-color); font-size: 0.85rem; }
    .mats { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .mats__row { display: grid; grid-template-columns: minmax(9rem, 14rem) 1fr; gap: 1rem; padding: 0.5rem 0; border-top: 1px solid var(--p-content-border-color, rgba(127,127,127,0.12)); &:first-child { border-top: 0; } }
    .mats__name { font-weight: 600; }
    .mats__sources { color: var(--p-text-muted-color); font-size: 0.9rem; }
    .link { color: var(--p-primary-color); text-decoration: none; &:hover { text-decoration: underline; } }
    .sep { color: var(--p-text-muted-color); }
    .empty { padding: 1rem 0; color: var(--p-text-muted-color); }

    @media (max-width: 600px) {
      .mats__row { grid-template-columns: 1fr; gap: 0.25rem; }
    }
  `,
})
export class DropsPage {
  protected readonly data = inject(GameDataService);
  protected readonly nav = inject(GameRouteContext);

  protected readonly query = createUrlState<string>({
    parse: (p) => p.get('q') ?? '',
    serialize: (q) => ({ q: q || null }),
  });

  private readonly shadowsById = computed(() => {
    const m = new Map<string, Shadow>();
    for (const s of this.data.data()?.shadows ?? []) m.set(s.id, s);
    return m;
  });
  private readonly skillsById = computed(() => {
    const m = new Map<string, Skill>();
    for (const s of this.data.data()?.skills ?? []) m.set(s.id, s);
    return m;
  });

  private readonly allMaterials = computed<MaterialRow[]>(() => {
    const rows: MaterialRow[] = [];
    for (const [name, ids] of this.data.dropSources()) {
      rows.push({
        name,
        sources: ids.map((id) => ({ id, name: this.shadowsById().get(id)?.name ?? id })),
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  });

  private readonly allAccessories = computed<AccessoryRow[]>(() =>
    (this.data.data()?.accessories ?? [])
      .map((a) => ({ id: a.id, name: a.name, skillId: a.skillId, skillName: this.skillsById().get(a.skillId)?.name ?? a.skillId }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  protected readonly materials = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.allMaterials();
    return this.allMaterials().filter(
      (m) => m.name.toLowerCase().includes(q) || m.sources.some((s) => s.name.toLowerCase().includes(q)),
    );
  });

  protected readonly accessories = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.allAccessories();
    return this.allAccessories().filter((a) => a.name.toLowerCase().includes(q) || a.skillName.toLowerCase().includes(q));
  });
}
