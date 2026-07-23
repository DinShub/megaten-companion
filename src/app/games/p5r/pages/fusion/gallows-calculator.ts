import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { InheritMask } from '../../../../shared/inherit-mask/inherit-mask';
import { OwnershipBadge } from '../../../../shared/ownership-badge/ownership-badge';
import { PersonaPicker } from '../../../../shared/persona-picker/persona-picker';
import { SkillChip } from '../../../../shared/skill-chip/skill-chip';
import type { GallowsPlan } from '../../fusion';
import type { Persona } from '../../model';
import { inheritNote, titleCase } from '../../ui/format';
import { FusionStore } from './fusion.store';

/** One of the sacrifice's skills, resolved for display with its transfer verdict. */
interface SkillRow {
  readonly id: string;
  readonly name: string;
  readonly element: string;
  readonly eligible: boolean;
  /** Set when ineligible — the greyed reason. */
  readonly note: string | null;
}

/**
 * Gallows calculator (§6.6, task 54). The Velvet Room guillotine is a **separate
 * operation from fusion**: sacrifice one persona to strengthen another, granting
 * EXP and optionally transferring **one** of the sacrifice's skills. This page
 * answers the mechanically precise question — *which* of the sacrifice's skills
 * could transfer — under §6.6's two-part check: the skill must be inheritable by
 * the target's type (the same §6.5 masks the calculator uses) **and** the target
 * must have a free slot. Ineligible skills are shown greyed with the reason,
 * mirroring the forward calculator.
 *
 * The EXP is stated qualitatively, not as a figure: no gallows-EXP formula exists
 * upstream, so per principle 5 we do not invent one. The one sourced fact — that
 * Fusion Alarm substantially boosts the yield — is surfaced from the in-context
 * alarm toggle (task 55) in the shell above.
 */
@Component({
  selector: 'app-gallows-calculator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PersonaPicker, OwnershipBadge, SkillChip, InheritMask],
  template: `
    <div class="gal">
      <section class="roles">
        <div class="role">
          <span class="role__label"><i class="pi pi-arrow-up" aria-hidden="true"></i> Persona to strengthen</span>
          @if (targetId(); as id) {
            <div class="role__chip">
              <a class="role__name" [routerLink]="nav.link('personas', id)">{{ store.personaName(id) }}</a>
              <span class="role__meta">{{ chipMeta(id) }}</span>
              <app-ownership-badge [registered]="isOwned(id)" [level]="ownedLevel(id)" />
              <button type="button" class="role__x" (click)="targetId.set(null)" aria-label="Change persona to strengthen"><i class="pi pi-times" aria-hidden="true"></i></button>
            </div>
          } @else {
            <app-persona-picker [options]="store.pickerOptions()" [(compendiumOnly)]="rosterMode" placeholder="Persona to strengthen…" (picked)="targetId.set($event.id)" />
          }
        </div>

        <div class="role">
          <span class="role__label"><i class="pi pi-bolt" aria-hidden="true"></i> Persona to sacrifice</span>
          @if (sacrificeId(); as id) {
            <div class="role__chip">
              <a class="role__name" [routerLink]="nav.link('personas', id)">{{ store.personaName(id) }}</a>
              <span class="role__meta">{{ chipMeta(id) }}</span>
              <app-ownership-badge [registered]="isOwned(id)" [level]="ownedLevel(id)" />
              <button type="button" class="role__x" (click)="sacrificeId.set(null)" aria-label="Change persona to sacrifice"><i class="pi pi-times" aria-hidden="true"></i></button>
            </div>
          } @else {
            <app-persona-picker [options]="store.pickerOptions()" [(compendiumOnly)]="rosterMode" placeholder="Persona to sacrifice…" (picked)="sacrificeId.set($event.id)" />
          }
        </div>
      </section>

      @if (target(); as t) {
        @if (sacrifice(); as s) {
          @if (t.id === s.id) {
            <p class="note"><i class="pi pi-info-circle" aria-hidden="true"></i> Pick two different personas — a persona can't be sacrificed into itself.</p>
          } @else if (plan(); as p) {
            <section class="result">
              <header class="result__head">
                <div>
                  <span class="result__kicker">Strengthen</span>
                  <h2 class="result__name">
                    <a [routerLink]="nav.link('personas', t.id)">{{ t.name }}</a>
                    <app-ownership-badge [registered]="isOwned(t.id)" [level]="ownedLevel(t.id)" />
                  </h2>
                  <div class="result__meta">
                    <span class="tag">{{ titleCase(t.arcana) }}</span>
                    <span class="tag">Lv {{ t.level }}</span>
                    <span class="tag">{{ inheritLabel(t.inheritType) }} inherit</span>
                    <span class="tag" [class.tag--full]="p.freeSlots === 0">{{ p.freeSlots }} / 8 free slots</span>
                  </div>
                </div>
                <div class="result__mask">
                  <span class="mini">Inherits</span>
                  <app-inherit-mask [allowed]="store.inheritMask(t.inheritType)" />
                </div>
              </header>

              <div class="exp">
                <i class="pi pi-sparkles exp__icon" aria-hidden="true"></i>
                <div class="exp__body">
                  <p class="exp__main">Sacrificing <strong>{{ s.name }}</strong> (Lv {{ s.level }}) grants EXP toward <strong>{{ t.name }}</strong> — a higher-level sacrifice yields more.</p>
                  @if (store.alarm()) {
                    <p class="exp__alarm"><i class="pi pi-bell" aria-hidden="true"></i> Fusion Alarm is on — the EXP yield is substantially increased.</p>
                  } @else {
                    <p class="exp__hint"><i class="pi pi-bell-slash" aria-hidden="true"></i> Turn on Fusion Alarm above to substantially increase the yield.</p>
                  }
                  <p class="exp__foot">The exact EXP amount isn't in our data source, so only the skill transfer is computed.</p>
                </div>
              </div>

              @if (p.freeSlots === 0) {
                <p class="warn"><i class="pi pi-ban" aria-hidden="true"></i>
                  {{ t.name }}'s 8 skill slots are full — free one first, then a skill below can transfer.</p>
              }

              <section class="panel">
                <h3 class="panel__title">
                  Transferable skills
                  <span class="panel__sub">one transfers per sacrifice</span>
                </h3>
                @if (skillRows().length) {
                  <ul class="skills">
                    @for (row of skillRows(); track row.id) {
                      <li class="skills__row" [class.is-off]="!row.eligible || p.freeSlots === 0">
                        <app-skill-chip [name]="row.name" [element]="row.element" [unique]="row.note === 'Unique'" />
                        @if (row.note) { <span class="skills__note">{{ row.note }}</span> }
                        @else if (p.freeSlots === 0) { <span class="skills__note">No free slot</span> }
                        @else { <span class="skills__ok"><i class="pi pi-check" aria-hidden="true"></i> Can transfer</span> }
                      </li>
                    }
                  </ul>
                  <p class="panel__foot">
                    A skill transfers only if <strong>{{ t.name }}</strong> can inherit its element (§6.5) and has a
                    free slot. Unique skills and ones {{ t.name }} already knows never transfer.
                  </p>
                } @else {
                  <p class="muted">{{ s.name }} carries no skill to transfer.</p>
                }
              </section>
            </section>
          }
        } @else {
          <p class="prompt">Now pick a persona to sacrifice into {{ t.name }}.</p>
        }
      } @else {
        <p class="prompt">Pick a persona to strengthen and one to sacrifice.</p>
      }
    </div>
  `,
  styles: `
    .gal { display: flex; flex-direction: column; gap: 1.15rem; }
    .roles { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
    .role { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.75rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.25)); border-radius: 8px; background: var(--app-panel); }
    .role__label { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--p-text-muted-color); }
    .role__chip { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.6rem; }
    .role__name { font-weight: 700; color: var(--p-text-color); text-decoration: none; &:hover { color: var(--p-primary-color); } }
    .role__meta { font-size: 0.85rem; color: var(--p-text-muted-color); }
    .role__x { margin-left: auto; border: 0; background: transparent; color: var(--p-text-muted-color); font: inherit; cursor: pointer; padding: 0; }

    .result { display: flex; flex-direction: column; gap: 0.9rem; padding: 1.1rem 1.15rem; border: 1px solid var(--p-primary-color); border-radius: 10px; background: color-mix(in srgb, var(--p-primary-color) 5%, transparent); }
    .result__head { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between; align-items: flex-start; }
    .result__kicker, .mini, .panel__title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--p-text-muted-color); }
    .result__name { margin: 0.15rem 0 0.45rem; font-size: 1.5rem; display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; a { color: var(--p-text-color); text-decoration: none; &:hover { color: var(--p-primary-color); } } }
    .result__meta { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .result__mask { display: flex; flex-direction: column; gap: 0.3rem; min-width: 12rem; }
    .tag { padding: 0.15rem 0.55rem; border-radius: 999px; background: var(--app-panel-2); font-size: 0.82rem; }
    .tag--full { color: var(--app-warn); background: color-mix(in srgb, #f59e0b 16%, transparent); }

    .exp { display: flex; gap: 0.65rem; padding: 0.8rem 0.95rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.18)); border-radius: 8px; background: var(--p-content-background); }
    .exp__icon { color: var(--p-primary-color); font-size: 1.15rem; margin-top: 0.1rem; }
    .exp__body { display: flex; flex-direction: column; gap: 0.3rem; }
    .exp__main { margin: 0; }
    .exp__alarm { margin: 0; display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.88rem; color: var(--p-primary-color); }
    .exp__hint { margin: 0; display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.88rem; color: var(--p-text-muted-color); }
    .exp__foot { margin: 0.1rem 0 0; font-size: 0.75rem; color: var(--p-text-muted-color); }

    .warn { display: flex; align-items: center; gap: 0.45rem; margin: 0; padding: 0.5rem 0.7rem; border-radius: 6px; background: color-mix(in srgb, #f59e0b 14%, transparent); font-size: 0.88rem; }
    .note { display: flex; align-items: center; gap: 0.45rem; margin: 0; padding: 0.5rem 0.7rem; border-radius: 6px; background: var(--app-panel-2); color: var(--p-text-muted-color); font-size: 0.9rem; }

    .panel { padding: 0.9rem 1rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.18)); border-radius: 8px; background: var(--p-content-background); }
    .panel__title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem; margin: 0 0 0.7rem; }
    .panel__sub { font-size: 0.72rem; text-transform: none; letter-spacing: 0; color: var(--p-text-muted-color); }
    .panel__foot { margin: 0.7rem 0 0; font-size: 0.78rem; color: var(--p-text-muted-color); }
    .skills { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem 0.9rem; }
    .skills__row { display: inline-flex; align-items: center; gap: 0.35rem; }
    .skills__row.is-off { opacity: 0.5; }
    .skills__note { font-size: 0.72rem; color: var(--p-text-muted-color); }
    .skills__ok { display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.72rem; color: var(--app-success); }
    .muted { color: var(--p-text-muted-color); }

    .prompt { color: var(--p-text-muted-color); padding: 1.5rem 0; text-align: center; }
    a { color: var(--p-primary-color); }

    @media (max-width: 560px) { .roles { grid-template-columns: 1fr; } }
  `,
})
export class GallowsCalculator {
  protected readonly store = inject(FusionStore);
  protected readonly nav = inject(GameRouteContext);
  protected readonly titleCase = titleCase;

  protected readonly targetId = signal<string | null>(null);
  protected readonly sacrificeId = signal<string | null>(null);
  /** Shared across both pickers: start on the compendium — you gallows what you own. */
  protected readonly rosterMode = signal(true);

  protected readonly target = computed<Persona | undefined>(() => {
    const id = this.targetId();
    return id ? this.store.persona(id) : undefined;
  });

  protected readonly sacrifice = computed<Persona | undefined>(() => {
    const id = this.sacrificeId();
    return id ? this.store.persona(id) : undefined;
  });

  protected readonly plan = computed<GallowsPlan | null>(() => {
    const engine = this.store.engine();
    const s = this.sacrificeId();
    const t = this.targetId();
    // Depend only on the compendium (the sole input to `gallows`), not the whole
    // `ctx()` — otherwise the in-header alarm/level/unlock toggles would each
    // needlessly re-run the engine for an identical verdict list.
    if (!engine || !s || !t || s === t) return null;
    return engine.gallows(s, t, this.store.ownedEntries());
  });

  /** The sacrifice's skills, verdict-mapped and sorted: transferable first. */
  protected readonly skillRows = computed<SkillRow[]>(() => {
    const p = this.plan();
    if (!p) return [];
    const rows = p.skills.map((opt): SkillRow => {
      const skill = this.store.skill(opt.skillId);
      return {
        id: opt.skillId,
        name: skill?.name ?? opt.skillId,
        element: skill?.element ?? 'passive',
        eligible: opt.eligible,
        note: inheritNote(opt.reason, opt.blockingElement),
      };
    });
    // Eligible first, then alphabetical — the greyed, blocked ones sink to the end.
    return rows.sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.name.localeCompare(b.name));
  });

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

  protected inheritLabel(type: string): string {
    return type === 'none' ? 'None' : titleCase(type);
  }
}
