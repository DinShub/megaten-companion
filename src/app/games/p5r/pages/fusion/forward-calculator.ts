import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { InheritMask } from '../../../../shared/inherit-mask/inherit-mask';
import { OwnershipBadge } from '../../../../shared/ownership-badge/ownership-badge';
import { PersonaPicker } from '../../../../shared/persona-picker/persona-picker';
import { SkillChip } from '../../../../shared/skill-chip/skill-chip';
import type { FusionOutcome, FusionPath } from '../../fusion';
import type { Persona } from '../../model';
import { inheritNote, titleCase } from '../../ui/format';
import { FusionStore } from './fusion.store';

const PATH_LABEL: Record<FusionPath, string> = {
  'different-arcana': 'Standard fusion',
  'same-arcana': 'Same-arcana fusion',
  treasure: 'Treasure fusion',
  advanced: 'Advanced fusion',
};

/** A parent's contributed skill with its §6.5 eligibility for the result. */
interface InheritRow {
  readonly id: string;
  readonly name: string;
  readonly element: string;
  readonly eligible: boolean;
  /** Set when ineligible — the reason to show greyed. */
  readonly note: string | null;
}

interface TraitOption {
  readonly id: string;
  readonly name: string;
  /** Which parent it comes from, for the label. */
  readonly from: string;
}

interface ItemCard {
  readonly card: { id: string; name: string; element: string } | null;
  readonly item: string | null;
}

/**
 * Forward fusion calculator (§4.7.1, task 41). Pick two personas — or a 2–6
 * ingredient advanced set — and see the result, its level (with the level-cap
 * warning), the inheritable skill pool with **ineligible skills greyed and
 * labelled with the blocking element**, a selectable parent trait, and, when the
 * Fusion Alarm is on, the alarm itemization variant of the result side by side.
 * Invalid pairings are explained, never blanked (§1.1 principle 3).
 *
 * Parent pickers default to the compendium (§4.7.1) — you fuse from what you own
 * — with a per-picker toggle to the full roster.
 */
@Component({
  selector: 'app-forward-calculator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PersonaPicker, OwnershipBadge, SkillChip, InheritMask],
  template: `
    <div class="fwd">
      <section class="ingredients">
        <div class="slots">
          @for (slot of slots(); track $index; let i = $index) {
            <div class="slot">
              <span class="slot__label">{{ slotLabel(i) }}</span>
              @if (slot; as id) {
                <div class="slot__chip">
                  <a class="slot__name" [routerLink]="nav.link('personas', id)">{{ store.personaName(id) }}</a>
                  <span class="slot__meta">{{ chipMeta(id) }}</span>
                  <app-ownership-badge [registered]="isOwned(id)" [level]="ownedLevel(id)" />
                  <button type="button" class="slot__x" (click)="clearSlot(i)" [attr.aria-label]="'Change ' + slotLabel(i)"><i class="pi pi-times" aria-hidden="true"></i></button>
                </div>
              } @else {
                <app-persona-picker
                  [options]="store.pickerOptions()"
                  [(compendiumOnly)]="rosterMode"
                  [placeholder]="slotLabel(i) + '…'"
                  (picked)="setSlot(i, $event.id)"
                />
              }
              @if (i >= 2) {
                <button type="button" class="slot__remove" (click)="removeSlot(i)">Remove</button>
              }
            </div>
          }
        </div>
        <div class="ingredients__actions">
          @if (slots().length < 6) {
            <button type="button" class="ghost" (click)="addSlot()"><i class="pi pi-plus" aria-hidden="true"></i> Add ingredient</button>
          }
          <span class="hint">{{ modeHint() }}</span>
        </div>
      </section>

      @if (outcome(); as o) {
        @if (o.ok && result(); as r) {
          <section class="result">
            <header class="result__head">
              <div>
                <span class="result__path">{{ pathLabel(o.path) }}</span>
                <h2 class="result__name">
                  <a [routerLink]="nav.link('personas', r.id)">{{ r.name }}</a>
                  <app-ownership-badge [registered]="isOwned(r.id)" [level]="ownedLevel(r.id)" />
                </h2>
                <div class="result__meta">
                  <span class="tag">{{ titleCase(r.arcana) }}</span>
                  <span class="tag">Lv {{ r.level }}</span>
                  <span class="tag">{{ inheritLabel(r.inheritType) }} inherit</span>
                </div>
              </div>
              <div class="result__mask">
                <span class="mini">Inherits</span>
                <app-inherit-mask [allowed]="store.inheritMask(r.inheritType)" />
              </div>
            </header>

            @if (o.blockedByLevel) {
              <p class="warn"><i class="pi pi-lock" aria-hidden="true"></i>
                Available at level {{ r.level }} — your protagonist is level {{ store.protagonistLevel() }}.
                <a [routerLink]="nav.link('settings')">Raise it or lift the cap</a>.</p>
            }
            @if (o.clampedToCeiling) {
              <p class="warn"><i class="pi pi-arrow-up" aria-hidden="true"></i>
                The parents overshoot {{ titleCase(r.arcana) }}'s top — clamped to its highest persona.</p>
            }
            @if (downshift()) {
              <p class="warn"><i class="pi pi-arrow-down" aria-hidden="true"></i>
                The treasure demon shifts this <strong>down</strong> the arcana — not an upgrade.</p>
            }

            <div class="panels">
              <section class="panel panel--skills">
                <h3 class="panel__title">Inheritable skills</h3>
                @if (inheritRows().length) {
                  <ul class="skills">
                    @for (s of inheritRows(); track s.id) {
                      <li class="skills__row" [class.is-off]="!s.eligible">
                        <app-skill-chip [name]="s.name" [element]="s.element" [unique]="!s.eligible && s.note === 'Unique'" />
                        @if (!s.eligible) { <span class="skills__note">{{ s.note }}</span> }
                      </li>
                    }
                  </ul>
                  <p class="panel__foot">
                    Shows every skill the parents carry. The real game caps <em>inherited</em> skills at
                    2–4 by level; that rule is unsourced, so only the 8-slot capacity is enforced (§6.5) —
                    the deliverable set may be slightly smaller.
                  </p>
                } @else {
                  <p class="muted">Neither parent carries an inheritable skill.</p>
                }
              </section>

              <aside class="panel panel--side">
                @if (traitOptions().length) {
                  <h3 class="panel__title">Trait</h3>
                  <div class="traits">
                    @for (t of traitOptions(); track t.id) {
                      <button
                        type="button"
                        class="trait"
                        [class.is-sel]="t.id === selectedTraitId()"
                        (click)="selectedTrait.set(t.id)"
                      >{{ t.name }}<small>{{ t.from }}</small></button>
                    }
                  </div>
                }

                <h3 class="panel__title">Itemizes to</h3>
                <div class="cards">
                  <div class="cards__col">
                    <span class="cards__lbl">Normal</span>
                    @if (normalCard(); as c) {
                      @if (c.card; as card) {
                        <a class="card" [routerLink]="nav.link('skills', card.id)"><span class="el-dot" [attr.data-el]="card.element" aria-hidden="true"></span>{{ card.name }} card</a>
                      } @else if (c.item) { <span class="card">{{ c.item }}</span> } @else { <span class="muted">—</span> }
                    } @else { <span class="muted">—</span> }
                  </div>
                  @if (store.alarm()) {
                    <div class="cards__col">
                      <span class="cards__lbl"><i class="pi pi-bell" aria-hidden="true"></i> Fusion Alarm</span>
                      @if (alarmCard(); as c) {
                        @if (c.card; as card) {
                          <a class="card" [routerLink]="nav.link('skills', card.id)"><span class="el-dot" [attr.data-el]="card.element" aria-hidden="true"></span>{{ card.name }} card</a>
                        } @else if (c.item) { <span class="card">{{ c.item }}</span> } @else { <span class="muted">—</span> }
                      } @else { <span class="muted">—</span> }
                    </div>
                  } @else {
                    <span class="cards__hint">Turn on Fusion Alarm in <a [routerLink]="nav.link('settings')">Settings</a> to compare.</span>
                  }
                </div>
              </aside>
            </div>
          </section>
        } @else if (!o.ok) {
          <section class="invalid" role="alert">
            <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
            <div>
              <p class="invalid__msg">{{ invalidMessage(o) }}</p>
              @if (invalidHint(o); as h) { <p class="invalid__hint">{{ h }}</p> }
            </div>
          </section>
        }
      } @else {
        <p class="prompt">Choose at least two personas to see what they make.</p>
      }
    </div>
  `,
  styles: `
    .fwd { display: flex; flex-direction: column; gap: 1.25rem; }
    .slots { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 0.75rem; }
    .slot { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.75rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.25)); border-radius: 8px; background: var(--app-panel); }
    .slot__label, .cards__lbl, .mini, .result__path, .panel__title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--p-text-muted-color); }
    .slot__meta, .slot__x, .slot__remove, .hint, .muted, .cards__hint, .panel__foot, .skills__note, .trait small { color: var(--p-text-muted-color); }
    .slot__chip { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.6rem; }
    .slot__name { font-weight: 700; color: var(--p-text-color); text-decoration: none; }
    .slot__x, .slot__remove, .ghost, .trait { border: 0; background: transparent; font: inherit; cursor: pointer; padding: 0; }
    .slot__x { margin-left: auto; }
    .slot__remove { align-self: flex-start; font-size: 0.8rem; text-decoration: underline; }
    .ingredients__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-top: 0.75rem; }
    .ghost { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.7rem; border: 1px dashed var(--p-content-border-color, rgba(127,127,127,0.4)); border-radius: 999px; color: var(--p-text-color); }
    .slot__meta, .hint, .ghost { font-size: 0.85rem; }

    .result { display: flex; flex-direction: column; gap: 0.9rem; padding: 1.1rem 1.15rem; border: 1px solid var(--p-primary-color); border-radius: 10px; background: color-mix(in srgb, var(--p-primary-color) 5%, transparent); }
    .result__head { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between; align-items: flex-start; }
    .result__name { margin: 0.15rem 0 0.45rem; font-size: 1.5rem; display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; }
    .result__name a { color: var(--p-text-color); text-decoration: none; }
    .result__meta, .skills, .traits, .cards { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .result__mask { display: flex; flex-direction: column; gap: 0.3rem; min-width: 12rem; }
    .tag { padding: 0.15rem 0.55rem; border-radius: 999px; background: var(--app-panel-2); font-size: 0.82rem; }

    .warn { display: flex; align-items: center; gap: 0.45rem; margin: 0; padding: 0.5rem 0.7rem; border-radius: 6px; background: color-mix(in srgb, #f59e0b 12%, transparent); font-size: 0.88rem; }
    a { color: var(--p-primary-color); }

    .panels { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; }
    .panel { padding: 0.9rem 1rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.18)); border-radius: 8px; background: var(--p-content-background); }
    .panel__title { margin: 0 0 0.6rem; }
    .panel__title:not(:first-child) { margin-top: 1.1rem; }
    .panel__foot { margin: 0.7rem 0 0; font-size: 0.78rem; }
    .skills__note, .trait small { font-size: 0.72rem; }

    .skills { list-style: none; margin: 0; padding: 0; }
    .skills__row { display: inline-flex; align-items: center; gap: 0.35rem; }
    .skills__row.is-off { opacity: 0.5; }

    .trait { display: inline-flex; flex-direction: column; gap: 0.1rem; padding: 0.3rem 0.6rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); border-radius: 8px; color: var(--p-text-color); }
    .trait.is-sel { border-color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 12%, transparent); }
    .cards { gap: 1rem; }
    .cards__col { display: flex; flex-direction: column; gap: 0.3rem; }
    .card { display: inline-flex; align-items: center; gap: 0.4rem; color: var(--p-text-color); text-decoration: none; }

    .invalid { display: flex; gap: 0.7rem; padding: 1rem 1.15rem; border-radius: 8px; background: color-mix(in srgb, #f59e0b 12%, transparent); }
    .invalid .pi { color: var(--app-warn); font-size: 1.2rem; }
    .invalid__msg { margin: 0; font-weight: 600; }
    .invalid__hint { margin: 0.3rem 0 0; font-size: 0.85rem; color: var(--p-text-muted-color); }
    .prompt { color: var(--p-text-muted-color); padding: 1.5rem 0; text-align: center; }

    @media (max-width: 640px) { .panels { grid-template-columns: 1fr; } }
  `,
})
export class ForwardCalculator {
  protected readonly store = inject(FusionStore);
  protected readonly nav = inject(GameRouteContext);
  protected readonly titleCase = titleCase;

  /** Ingredient slots: null = empty (shows a picker), else a chosen persona id. */
  protected readonly slots = signal<(string | null)[]>([null, null]);
  /** Shared across all pickers: start on the compendium, toggle to the roster. */
  protected readonly rosterMode = signal(true);
  protected readonly selectedTrait = signal<string | null>(null);

  private readonly parentIds = computed(() =>
    this.slots().filter((id): id is string => id != null),
  );

  protected readonly outcome = computed<FusionOutcome | null>(() => {
    const engine = this.store.engine();
    const ids = this.parentIds();
    if (!engine || ids.length < 2) return null;
    return engine.fuse(ids, this.store.ctx());
  });

  protected readonly result = computed<Persona | undefined>(() => {
    const o = this.outcome();
    return o?.ok ? this.store.persona(o.resultId) : undefined;
  });

  /** True when a treasure fusion shifted the result below its non-treasure parent (§6.1). */
  protected readonly downshift = computed<boolean>(() => {
    const o = this.outcome();
    const r = this.result();
    if (!o?.ok || o.path !== 'treasure' || !r) return false;
    const treasures = this.store.treasureIds();
    const base = this.parentIds()
      .map((id) => this.store.persona(id))
      .find((p) => p && !treasures.has(p.id));
    return base != null && r.level < base.level;
  });

  protected readonly inheritRows = computed<InheritRow[]>(() => {
    const engine = this.store.engine();
    const o = this.outcome();
    if (!engine || !o?.ok) return [];
    const rows = engine.inheritableSkills(this.parentIds(), o.resultId, this.store.ctx()).map((e) => {
      const skill = this.store.skill(e.skillId);
      return {
        id: e.skillId,
        name: skill?.name ?? e.skillId,
        element: skill?.element ?? 'passive',
        eligible: e.eligible,
        note: inheritNote(e.reason, e.blockingElement),
      };
    });
    // Eligible first, then alphabetical — the greyed, blocked ones sink to the end.
    return rows.sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.name.localeCompare(b.name));
  });

  protected readonly traitOptions = computed<TraitOption[]>(() => {
    const out: TraitOption[] = [];
    const seen = new Set<string>();
    for (const id of this.parentIds()) {
      const entry = this.store.entryFor(id);
      const traitId = entry?.traitId ?? this.store.persona(id)?.traitId ?? null;
      if (!traitId || seen.has(traitId)) continue;
      seen.add(traitId);
      out.push({ id: traitId, name: this.store.traitName(traitId) ?? traitId, from: this.store.personaName(id) });
    }
    return out;
  });

  /** The effective trait: the user's pick if still valid, else the first parent's. */
  protected readonly selectedTraitId = computed<string | null>(() => {
    const options = this.traitOptions();
    const sel = this.selectedTrait();
    if (sel && options.some((o) => o.id === sel)) return sel;
    return options[0]?.id ?? null;
  });

  protected readonly normalCard = computed<ItemCard | null>(() => this.cardFor('normal'));
  protected readonly alarmCard = computed<ItemCard | null>(() => this.cardFor('alarm'));

  private cardFor(kind: 'normal' | 'alarm'): ItemCard | null {
    const r = this.result();
    if (!r) return null;
    const skillId = kind === 'normal' ? r.itemization.normal : r.itemization.alarm;
    const item = kind === 'normal' ? r.itemization.normalItem : r.itemization.alarmItem;
    const skill = skillId ? this.store.skill(skillId) : undefined;
    return {
      card: skill ? { id: skill.id, name: skill.name, element: skill.element } : null,
      item,
    };
  }

  // ---- slot editing -----------------------------------------------------

  protected slotLabel(i: number): string {
    return i < 2 ? `Parent ${i + 1}` : `Ingredient ${i + 1}`;
  }

  protected setSlot(i: number, id: string): void {
    this.slots.update((s) => s.map((v, idx) => (idx === i ? id : v)));
  }

  protected clearSlot(i: number): void {
    this.slots.update((s) => s.map((v, idx) => (idx === i ? null : v)));
  }

  protected addSlot(): void {
    this.slots.update((s) => (s.length < 6 ? [...s, null] : s));
  }

  protected removeSlot(i: number): void {
    this.slots.update((s) => (s.length > 2 ? s.filter((_, idx) => idx !== i) : s));
  }

  protected modeHint(): string {
    const n = this.parentIds().length;
    if (n < 2) return 'Pick two personas to fuse.';
    if (this.slots().length > 2) return `${this.slots().length} ingredients — advanced fusion only.`;
    return 'Two parents — normal fusion.';
  }

  // ---- display helpers --------------------------------------------------

  protected isOwned(id: string): boolean {
    return this.store.ownedEntries().has(id);
  }

  protected ownedLevel(id: string): number | null {
    return this.store.ownedEntries().get(id)?.level ?? null;
  }

  protected chipMeta(id: string): string {
    const p = this.store.persona(id);
    return p ? `${titleCase(p.arcana)} · Lv ${p.level}` : '';
  }

  protected pathLabel(path: FusionPath): string {
    return PATH_LABEL[path];
  }

  protected inheritLabel(type: string): string {
    return type === 'none' ? 'None' : titleCase(type);
  }

  protected invalidMessage(o: Extract<FusionOutcome, { ok: false }>): string {
    switch (o.code) {
      case 'duplicate-parents':
        return 'You picked the same persona twice.';
      case 'party-ingredient':
        return 'Party personas (Arsene, Captain Kidd…) can never be fusion material.';
      case 'no-arcana-result':
        return 'These two arcana have no fusion result.';
      case 'treasure-pair':
        return 'Two treasure demons cannot be fused together.';
      default:
        return o.message;
    }
  }

  protected invalidHint(o: Extract<FusionOutcome, { ok: false }>): string | null {
    switch (o.code) {
      case 'duplicate-parents':
        return 'Fusion needs two different personas.';
      case 'no-arcana-result':
        return 'Try a different pairing — not every arcana combination is valid.';
      case 'treasure-out-of-range':
        return 'The rank shift falls off the end of the arcana. Pair the treasure demon with a different persona.';
      case 'no-advanced-recipe':
        return 'More than two ingredients only fuse via a fixed advanced recipe, and this set matches none.';
      default:
        return null;
    }
  }
}
