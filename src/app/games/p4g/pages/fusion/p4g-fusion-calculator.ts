import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { InheritMask } from '../../../../shared/inherit-mask/inherit-mask';
import { LoadState } from '../../../../shared/load-state/load-state';
import { OwnershipBadge } from '../../../../shared/ownership-badge/ownership-badge';
import { PersonaPicker } from '../../../../shared/persona-picker/persona-picker';
import { SkillChip } from '../../../../shared/skill-chip/skill-chip';
import { P4gDataService } from '../../data/p4g-data.service';
import type { FusionOutcome, FusionPath, FusionSuccess, Recipe } from '../../fusion';
import type { Persona } from '../../model';
import { arcanaLabel, formatLevel, inheritNote, inheritRow, KIND_LABEL, P4G_INHERIT_ELEMENTS } from '../../ui/p4g-format';
import { P4gRecipeTable } from '../../ui/p4g-recipe-table';
import { P4gFusionStore } from './p4g-fusion.store';

type Mode = 'forward' | 'reverse';

const PATH_LABEL: Record<FusionPath, string> = {
  normal: 'Normal fusion',
  'same-arcana': 'Same-arcana fusion',
  triangle: 'Triangle fusion',
  special: 'Special fusion',
};

/**
 * The P4G fusion calculator: **forward** (two personas, or three for a
 * triangle → the result, its level gate and the inheritable-skill pool with
 * refused skills greyed and labelled) and **reverse** (target → every pair, its
 * special recipe, and on request every triangle). `?target=<id>` deep-links
 * reverse mode; `?a=&b=&c=` deep-links a forward fusion.
 *
 * The Midnight Channel skin shows the result as a broadcast: the panel is the
 * TV set, `.calc__ticker` the "Now showing" bar that explains the rule.
 */
@Component({
  selector: 'app-p4g-fusion-calculator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState, PersonaPicker, OwnershipBadge, InheritMask, SkillChip, P4gRecipeTable],
  template: `
    @if (data.ready()) {
      <div class="p4-page">
        <div class="calc__modes">
          <div class="p4-seg" role="group" aria-label="Calculator mode">
            <button type="button" [class.is-on]="mode() === 'forward'" [attr.aria-pressed]="mode() === 'forward'" (click)="mode.set('forward')">
              <i class="pi pi-arrow-right" aria-hidden="true"></i> Forward
            </button>
            <button type="button" [class.is-on]="mode() === 'reverse'" [attr.aria-pressed]="mode() === 'reverse'" (click)="mode.set('reverse')">
              <i class="pi pi-arrow-left" aria-hidden="true"></i> Reverse
            </button>
          </div>
          @if (mode() === 'forward') {
            <div class="p4-seg" role="group" aria-label="How many personas">
              <button type="button" [class.is-on]="slots().length === 2" [attr.aria-pressed]="slots().length === 2" (click)="setCount(2)">Two personas</button>
              <button type="button" [class.is-on]="slots().length === 3" [attr.aria-pressed]="slots().length === 3" (click)="setCount(3)">Triangle · three</button>
            </div>
          }
        </div>

        @if (mode() === 'forward') {
          <div class="calc__slots">
            @for (slot of slots(); track $index; let i = $index) {
              <div class="p4-panel calc__slot">
                <span class="p4-eyebrow calc__ch">CH {{ i + 1 }}</span>
                @if (slot; as id) {
                  <div class="calc__chip">
                    <a class="p4-strong" [routerLink]="nav.link('personas', id)">{{ store.personaName(id) }}</a>
                    <span class="p4-muted">{{ meta(id) }}</span>
                    <app-ownership-badge [registered]="store.isOwned(id)" [level]="store.ownedLevel(id)" />
                    <button type="button" class="p4-linkbtn" (click)="setSlot(i, null)" [attr.aria-label]="'Change persona ' + (i + 1)"><i class="pi pi-times" aria-hidden="true"></i></button>
                  </div>
                } @else {
                  <app-persona-picker [options]="store.pickerOptions()" [(compendiumOnly)]="rosterMode" placeholder="Search personas…" (picked)="setSlot(i, $event.id)" />
                }
              </div>
            }
          </div>

          @if (outcome(); as o) {
            @if (o.ok && result(); as r) {
              <!-- Keyed on the fusion, so a new one switches the set on again. -->
              @for (run of [fusionKey()]; track run) {
                <section class="p4-panel calc__result" aria-live="polite">
                  <h2>Result</h2>
                  <div class="calc__screen">
                    <div class="p4-detail-head calc__body">
                      <div>
                        <h3 class="calc__name">
                          <a [routerLink]="nav.link('personas', r.id)">{{ r.name }}</a>
                          <app-ownership-badge [registered]="store.isOwned(r.id)" [level]="store.ownedLevel(r.id)" />
                        </h3>
                        <div class="p4-tags">
                          <span class="p4-tag">{{ arcanaLabel(r.arcana) }}</span>
                          <span class="p4-tag">Lv {{ r.level }}</span>
                          <span class="p4-tag">{{ pathLabel[o.path] }}</span>
                        </div>
                      </div>
                      <div class="calc__mask">
                        <span class="p4-eyebrow">Can inherit</span>
                        <app-inherit-mask [allowed]="inheritRow(store.inheritMatrix(), r.inheritType)" [elements]="inheritElements" />
                      </div>
                    </div>
                    <p class="calc__ticker"><b>Now showing</b><span>{{ why(o) }}</span></p>
                  </div>

                  @if (o.blockedByLevel) {
                    <p class="p4-warn"><i class="pi pi-lock" aria-hidden="true"></i> {{ r.name }} is level {{ r.level }} — above your protagonist (Lv {{ store.protagonistLevel() }}). <a [routerLink]="nav.link('settings')">Raise it or lift the cap</a>.</p>
                  }
                  @if (o.clampedToCeiling) {
                    <p class="p4-warn"><i class="pi pi-arrow-up" aria-hidden="true"></i> The parents overshoot the {{ arcanaLabel(r.arcana) }} arcana — clamped to its highest persona.</p>
                  }

                  <h2>Inheritable skills</h2>
                  @if (inheritRows().length) {
                    <ul class="calc__skills">
                      @for (s of inheritRows(); track s.id) {
                        <li [class.is-off]="!s.eligible">
                          <app-skill-chip [name]="s.name" [element]="s.element" [unique]="s.note === 'Unique'" />
                          @if (s.note) { <small class="p4-muted">{{ s.note }}</small> }
                        </li>
                      }
                    </ul>
                    <p class="p4-note">Every skill the parents carry (registered parents: their recorded skills), checked against {{ r.name }}'s inheritance type. P4G lets you pick which ones carry over; only the 8-skill capacity is enforced here.</p>
                  } @else {
                    <p class="p4-muted">No parent carries a skill to pass on.</p>
                  }
                </section>
              }
            } @else if (!o.ok) {
              <p class="p4-invalid" role="alert"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i> {{ o.message }}</p>
            }
          } @else {
            <p class="p4-empty">No signal. Tune in {{ slots().length === 2 ? 'two personas' : 'three personas' }} to see what they make.</p>
          }
        } @else {
          <div class="p4-panel">
            <span class="p4-eyebrow">Target</span>
            @if (target(); as t) {
              <div class="calc__chip">
                <a class="p4-strong" [routerLink]="nav.link('personas', t.id)">{{ t.name }}</a>
                <span class="p4-muted">{{ arcanaLabel(t.arcana) }} · Lv {{ t.level }} · {{ kindLabel[t.kind] }}</span>
                <button type="button" class="p4-linkbtn" (click)="setTarget(null)" aria-label="Change target"><i class="pi pi-times" aria-hidden="true"></i></button>
              </div>
            } @else {
              <app-persona-picker [options]="store.pickerOptions()" [compendiumOnly]="false" placeholder="Which persona do you want?" (picked)="setTarget($event.id)" />
            }
          </div>

          @if (target(); as t) {
            @if (special(); as s) {
              <section class="p4-panel">
                <h2>Special recipe</h2>
                <p class="calc__special">
                  @for (id of s.ingredientIds; track id; let i = $index) {
                    @if (i > 0) { <span class="p4-plus" aria-hidden="true">+</span> }
                    <a [routerLink]="nav.link('personas', id)">
                      @if (store.isOwned(id)) { <i class="pi pi-check-circle p4-owned" aria-label="In your compendium"></i> }
                      {{ store.personaName(id) }}
                    </a>
                  }
                </p>
                <p class="p4-note">{{ t.name }} only comes from this recipe — all {{ s.ingredientIds.length }} at once.@if (t.unlock) { Also needs: {{ t.unlock.condition }}. }</p>
              </section>
            } @else {
              @if (t.unlock) { <p class="p4-warn"><i class="pi pi-info-circle" aria-hidden="true"></i> Needs {{ t.unlock.condition }}.</p> }
              <app-p4g-recipe-table [recipes]="recipes()" mode="reverse" [empty]="'No pair makes ' + t.name + ' under the current unlock settings.'" />

              <section class="p4-panel">
                <h2>Triangle fusions</h2>
                @if (showTriangles()) {
                  <app-p4g-recipe-table [recipes]="triangles()" mode="reverse" [empty]="'No triangle makes ' + t.name + '.'" />
                } @else {
                  <p class="p4-note">Three-persona recipes run to thousands, so they're worked out only when you ask.</p>
                  <button type="button" class="p4-btn" (click)="showTriangles.set(true)"><i class="pi pi-sitemap" aria-hidden="true"></i> Find triangle recipes</button>
                }
              </section>
            }
          }
        }
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .calc__modes { display: flex; flex-wrap: wrap; gap: 0.6rem 1rem; }
    .calc__slots { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 0.75rem; }
    .calc__slot { display: flex; flex-direction: column; gap: 0.45rem; }
    .calc__chip { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.6rem; margin-top: 0.35rem; .p4-linkbtn { margin-left: auto; } }
    .calc__result { display: flex; flex-direction: column; gap: 0.75rem; }
    .calc__name { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; margin: 0.2rem 0 0.45rem; font-size: 1.5rem; }
    .calc__mask { display: flex; flex-direction: column; gap: 0.3rem; min-width: 11rem; }
    .calc__special { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem 0.5rem; margin: 0; }
    .calc__skills { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0; padding: 0; list-style: none;
      li { display: inline-flex; align-items: center; gap: 0.3rem; } .is-off { opacity: 0.5; } small { font-size: 0.72rem; } }
  `,
})
export class P4gFusionCalculator {
  protected readonly data = inject(P4gDataService);
  protected readonly store = inject(P4gFusionStore);
  protected readonly nav = inject(GameRouteContext);
  private readonly route = inject(ActivatedRoute);

  protected readonly pathLabel = PATH_LABEL;
  protected readonly kindLabel = KIND_LABEL;
  protected readonly arcanaLabel = arcanaLabel;
  protected readonly inheritRow = inheritRow;
  protected readonly inheritElements = P4G_INHERIT_ELEMENTS;

  private readonly query = this.route.snapshot.queryParamMap;
  protected readonly mode = signal<Mode>(this.query.get('target') ? 'reverse' : 'forward');
  protected readonly slots = signal<(string | null)[]>(
    this.query.get('c') ? [this.query.get('a'), this.query.get('b'), this.query.get('c')] : [this.query.get('a'), this.query.get('b')],
  );
  protected readonly rosterMode = signal(true);
  protected readonly targetId = signal<string | null>(this.query.get('target'));
  protected readonly showTriangles = signal(false);

  private readonly parentIds = computed(() => this.slots().filter((id): id is string => id != null));

  /** Identifies the fusion on screen, so the result re-renders (and replays) when it changes. */
  protected readonly fusionKey = computed(() => this.parentIds().join('+'));

  protected readonly outcome = computed<FusionOutcome | null>(() => {
    const engine = this.store.engine();
    const ids = this.parentIds();
    return engine && ids.length === this.slots().length ? engine.fuse(ids, this.store.ctx()) : null;
  });

  protected readonly result = computed<Persona | undefined>(() => {
    const o = this.outcome();
    return o?.ok ? this.store.persona(o.resultId) : undefined;
  });

  protected readonly inheritRows = computed(() => {
    const engine = this.store.engine();
    const o = this.outcome();
    if (!engine || !o?.ok) return [];
    return engine
      .inheritableSkills(this.parentIds(), o.resultId, this.store.ctx())
      .map((e) => {
        const skill = this.store.skill(e.skillId);
        return { id: e.skillId, name: skill?.name ?? e.skillId, element: skill?.element ?? 'passive', eligible: e.eligible, note: inheritNote(e.reason, e.blockingElement) };
      })
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.name.localeCompare(b.name));
  });

  protected readonly target = computed(() => {
    const id = this.targetId();
    return id ? this.store.persona(id) : undefined;
  });

  protected readonly special = computed<Recipe | null>(() => {
    const id = this.targetId();
    return id ? this.store.specialFor(id) : null;
  });

  protected readonly recipes = computed(() => {
    const id = this.targetId();
    return id ? this.store.recipesFor(id) : [];
  });

  protected readonly triangles = computed(() => {
    const id = this.targetId();
    return id && this.showTriangles() ? this.store.trianglesFor(id) : [];
  });

  /** The ticker line: how the rule got to this result, in the game's own terms. */
  protected why(o: FusionSuccess): string {
    const r = this.store.persona(o.resultId);
    const name = (id: string) => this.store.personaName(id);
    const ids = this.parentIds();
    const arcana = r ? arcanaLabel(r.arcana) : '';
    const target = o.targetLevel === null ? '' : formatLevel(o.targetLevel);
    switch (o.path) {
      case 'special':
        return `${ids.map(name).join(' + ')} is a fixed recipe for ${r?.name}`;
      case 'same-arcana':
        return `Two ${arcana} personas stay ${arcana} · highest at or below Lv ${target}`;
      case 'normal': {
        const [a, b] = ids.map((id) => this.store.persona(id));
        return `${arcanaLabel(a?.arcana ?? '')} × ${arcanaLabel(b?.arcana ?? '')} makes ${arcana} · first ${arcana} from Lv ${target}${o.bumped ? ', skipping a parent' : ''}`;
      }
      case 'triangle': {
        const lead = o.leadId ? this.store.persona(o.leadId) : undefined;
        const others = ids.filter((id) => id !== o.leadId).map(name).join(' × ');
        return `${lead?.name} leads (${arcanaLabel(lead?.arcana ?? '')}) × ${others} (${arcanaLabel(o.intermediateArcana ?? '')}) makes ${arcana} · first from Lv ${target}${o.bumped ? ', skipping a parent' : ''}`;
      }
    }
  }

  protected setCount(n: 2 | 3): void {
    this.slots.update((s) => (n === 3 ? [...s.slice(0, 2), s[2] ?? null] : s.slice(0, 2)));
  }

  protected setSlot(i: number, id: string | null): void {
    this.slots.update((s) => s.map((v, idx) => (idx === i ? id : v)));
  }

  protected setTarget(id: string | null): void {
    this.targetId.set(id);
    this.showTriangles.set(false);
  }

  protected meta(id: string): string {
    const d = this.store.persona(id);
    return d ? `${arcanaLabel(d.arcana)} · Lv ${d.level}` : '';
  }
}
