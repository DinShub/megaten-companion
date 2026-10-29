import { ChangeDetectionStrategy, Component, computed, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { FocusTrap } from '../../../shared/a11y/focus-trap';
import { GameRouteContext } from '../../../shared/game-route';
import { P3rCompendiumStore } from '../compendium/p3r-compendium.store';
import { P3rDataService } from '../data/p3r-data.service';
import { arcanaLabel, SKILL_ELEMENT_LABEL } from './p3r-format';

type ResultKind = 'persona' | 'shadow' | 'skill';

interface SearchItem {
  readonly kind: ResultKind;
  readonly id: string;
  readonly name: string;
  readonly sub: string;
  readonly haystack: string;
}

const GROUPS: readonly { kind: ResultKind; label: string; route: string }[] = [
  { kind: 'persona', label: 'Personas', route: 'personas' },
  { kind: 'shadow', label: 'Shadows', route: 'shadows' },
  { kind: 'skill', label: 'Skills', route: 'skills' },
];

const PER_GROUP = 6;

/**
 * Global search — the `/` hotkey opens grouped results across personas, shadows
 * and skills. Same behaviour as the P5R search (substring match ranked by
 * position, index built lazily on first open); its styles sit in the shared
 * `.p3r` stylesheet the layout carries.
 */
@Component({
  selector: 'app-p3r-global-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FocusTrap],
  template: `
    @if (open()) {
      <div class="p3-gs" role="dialog" aria-modal="true" aria-label="Search">
        <div class="p3-gs__scrim" (click)="close()"></div>
        <div class="p3-gs__panel" appFocusTrap (escape)="close()">
          <div class="p3-search p3-gs__field">
            <i class="pi pi-search" aria-hidden="true"></i>
            <input
              type="text"
              placeholder="Search personas, shadows, skills…"
              aria-label="Search personas, shadows and skills"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
            />
            <button class="p3-linkbtn" type="button" aria-label="Close search" (click)="close()">
              <i class="pi pi-times" aria-hidden="true"></i>
            </button>
          </div>
          <div class="p3-gs__results">
            @if (query().length < 2) {
              <p class="p3-empty">Type at least two characters.</p>
            } @else if (total() === 0) {
              <p class="p3-empty">No matches for “{{ query() }}”.</p>
            } @else {
              @for (group of groups(); track group.kind) {
                @if (group.items.length) {
                  <div class="p3-eyebrow p3-gs__group">{{ group.label }}</div>
                  @for (item of group.items; track item.id) {
                    <button class="p3-gs__item" type="button" (click)="goto(group.route, item.id)">
                      <span class="p3-strong">
                        @if (group.kind === 'persona' && owned().has(item.id)) {
                          <i class="pi pi-check-circle p3-owned" aria-label="In your compendium"></i>
                        }
                        {{ item.name }}
                      </span>
                      <span class="p3-muted">{{ item.sub }}</span>
                    </button>
                  }
                }
              }
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .p3-gs__scrim { position: fixed; inset: 0; z-index: 300; background: rgba(0, 0, 0, 0.5); }
    .p3-gs__panel {
      position: fixed; top: 10vh; left: 50%; z-index: 310; transform: translateX(-50%);
      display: flex; flex-direction: column; width: min(40rem, 92vw); max-height: 75vh; overflow: hidden;
      border: 1px solid var(--p-content-border-color, rgba(127, 127, 127, 0.3)); border-radius: var(--p-border-radius, 8px);
      background: var(--p-content-background); box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
    }
    .p3-gs__field { margin: 0.75rem; flex: 0 0 auto; }
    .p3-gs__results { overflow-y: auto; padding: 0 0 0.5rem; }
    .p3-gs__group { padding: 0.4rem 1rem 0.2rem; }
    .p3-gs__item {
      display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; width: 100%;
      padding: 0.5rem 1rem; border: 0; background: transparent; color: var(--p-text-color); font: inherit; text-align: left; cursor: pointer;
      &:hover, &:focus-visible { background: var(--p-highlight-background, rgba(127, 127, 127, 0.12)); outline: none; }
    }
  `,
})
export class P3rGlobalSearch {
  private readonly data = inject(P3rDataService);
  private readonly router = inject(Router);
  private readonly nav = inject(GameRouteContext);
  private readonly compendium = inject(P3rCompendiumStore);

  protected readonly owned = computed(() => new Set(this.compendium.entryMap().keys()));
  protected readonly open = signal(false);
  protected readonly query = signal('');

  private readonly index = computed<readonly SearchItem[]>(() => {
    if (!this.open()) return [];
    const data = this.data.data();
    if (!data) return [];
    const items: SearchItem[] = [];
    for (const d of data.personas) {
      items.push({ kind: 'persona', id: d.id, name: d.name, sub: `${arcanaLabel(d.arcana)} · Lv ${d.level}`, haystack: d.name.toLowerCase() });
    }
    for (const sh of data.shadows) {
      items.push({ kind: 'shadow', id: sh.id, name: sh.name, sub: `${sh.arcana ? arcanaLabel(sh.arcana) : 'Unknown'} · Lv ${sh.level}`, haystack: sh.name.toLowerCase() });
    }
    for (const s of data.skills) {
      items.push({ kind: 'skill', id: s.id, name: s.name, sub: SKILL_ELEMENT_LABEL[s.element], haystack: s.name.toLowerCase() });
    }
    return items;
  });

  protected readonly groups = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (q.length < 2) return [];
    const ranked = new Map<ResultKind, { item: SearchItem; score: number }[]>();
    for (const item of this.index()) {
      const at = item.haystack.indexOf(q);
      if (at === -1) continue;
      const bucket = ranked.get(item.kind) ?? [];
      bucket.push({ item, score: at * 1000 + item.name.length });
      ranked.set(item.kind, bucket);
    }
    return GROUPS.map((g) => ({
      ...g,
      items: (ranked.get(g.kind) ?? []).sort((a, b) => a.score - b.score).slice(0, PER_GROUP).map((r) => r.item),
    }));
  });

  protected readonly total = computed(() => this.groups().reduce((n, g) => n + g.items.length, 0));

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === '/' && !this.open() && !isTypingTarget(event.target)) {
      event.preventDefault();
      this.query.set('');
      this.open.set(true);
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

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
