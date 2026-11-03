import { ChangeDetectionStrategy, Component, computed, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { FocusTrap } from '../../../shared/a11y/focus-trap';
import { GameRouteContext } from '../../../shared/game-route';
import { Smt1CompendiumStore } from '../compendium/smt1-compendium.store';
import { Smt1DataService } from '../data/smt1-data.service';
import { displayLevel } from '../model';
import { raceLabel, SKILL_ELEMENT_LABEL } from './smt1-format';

type ResultKind = 'demon' | 'skill';

interface SearchItem {
  readonly kind: ResultKind;
  readonly id: string;
  readonly name: string;
  readonly sub: string;
  readonly haystack: string;
}

const GROUPS: readonly { kind: ResultKind; label: string; route: string }[] = [
  { kind: 'demon', label: 'Demons', route: 'demons' },
  { kind: 'skill', label: 'Skills', route: 'skills' },
];

const PER_GROUP = 8;

/**
 * Global search — the `/` hotkey opens grouped results across demons and
 * skills, matching English and katakana. Same behaviour as the other games'
 * search (substring match ranked by position, index built lazily on first open).
 */
@Component({
  selector: 'app-smt1-global-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FocusTrap],
  template: `
    @if (open()) {
      <div class="g1-gs" role="dialog" aria-modal="true" aria-label="Search">
        <div class="g1-gs__scrim" (click)="close()"></div>
        <div class="g1-gs__panel" appFocusTrap (escape)="close()">
          <label class="g1-field g1-gs__field">
            <span>Find</span>
            <input type="search" placeholder="Demon or skill, English or katakana" [value]="query()" (input)="query.set($any($event.target).value)" />
            <button class="g1-btn g1-btn--small" type="button" (click)="close()">Close</button>
          </label>
          <div class="g1-gs__results">
            @if (query().length < 2) {
              <p class="g1-empty">Type at least two characters.</p>
            } @else if (total() === 0) {
              <p class="g1-empty">No matches for “{{ query() }}”.</p>
            } @else {
              @for (group of groups(); track group.kind) {
                @if (group.items.length) {
                  <h2 class="g1-gs__group">{{ group.label }}</h2>
                  @for (item of group.items; track item.id) {
                    <button class="g1-gs__item" type="button" (click)="goto(group.route, item.id)">
                      <span class="g1-strong">{{ item.name }}@if (group.kind === 'demon' && owned().has(item.id)) { <span class="g1-tag g1-tag--ink">Owned</span> }</span>
                      <span class="g1-dim">{{ item.sub }}</span>
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
})
export class Smt1GlobalSearch {
  private readonly data = inject(Smt1DataService);
  private readonly router = inject(Router);
  private readonly nav = inject(GameRouteContext);
  protected readonly owned = inject(Smt1CompendiumStore).ownedIds;

  protected readonly open = signal(false);
  protected readonly query = signal('');

  private readonly index = computed<readonly SearchItem[]>(() => {
    if (!this.open()) return [];
    const data = this.data.data();
    if (!data) return [];
    return [
      ...data.demons.map((d) => ({ kind: 'demon' as const, id: d.id, name: d.name, sub: `${raceLabel(d.race)}, Lv ${displayLevel(d)}`, haystack: `${d.name} ${d.jp ?? ''}`.toLowerCase() })),
      ...data.skills.map((s) => ({ kind: 'skill' as const, id: s.id, name: s.name, sub: SKILL_ELEMENT_LABEL[s.element], haystack: `${s.name} ${s.jp ?? ''}`.toLowerCase() })),
    ];
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
    return GROUPS.map((g) => ({ ...g, items: (ranked.get(g.kind) ?? []).sort((a, b) => a.score - b.score).slice(0, PER_GROUP).map((r) => r.item) }));
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
