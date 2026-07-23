import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { FocusTrap } from '../../../shared/a11y/focus-trap';
import { GameRouteContext } from '../../../shared/game-route';
import { CompendiumStore } from '../compendium/compendium.store';
import { GameDataService } from '../data/game-data.service';
import { titleCase } from './format';

type ResultKind = 'persona' | 'shadow' | 'skill';

interface SearchItem {
  readonly kind: ResultKind;
  readonly id: string;
  readonly name: string;
  readonly sub: string;
  /** Lower-cased name, precomputed for matching. */
  readonly haystack: string;
}

interface ResultGroup {
  readonly kind: ResultKind;
  readonly label: string;
  readonly route: string;
  readonly items: readonly SearchItem[];
}

const GROUPS: readonly { kind: ResultKind; label: string; route: string }[] = [
  { kind: 'persona', label: 'Personas', route: 'personas' },
  { kind: 'shadow', label: 'Shadows', route: 'shadow' },
  { kind: 'skill', label: 'Skills', route: 'skills' },
];

const PER_GROUP = 6;

/**
 * Global search (§10, task 24) — opened with the `/` hotkey, grouped results
 * across personas, shadows and skills. Lives in the P5R layout, not the
 * game-agnostic shell, so it can read this game's data and route to its details.
 *
 * The index is built lazily (only once the panel first opens) from the loaded
 * datasets, and matching is a case-insensitive substring ranked by match
 * position — precise for the "the game just named this, look it up" use.
 */
@Component({
  selector: 'app-global-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FocusTrap],
  template: `
    @if (open()) {
      <div class="gs" role="dialog" aria-modal="true" aria-label="Search">
        <div class="gs__scrim" (click)="close()"></div>
        <div class="gs__panel" appFocusTrap (escape)="close()">
          <div class="gs__field">
            <i class="pi pi-search" aria-hidden="true"></i>
            <input
              class="gs__input"
              type="text"
              placeholder="Search personas, shadows, skills…"
              aria-label="Search personas, shadows and skills"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
            />
            <button class="gs__close" type="button" aria-label="Close search" (click)="close()">
              <i class="pi pi-times" aria-hidden="true"></i>
            </button>
          </div>

          <div class="gs__results">
            @if (query().length < 2) {
              <p class="gs__hint">Type at least two characters.</p>
            } @else if (total() === 0) {
              <p class="gs__hint">No matches for “{{ query() }}”.</p>
            } @else {
              @for (group of groups(); track group.kind) {
                @if (group.items.length) {
                  <div class="gs__group">
                    <div class="gs__grouphead">{{ group.label }}</div>
                    @for (item of group.items; track item.id) {
                      <button class="gs__item" type="button" (click)="goto(group.route, item.id)">
                        <span class="gs__itemname">
                          @if (group.kind === 'persona' && owned().has(item.id)) {
                            <i class="pi pi-check-circle gs__owned" title="In your compendium" aria-label="In your compendium"></i>
                          }
                          {{ item.name }}
                        </span>
                        <span class="gs__itemsub">{{ item.sub }}</span>
                      </button>
                    }
                  </div>
                }
              }
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .gs__scrim {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 300;
    }
    .gs__panel {
      position: fixed;
      left: 50%;
      top: 10vh;
      transform: translateX(-50%);
      width: min(40rem, 92vw);
      max-height: 75vh;
      display: flex;
      flex-direction: column;
      background: var(--p-content-background);
      border: 1px solid var(--p-content-border-color, rgba(127, 127, 127, 0.3));
      border-radius: var(--p-border-radius, 8px);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
      z-index: 310;
      overflow: hidden;
    }
    .gs__field {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--p-content-border-color, rgba(127, 127, 127, 0.25));

      .pi-search {
        color: var(--p-text-muted-color);
      }
    }
    .gs__input {
      flex: 1 1 auto;
      border: 0;
      background: transparent;
      color: var(--p-text-color);
      font: inherit;
      font-size: 1.05rem;
      outline: none;
    }
    .gs__close {
      display: inline-flex;
      border: 0;
      background: transparent;
      color: var(--p-text-muted-color);
      cursor: pointer;
    }
    .gs__results {
      overflow-y: auto;
      padding: 0.5rem 0;
    }
    .gs__hint {
      margin: 0;
      padding: 1rem;
      color: var(--p-text-muted-color);
      text-align: center;
    }
    .gs__grouphead {
      padding: 0.4rem 1rem 0.2rem;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--p-text-muted-color);
    }
    .gs__item {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
      width: 100%;
      padding: 0.5rem 1rem;
      border: 0;
      background: transparent;
      text-align: left;
      cursor: pointer;
      color: var(--p-text-color);
      font: inherit;

      &:hover,
      &:focus-visible {
        background: var(--p-highlight-background, rgba(127, 127, 127, 0.12));
        outline: none;
      }
    }
    .gs__itemname {
      font-weight: 600;
    }
    .gs__owned {
      color: var(--app-success);
      font-size: 0.8rem;
      margin-right: 0.2rem;
    }
    .gs__itemsub {
      color: var(--p-text-muted-color);
      font-size: 0.8rem;
      text-transform: capitalize;
      white-space: nowrap;
    }
  `,
})
export class GlobalSearch {
  private readonly data = inject(GameDataService);
  private readonly router = inject(Router);
  private readonly nav = inject(GameRouteContext);
  private readonly compendium = inject(CompendiumStore);

  /** Owned persona ids, to badge persona results (task 30). */
  protected readonly owned = computed(() => new Set(this.compendium.entryMap().keys()));

  protected readonly open = signal(false);
  protected readonly query = signal('');

  /** Full search index, built once lazily from the loaded datasets. */
  private readonly index = computed<readonly SearchItem[]>(() => {
    if (!this.open()) return [];
    const data = this.data.data();
    if (!data) return [];
    const items: SearchItem[] = [];
    for (const p of data.personas) {
      items.push({ kind: 'persona', id: p.id, name: p.name, sub: titleCase(p.arcana), haystack: p.name.toLowerCase() });
    }
    for (const s of data.shadows) {
      items.push({ kind: 'shadow', id: s.id, name: s.name, sub: titleCase(s.arcana), haystack: s.name.toLowerCase() });
    }
    for (const k of data.skills) {
      items.push({ kind: 'skill', id: k.id, name: k.name, sub: titleCase(k.element), haystack: k.name.toLowerCase() });
    }
    return items;
  });

  protected readonly groups = computed<readonly ResultGroup[]>(() => {
    const q = this.query().trim().toLowerCase();
    if (q.length < 2) return [];
    const ranked = new Map<ResultKind, { item: SearchItem; score: number }[]>();
    for (const item of this.index()) {
      const at = item.haystack.indexOf(q);
      if (at === -1) continue;
      const bucket = ranked.get(item.kind) ?? [];
      // Earlier match, then shorter name, ranks higher.
      bucket.push({ item, score: at * 1000 + item.name.length });
      ranked.set(item.kind, bucket);
    }
    return GROUPS.map((g) => ({
      ...g,
      items: (ranked.get(g.kind) ?? [])
        .sort((a, b) => a.score - b.score)
        .slice(0, PER_GROUP)
        .map((r) => r.item),
    }));
  });

  protected readonly total = computed(() => this.groups().reduce((n, g) => n + g.items.length, 0));

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === '/' && !this.open() && !isTypingTarget(event.target)) {
      event.preventDefault();
      this.query.set('');
      this.open.set(true);
      // Shadows are searchable but load on demand (task 58) — fetch on first open.
      this.data.loadExtras();
    }
  }

  protected close(): void {
    this.open.set(false);
  }

  protected goto(route: string, id: string): void {
    this.close();
    void this.router.navigate(this.nav.link(route, id));
  }
}

/** True when focus is in a field where `/` is a literal character, not a hotkey. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
