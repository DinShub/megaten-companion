import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { InheritMask } from '../../../../shared/inherit-mask/inherit-mask';
import { LoadState } from '../../../../shared/load-state/load-state';
import { OwnershipBadge } from '../../../../shared/ownership-badge/ownership-badge';
import { PersonaPicker } from '../../../../shared/persona-picker/persona-picker';
import { SkillChip } from '../../../../shared/skill-chip/skill-chip';
import { Smt3DataService } from '../../data/smt3-data.service';
import type { FusionOutcome, FusionPath } from '../../fusion';
import type { Demon } from '../../model';
import { inheritNote, inheritRow, KIND_LABEL, raceLabel, SMT3_INHERIT_ELEMENTS } from '../../ui/smt3-format';
import { Smt3RecipeTable } from '../../ui/smt3-recipe-table';
import { Smt3FusionStore } from './smt3-fusion.store';

type Mode = 'forward' | 'reverse';

const PATH_LABEL: Record<FusionPath, string> = {
  normal: 'Normal fusion',
  'same-race': 'Same-race fusion → Element',
  element: 'Element fusion (rank shift)',
  mitama: 'Element pair → Mitama',
  special: 'Special fusion',
};

/**
 * The Nocturne fusion calculator: **forward** (two demons → result, its level
 * gate, Deathstone alternatives, and the inheritable-skill pool with blocked
 * skills greyed and labelled) and **reverse** (target → every pair, or how to
 * obtain a demon fusion can't make). `?target=<id>` deep-links reverse mode;
 * `?a=<id>&b=<id>` deep-links a forward pair.
 */
@Component({
  selector: 'app-smt3-fusion-calculator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState, PersonaPicker, OwnershipBadge, InheritMask, SkillChip, Smt3RecipeTable],
  template: `
    @if (data.ready()) {
      <div class="s3-page">
        <div class="s3-seg" role="group" aria-label="Calculator mode">
          <button type="button" [class.is-on]="mode() === 'forward'" [attr.aria-pressed]="mode() === 'forward'" (click)="mode.set('forward')">
            <i class="pi pi-arrow-right" aria-hidden="true"></i> Forward · two demons → result
          </button>
          <button type="button" [class.is-on]="mode() === 'reverse'" [attr.aria-pressed]="mode() === 'reverse'" (click)="mode.set('reverse')">
            <i class="pi pi-arrow-left" aria-hidden="true"></i> Reverse · target → recipes
          </button>
        </div>

        @if (mode() === 'forward') {
          <div class="calc__slots">
            @for (slot of slots(); track $index; let i = $index) {
              <div class="s3-panel calc__slot">
                <span class="s3-eyebrow">Demon {{ i + 1 }}</span>
                @if (slot; as id) {
                  <div class="calc__chip">
                    <a class="s3-strong" [routerLink]="nav.link('demons', id)">{{ store.demonName(id) }}</a>
                    <span class="s3-muted">{{ meta(id) }}</span>
                    <app-ownership-badge [registered]="store.isOwned(id)" [level]="store.ownedLevel(id)" />
                    <button type="button" class="s3-linkbtn" (click)="setSlot(i, null)" [attr.aria-label]="'Change demon ' + (i + 1)"><i class="pi pi-times" aria-hidden="true"></i></button>
                  </div>
                } @else {
                  <app-persona-picker [options]="store.pickerOptions()" [(compendiumOnly)]="rosterMode" placeholder="Search demons…" (picked)="setSlot(i, $event.id)" />
                }
              </div>
            }
          </div>

          @if (outcome(); as o) {
            @if (o.ok && result(); as r) {
              <!-- Keyed on the pair, so a new fusion re-runs the log's typing sequence. -->
              @for (run of [command()]; track run) {
                <section class="s3-panel calc__result">
                  <h2>Result</h2>
                  <ul class="calc__log">
                    <li aria-hidden="true">Fusion program ready. 2 demons loaded.</li>
                    <li class="calc__cmd" aria-hidden="true" [style.--n]="run.length">{{ run }}</li>
                    <li class="calc__ok">{{ pathLabel[o.path] }}. Analysis complete.</li>
                  </ul>
                  <div class="s3-detail-head calc__body">
                    <div>
                      <h3 class="calc__name">
                        <a [routerLink]="nav.link('demons', r.id)">{{ r.name }}</a>
                        <app-ownership-badge [registered]="store.isOwned(r.id)" [level]="store.ownedLevel(r.id)" />
                      </h3>
                      <div class="s3-tags">
                        <span class="s3-tag">{{ raceLabel(r.race) }}</span>
                        <span class="s3-tag">Lv {{ r.level }}</span>
                        @if (o.targetLevel !== null) { <span class="s3-tag" title="(a + b) / 2 + 1">Target Lv {{ o.targetLevel }}</span> }
                      </div>
                    </div>
                    <div class="calc__mask">
                      <span class="s3-eyebrow">Can inherit</span>
                      <app-inherit-mask [allowed]="inheritRow(r)" [elements]="inheritElements" />
                    </div>
                  </div>

                  @if (o.blockedByLevel) {
                    <p class="s3-warn"><i class="pi pi-lock" aria-hidden="true"></i> {{ r.name }} is level {{ r.level }} — above your Demi-fiend (Lv {{ store.protagonistLevel() }}). <a [routerLink]="nav.link('settings')">Raise it or lift the cap</a>.</p>
                  }
                  @if (o.clampedToCeiling) {
                    <p class="s3-warn"><i class="pi pi-arrow-up" aria-hidden="true"></i> The parents overshoot the {{ raceLabel(r.race) }} race — clamped to its highest demon.</p>
                  }
                  @for (f of deathstone(); track f.id) {
                    <p class="s3-info"><i class="pi pi-moon" aria-hidden="true"></i> Holding a Deathstone: <a [routerLink]="nav.link('demons', f.id)">{{ f.name }}</a> instead — {{ f.condition }}</p>
                  }
                  @if (o.cursedRace) {
                    <p class="s3-note">Cursed chart (Full Kagutsuchi, reference only): {{ raceLabel(o.cursedRace) }}.</p>
                  }

                  <h2>Inheritable skills</h2>
                  @if (inheritRows().length) {
                    <ul class="calc__skills">
                      @for (s of inheritRows(); track s.id) {
                        <li [class.is-off]="!s.eligible">
                          <app-skill-chip [name]="s.name" [element]="s.element" [unique]="s.note === 'Unique'" />
                          @if (s.note) { <small class="s3-muted">{{ s.note }}</small> }
                        </li>
                      }
                    </ul>
                    <p class="s3-note">Every skill the parents carry (registered parents: their recorded skills). How many the game passes on per fusion isn't modelled upstream, so only the 8-skill capacity is assumed.</p>
                  } @else {
                    <p class="s3-muted">Neither parent carries a skill to pass on.</p>
                  }
                </section>
              }
            } @else if (!o.ok) {
              <p class="s3-invalid" role="alert"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i> {{ o.message }}</p>
            }
          } @else {
            <p class="s3-empty">Awaiting input. Choose two demons to fuse.</p>
          }
        } @else {
          <div class="s3-panel">
            <span class="s3-eyebrow">Target</span>
            @if (target(); as t) {
              <div class="calc__chip">
                <a class="s3-strong" [routerLink]="nav.link('demons', t.id)">{{ t.name }}</a>
                <span class="s3-muted">{{ raceLabel(t.race) }} · Lv {{ t.level }} · {{ kindLabel[t.kind] }}</span>
                <button type="button" class="s3-linkbtn" (click)="targetId.set(null)" aria-label="Change target"><i class="pi pi-times" aria-hidden="true"></i></button>
              </div>
            } @else {
              <app-persona-picker [options]="store.pickerOptions()" [compendiumOnly]="false" placeholder="Which demon do you want?" (picked)="targetId.set($event.id)" />
            }
          </div>

          @if (target(); as t) {
            @switch (t.kind) {
              @case ('fiend') {
                <p class="s3-info"><i class="pi pi-moon" aria-hidden="true"></i> {{ t.name }} comes from a Deathstone fusion, not a pair — {{ t.unlock?.condition ?? t.prereq }}. See <a [routerLink]="nav.link('demons', t.id)">its page</a> for the race to aim at.</p>
              }
              @case ('evolution') {
                <p class="s3-info"><i class="pi pi-replay" aria-hidden="true"></i> {{ t.name }} only comes from evolution{{ evolveSource(t) }}.</p>
              }
              @case ('recruit') {
                <p class="s3-info"><i class="pi pi-user" aria-hidden="true"></i> {{ t.name }} can't be fused{{ t.unlock ? ' — ' + t.unlock.condition : '' }}.</p>
              }
              @default {
                @if (t.prereq) { <p class="s3-warn"><i class="pi pi-info-circle" aria-hidden="true"></i> {{ t.prereq }}</p> }
                <app-smt3-recipe-table [recipes]="recipes()" mode="reverse" [empty]="'No pair makes ' + t.name + ' under the current unlock settings.'" />
              }
            }
          }
        }
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .calc__slots { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 0.75rem; }
    .calc__slot { display: flex; flex-direction: column; gap: 0.45rem; }
    .calc__chip { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.6rem; margin-top: 0.35rem; .s3-linkbtn { margin-left: auto; } }
    .calc__result { display: flex; flex-direction: column; gap: 0.75rem; }
    .calc__name { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; margin: 0.2rem 0 0.45rem; font-size: 1.5rem; }
    .calc__mask { display: flex; flex-direction: column; gap: 0.3rem; min-width: 11rem; }
    .calc__skills { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0; padding: 0; list-style: none;
      li { display: inline-flex; align-items: center; gap: 0.3rem; } .is-off { opacity: 0.5; } small { font-size: 0.72rem; } }
  `,
})
export class Smt3FusionCalculator {
  protected readonly data = inject(Smt3DataService);
  protected readonly store = inject(Smt3FusionStore);
  protected readonly nav = inject(GameRouteContext);
  private readonly route = inject(ActivatedRoute);

  protected readonly pathLabel = PATH_LABEL;
  protected readonly kindLabel = KIND_LABEL;
  protected readonly raceLabel = raceLabel;
  protected readonly inheritRow = inheritRow;
  protected readonly inheritElements = SMT3_INHERIT_ELEMENTS;

  private readonly query = this.route.snapshot.queryParamMap;
  protected readonly mode = signal<Mode>(this.query.get('target') ? 'reverse' : 'forward');
  protected readonly slots = signal<(string | null)[]>([this.query.get('a'), this.query.get('b')]);
  protected readonly rosterMode = signal(true);
  protected readonly targetId = signal<string | null>(this.query.get('target'));

  private readonly parentIds = computed(() => this.slots().filter((id): id is string => id != null));

  /** The pair as the program's command line, e.g. `fuse pixie kodama`. */
  protected readonly command = computed(() => ['fuse', ...this.parentIds()].join(' '));

  protected readonly outcome = computed<FusionOutcome | null>(() => {
    const engine = this.store.engine();
    const ids = this.parentIds();
    return engine && ids.length === 2 ? engine.fuse(ids, this.store.ctx()) : null;
  });

  protected readonly result = computed<Demon | undefined>(() => {
    const o = this.outcome();
    return o?.ok ? this.store.demon(o.resultId) : undefined;
  });

  protected readonly deathstone = computed(() => {
    const o = this.outcome();
    if (!o?.ok) return [];
    return o.deathstoneIds.map((id) => {
      const d = this.store.demon(id);
      return { id, name: d?.name ?? id, condition: d?.unlock?.condition ?? '' };
    });
  });

  protected readonly inheritRows = computed(() => {
    const engine = this.store.engine();
    const o = this.outcome();
    if (!engine || !o?.ok) return [];
    return engine
      .inheritableSkills(this.parentIds(), o.resultId, this.store.ctx())
      .map((e) => {
        const skill = this.store.skill(e.skillId);
        return { id: e.skillId, name: skill?.name ?? e.skillId, element: skill?.element ?? 'passive', eligible: e.eligible, note: inheritNote(e.reason, e.blockingCategory) };
      })
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.name.localeCompare(b.name));
  });

  protected readonly target = computed(() => {
    const id = this.targetId();
    return id ? this.store.demon(id) : undefined;
  });

  protected readonly recipes = computed(() => {
    const id = this.targetId();
    return id ? this.store.recipesFor(id) : [];
  });

  protected setSlot(i: number, id: string | null): void {
    this.slots.update((s) => s.map((v, idx) => (idx === i ? id : v)));
  }

  protected meta(id: string): string {
    const d = this.store.demon(id);
    return d ? `${raceLabel(d.race)} · Lv ${d.level}` : '';
  }

  protected evolveSource(t: Demon): string {
    return t.evolvesFrom ? ` — evolve ${this.store.demonName(t.evolvesFrom.demonId)} at Lv ${t.evolvesFrom.level}` : '';
  }
}
