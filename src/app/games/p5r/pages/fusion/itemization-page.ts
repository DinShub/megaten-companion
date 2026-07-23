import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { OwnershipBadge } from '../../../../shared/ownership-badge/ownership-badge';
import { PersonaPicker, type PickerOption } from '../../../../shared/persona-picker/persona-picker';
import { GameDataService } from '../../data/game-data.service';
import type { Persona, Skill } from '../../model';
import { SKILL_ELEMENT_NAMES, titleCase } from '../../ui/format';
import { FusionStore } from './fusion.store';

type Mode = 'persona' | 'card';

interface ItemCard {
  readonly card: { id: string; name: string; element: string } | null;
  readonly item: string | null;
}

interface SourceRef {
  readonly id: string;
  readonly name: string;
  readonly owned: boolean;
  readonly ownedLevel: number | null;
}

/**
 * Itemization view (§6.7, task 43). Two lookups over the electric-chair data:
 *
 *  - **persona → card:** pick a persona, see the skill card it itemizes to,
 *    normal and Fusion Alarm side by side (the alarm result frequently differs);
 *  - **card → personas:** the reverse index the skill page carries — pick a card
 *    and see which personas produce it (normal vs alarm), plus any negotiation
 *    source, so "where do I get this card" is answerable from here too.
 *
 * Persona → card is the default; the reverse mirrors the skill-detail card
 * sources without leaving the fusion area.
 */
@Component({
  selector: 'app-itemization-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState, PersonaPicker, OwnershipBadge],
  template: `
    @if (data.ready()) {
      <div class="item">
        <div class="seg" role="tablist" aria-label="Itemization lookup">
          <button type="button" role="tab" class="seg__btn" [class.is-on]="mode() === 'persona'" [attr.aria-selected]="mode() === 'persona'" (click)="mode.set('persona')">
            <i class="pi pi-user" aria-hidden="true"></i> By persona
          </button>
          <button type="button" role="tab" class="seg__btn" [class.is-on]="mode() === 'card'" [attr.aria-selected]="mode() === 'card'" (click)="mode.set('card')">
            <i class="pi pi-id-card" aria-hidden="true"></i> By skill card
          </button>
        </div>

        @if (mode() === 'persona') {
          <section class="pick">
            <span class="pick__label">Persona to itemize</span>
            <app-persona-picker [options]="store.pickerOptions()" [(compendiumOnly)]="rosterMode" placeholder="Search a persona…" (picked)="personaId.set($event.id)" />
          </section>

          @if (persona(); as p) {
            <header class="subject">
              <div>
                <h2 class="subject__name"><a [routerLink]="nav.link('personas', p.id)">{{ p.name }}</a>
                  <app-ownership-badge [registered]="isOwned(p.id)" [level]="ownedLevel(p.id)" /></h2>
                <div class="subject__meta">
                  <span class="tag">{{ titleCase(p.arcana) }}</span>
                  <span class="tag">Lv {{ p.level }}</span>
                  <span class="tag">Cost {{ fmt(cost(p.id)) }}</span>
                </div>
              </div>
              <i class="pi pi-bolt subject__icon" aria-hidden="true"></i>
            </header>

            <div class="cards">
              <div class="card-col">
                <span class="card-col__lbl">Normal</span>
                @if (normalCard(); as c) {
                  @if (c.card; as card) {
                    <a class="card" [routerLink]="nav.link('skills', card.id)"><span class="el-dot" [attr.data-el]="card.element" aria-hidden="true"></span>{{ card.name }}<small>skill card</small></a>
                  } @else if (c.item) { <span class="card card--plain">{{ c.item }}<small>item</small></span> } @else { <span class="muted">—</span> }
                } @else { <span class="muted">—</span> }
              </div>
              <div class="card-col" [class.card-col--hl]="store.alarm()">
                <span class="card-col__lbl"><i class="pi pi-bell" aria-hidden="true"></i> Fusion Alarm</span>
                @if (alarmCard(); as c) {
                  @if (c.card; as card) {
                    <a class="card" [routerLink]="nav.link('skills', card.id)"><span class="el-dot" [attr.data-el]="card.element" aria-hidden="true"></span>{{ card.name }}<small>skill card</small></a>
                  } @else if (c.item) { <span class="card card--plain">{{ c.item }}<small>item</small></span> } @else { <span class="muted">—</span> }
                } @else { <span class="muted">—</span> }
              </div>
            </div>
            @if (!hasAnyItem()) {
              <p class="note">{{ p.name }} does not itemize to a skill card.</p>
            } @else if (!store.alarm()) {
              <p class="note">Fusion Alarm is off — its variant can differ. <a [routerLink]="nav.link('settings')">Toggle it in Settings</a>.</p>
            }
          } @else {
            <p class="prompt">Pick a persona to see the skill card it produces.</p>
          }
        } @else {
          <section class="pick">
            <span class="pick__label">Skill card</span>
            <app-persona-picker [options]="skillOptions()" placeholder="Search a skill card…" (picked)="skillId.set($event.id)" />
          </section>

          @if (skill(); as s) {
            <header class="subject">
              <div>
                <h2 class="subject__name"><a [routerLink]="nav.link('skills', s.id)"><span class="el-dot" [attr.data-el]="s.element" aria-hidden="true"></span>{{ s.name }}</a></h2>
                <div class="subject__meta"><span class="tag">{{ elementName(s.element) }} card</span></div>
              </div>
              <i class="pi pi-id-card subject__icon" aria-hidden="true"></i>
            </header>

            <div class="cards">
              <div class="card-col">
                <span class="card-col__lbl">Normal itemization from</span>
                @if (normalFrom().length) {
                  <div class="pills">
                    @for (src of normalFrom(); track src.id) {
                      <a class="pill" [routerLink]="nav.link('personas', src.id)">{{ src.name }} <app-ownership-badge [registered]="src.owned" [level]="src.ownedLevel" /></a>
                    }
                  </div>
                } @else { <span class="muted">—</span> }
              </div>
              <div class="card-col" [class.card-col--hl]="store.alarm()">
                <span class="card-col__lbl"><i class="pi pi-bell" aria-hidden="true"></i> Fusion Alarm itemization from</span>
                @if (alarmFrom().length) {
                  <div class="pills">
                    @for (src of alarmFrom(); track src.id) {
                      <a class="pill" [routerLink]="nav.link('personas', src.id)">{{ src.name }} <app-ownership-badge [registered]="src.owned" [level]="src.ownedLevel" /></a>
                    }
                  </div>
                } @else { <span class="muted">—</span> }
              </div>
            </div>
            @if (negotiationFrom().length) {
              <p class="note"><i class="pi pi-comments" aria-hidden="true"></i> Also negotiable from:
                @for (n of negotiationFrom(); track n.id; let last = $last) {
                  <a [routerLink]="nav.link('shadow', n.id)">{{ n.name }}</a>@if (!last) {, }
                }
              </p>
            }
          } @else {
            <p class="prompt">Pick a skill card to see which personas itemize to it.</p>
          }
        }
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .item { display: flex; flex-direction: column; gap: 1.1rem; }
    .seg { display: inline-flex; gap: 0.25rem; padding: 0.25rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.25)); border-radius: 999px; align-self: flex-start; }
    .seg__btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.9rem; border: 0; border-radius: 999px; background: transparent; color: var(--p-text-muted-color); font: inherit; cursor: pointer; &:hover { color: var(--p-text-color); } &.is-on { background: var(--p-primary-color); color: var(--p-primary-contrast-color, #fff); } }

    .pick { display: flex; flex-direction: column; gap: 0.4rem; max-width: 32rem; }
    .pick__label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--p-text-muted-color); }

    .subject { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: 1rem 1.15rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.25)); border-radius: 10px; background: var(--p-surface-800, rgba(127,127,127,0.05)); }
    .subject__name { margin: 0 0 0.45rem; font-size: 1.35rem; display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; a { color: var(--p-text-color); text-decoration: none; display: inline-flex; align-items: center; gap: 0.4rem; &:hover { color: var(--p-primary-color); } } }
    .subject__meta { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .tag { padding: 0.15rem 0.55rem; border-radius: 999px; background: var(--p-surface-700, rgba(127,127,127,0.18)); font-size: 0.82rem; }
    .subject__icon { font-size: 1.6rem; color: var(--p-primary-color); opacity: 0.6; }

    .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .card-col { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.9rem 1rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.18)); border-radius: 8px; background: var(--p-content-background); }
    .card-col--hl { border-color: color-mix(in srgb, var(--p-primary-color) 45%, transparent); }
    .card-col__lbl { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--p-text-muted-color); }
    .card { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 1.1rem; font-weight: 600; color: var(--p-text-color); text-decoration: none; small { font-size: 0.7rem; font-weight: 400; color: var(--p-text-muted-color); text-transform: uppercase; letter-spacing: 0.03em; } &:hover { color: var(--p-primary-color); } }
    .card--plain { font-weight: 500; }
    .muted { color: var(--p-text-muted-color); }

    .pills { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .pill { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.25rem 0.6rem; border-radius: 999px; background: var(--p-surface-700, rgba(127,127,127,0.16)); color: var(--p-text-color); text-decoration: none; font-size: 0.85rem; &:hover { color: var(--p-primary-color); } }

    .note { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; margin: 0; padding: 0.5rem 0.7rem; border-radius: 6px; background: var(--p-surface-700, rgba(127,127,127,0.12)); font-size: 0.85rem; color: var(--p-text-muted-color); a { color: var(--p-primary-color); } }
    .prompt { color: var(--p-text-muted-color); padding: 1.25rem 0; text-align: center; }

    @media (max-width: 560px) { .cards { grid-template-columns: 1fr; } }
  `,
})
export class ItemizationPage {
  protected readonly data = inject(GameDataService);
  protected readonly store = inject(FusionStore);
  protected readonly nav = inject(GameRouteContext);
  protected readonly titleCase = titleCase;

  protected readonly mode = signal<Mode>('persona');
  protected readonly rosterMode = signal(true);
  protected readonly personaId = signal<string | null>(null);
  protected readonly skillId = signal<string | null>(null);

  // ---- persona → card ---------------------------------------------------

  protected readonly persona = computed<Persona | undefined>(() => {
    const id = this.personaId();
    return id ? this.store.persona(id) : undefined;
  });

  protected readonly normalCard = computed<ItemCard | null>(() => this.cardFor('normal'));
  protected readonly alarmCard = computed<ItemCard | null>(() => this.cardFor('alarm'));

  protected readonly hasAnyItem = computed<boolean>(() => {
    const p = this.persona();
    if (!p) return false;
    const it = p.itemization;
    return !!(it.normal || it.alarm || it.normalItem || it.alarmItem);
  });

  private cardFor(kind: 'normal' | 'alarm'): ItemCard | null {
    const p = this.persona();
    if (!p) return null;
    const skillId = kind === 'normal' ? p.itemization.normal : p.itemization.alarm;
    const item = kind === 'normal' ? p.itemization.normalItem : p.itemization.alarmItem;
    const skill = skillId ? this.store.skill(skillId) : undefined;
    return { card: skill ? { id: skill.id, name: skill.name, element: skill.element } : null, item };
  }

  // ---- card → personas (reverse index) ----------------------------------

  /** Only skills that are actually itemization results, so the search is useful. */
  protected readonly skillOptions = computed<PickerOption[]>(() =>
    (this.data.data()?.skills ?? [])
      .filter((s) => s.cardSources.some((c) => c.kind === 'itemization' || c.kind === 'itemization-alarm'))
      .map((s) => ({ id: s.id, name: s.name, arcana: this.elementName(s.element) })),
  );

  protected readonly skill = computed<Skill | undefined>(() => {
    const id = this.skillId();
    return id ? this.store.skill(id) : undefined;
  });

  protected readonly normalFrom = computed<SourceRef[]>(() => this.sourcesOfKind('itemization'));
  protected readonly alarmFrom = computed<SourceRef[]>(() => this.sourcesOfKind('itemization-alarm'));

  protected readonly negotiationFrom = computed<{ id: string; name: string }[]>(() => {
    const s = this.skill();
    if (!s) return [];
    return s.cardSources
      .filter((c) => c.kind === 'negotiation')
      .map((c) => ({ id: c.from, name: this.store.shadowsById().get(c.from)?.name ?? c.from }));
  });

  private sourcesOfKind(kind: 'itemization' | 'itemization-alarm'): SourceRef[] {
    const s = this.skill();
    if (!s) return [];
    const owned = this.store.ownedEntries();
    return s.cardSources
      .filter((c) => c.kind === kind)
      .map((c) => ({
        id: c.from,
        name: this.store.personaName(c.from),
        owned: owned.has(c.from),
        ownedLevel: owned.get(c.from)?.level ?? null,
      }));
  }

  // ---- shared helpers ---------------------------------------------------

  protected isOwned(id: string): boolean {
    return this.store.ownedEntries().has(id);
  }

  protected ownedLevel(id: string): number | null {
    return this.store.ownedEntries().get(id)?.level ?? null;
  }

  protected cost(id: string): number {
    const c = this.store.engine()?.summonCost(id) ?? Number.NaN;
    return Number.isNaN(c) ? 0 : c;
  }

  /** Group a yen figure inline — see {@link ReverseCalculator.fmt} for why not DecimalPipe. */
  protected fmt(n: number): string {
    return n.toLocaleString('en-US');
  }

  protected elementName(el: string): string {
    return SKILL_ELEMENT_NAMES[el as keyof typeof SKILL_ELEMENT_NAMES] ?? el;
  }
}
