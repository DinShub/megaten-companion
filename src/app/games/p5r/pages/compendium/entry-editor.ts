import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';

import type { CompendiumEntry, InheritMatrix, Persona, Skill, SkillId, Trait } from '../../model';
import { newlyAvailableNativeSkills, type SkillSuggestion } from '../../compendium/quick-add';
import { canInherit } from '../../fusion/inherit';

type SkillOrigin = 'innate' | 'level' | 'inherited' | 'tag';

interface EditorSkillRow {
  readonly id: SkillId;
  readonly name: string;
  readonly element: string;
  readonly unique: boolean;
  readonly origin: SkillOrigin;
}

interface SkillOption {
  readonly id: SkillId;
  readonly name: string;
  readonly element: string;
}

interface TraitOption {
  readonly id: string;
  readonly name: string;
}

interface TraitGroup {
  readonly label: string;
  readonly options: readonly TraitOption[];
}

const ORIGIN_LABEL: Record<SkillOrigin, string> = {
  innate: 'Innate',
  level: 'Native',
  inherited: 'Inherited',
  tag: 'Card',
};

/**
 * Entry editor (§4.6, task 27). Presentational: it takes the persona and the
 * datasets it needs and emits a new {@link CompendiumEntry} — the store mutation
 * lives on the page. Deliberately PrimeNG-free (native controls + a hand-rolled
 * type-ahead), so this lazy page adds no new PrimeNG component families and the
 * initial bundle stays under budget — the same call the app shell makes (§9.3).
 *
 * Two behaviours the task turns on:
 *  - **A level change never silently mutates the skill list.** The draft skill
 *    list only changes through an explicit tick/untick, an add, or accepting a
 *    suggestion. Raising the level only recomputes the *suggestion* row.
 *  - **Added skills are filtered to what the persona could actually inherit** —
 *    element allowed by its inherit type (§6.5), non-unique, not already present.
 */
@Component({
  selector: 'app-entry-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="editor">
      <div class="editor__row">
        <label class="editor__label" for="entry-level">Level</label>
        <input id="entry-level" class="editor__num" type="number" min="1" max="99" [value]="level()" (input)="setLevel($any($event.target).value)" />
        <span class="editor__hint">Base {{ persona().level }}</span>
      </div>

      <div class="editor__section">
        <h3 class="editor__title">Skills <span class="editor__count">{{ skillIds().length }}/8</span></h3>
        <ul class="skills">
          @for (s of skillRows(); track s.id) {
            <li class="skills__row">
              <label class="skills__check">
                <input type="checkbox" [checked]="true" (change)="untick(s.id)" [attr.aria-label]="'Remove ' + s.name" />
                <span class="el-dot" [attr.data-el]="s.element" aria-hidden="true"></span>
                <span class="skills__name">{{ s.name }}</span>
                @if (s.unique) { <i class="pi pi-lock skills__lock" title="Unique — not inheritable" aria-hidden="true"></i> }
              </label>
              <span class="skills__origin" [attr.data-origin]="s.origin">{{ originLabel(s.origin) }}</span>
            </li>
          }
          @if (skillRows().length === 0) {
            <li class="skills__empty">No skills. Add inherited skills or accept suggestions below.</li>
          }
        </ul>

        @if (suggestions().length) {
          <div class="suggest">
            <span class="suggest__lbl">Now learned natively:</span>
            @for (sg of suggestions(); track sg.skillId) {
              <button type="button" class="suggest__chip" (click)="addSkill(sg.skillId)">
                <i class="pi pi-plus" aria-hidden="true"></i>{{ skillName(sg.skillId) }} <span class="suggest__lv">Lv {{ sg.level }}</span>
              </button>
            }
          </div>
        }

        <div class="add">
          <span class="add__field">
            <i class="pi pi-plus-circle" aria-hidden="true"></i>
            <input
              type="text"
              placeholder="Add an inheritable skill…"
              aria-label="Add an inheritable skill"
              [value]="addQuery()"
              (input)="addQuery.set($any($event.target).value)"
              (keydown.escape)="addQuery.set('')"
            />
          </span>
          @if (addQuery().length >= 1 && addMatches().length) {
            <ul class="add__list">
              @for (o of addMatches(); track o.id) {
                <li>
                  <button type="button" class="add__opt" (click)="addSkill(o.id); addQuery.set('')">
                    <span class="el-dot" [attr.data-el]="o.element" aria-hidden="true"></span>{{ o.name }}
                  </button>
                </li>
              }
            </ul>
          } @else if (addQuery().length >= 1) {
            <p class="add__none">No inheritable skill matches “{{ addQuery() }}”.</p>
          }
        </div>
      </div>

      <div class="editor__row">
        <label class="editor__label" for="entry-trait">Trait</label>
        <select id="entry-trait" class="editor__select" [value]="traitId() ?? ''" (change)="setTrait($any($event.target).value)">
          <option value="">None</option>
          @for (g of traitGroups(); track g.label) {
            <optgroup [label]="g.label">
              @for (t of g.options; track t.id) {
                <option [value]="t.id">{{ t.name }}</option>
              }
            </optgroup>
          }
        </select>
      </div>

      <div class="editor__actions">
        <button type="button" class="btn" (click)="cancel.emit()">Cancel</button>
        <button type="button" class="btn btn--primary" (click)="emitSave()"><i class="pi pi-check" aria-hidden="true"></i> Save entry</button>
      </div>
    </div>
  `,
  styles: `
    .editor { display: flex; flex-direction: column; gap: 1.1rem; min-width: min(28rem, 78vw); max-width: 32rem; }
    .editor__row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    .editor__label { flex: 0 0 3.5rem; font-size: 0.85rem; font-weight: 600; color: var(--p-text-muted-color); }
    .editor__hint { font-size: 0.8rem; color: var(--p-text-muted-color); }
    .editor__num { width: 5rem; padding: 0.4rem 0.5rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); border-radius: var(--p-border-radius, 6px); background: var(--p-content-background); color: var(--p-text-color); font: inherit; text-align: right; }
    .editor__select { padding: 0.4rem 0.6rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); border-radius: var(--p-border-radius, 6px); background: var(--p-content-background); color: var(--p-text-color); font: inherit; flex: 1 1 12rem; }

    .editor__section { display: flex; flex-direction: column; gap: 0.6rem; }
    .editor__title { margin: 0; font-size: 0.85rem; display: flex; align-items: baseline; gap: 0.5rem; }
    .editor__count { font-size: 0.78rem; color: var(--p-text-muted-color); font-variant-numeric: tabular-nums; }

    .skills { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .skills__row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.35rem 0; border-top: 1px solid var(--p-content-border-color, rgba(127,127,127,0.12)); &:first-child { border-top: 0; } }
    .skills__check { display: inline-flex; align-items: center; gap: 0.5rem; cursor: pointer; input { cursor: pointer; } }
    .skills__name { font-weight: 500; }
    .skills__origin { font-size: 0.72rem; padding: 0.1rem 0.45rem; border-radius: 999px; background: var(--app-panel-2); color: var(--p-text-muted-color); }
    .skills__origin[data-origin='inherited'] { color: var(--p-primary-color); }
    .skills__empty { padding: 0.5rem 0; color: var(--p-text-muted-color); }

    .suggest { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; padding: 0.5rem 0.65rem; border-radius: var(--p-border-radius, 6px); background: color-mix(in srgb, var(--p-primary-color) 8%, transparent); }
    .suggest__lbl { font-size: 0.78rem; color: var(--p-text-muted-color); }
    .suggest__chip { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.2rem 0.55rem; border: 1px solid var(--p-primary-color); border-radius: 999px; background: transparent; color: var(--p-primary-color); font: inherit; font-size: 0.8rem; cursor: pointer; &:hover { background: color-mix(in srgb, var(--p-primary-color) 15%, transparent); } }

    .add { position: relative; display: flex; flex-direction: column; gap: 0.3rem; }
    .add__field { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.7rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); border-radius: var(--p-border-radius, 6px); background: var(--p-content-background); .pi { color: var(--p-text-muted-color); } input { flex: 1 1 auto; border: 0; background: transparent; color: var(--p-text-color); font: inherit; outline: none; } }
    .add__list { list-style: none; margin: 0; padding: 0.25rem; display: flex; flex-direction: column; max-height: 12rem; overflow-y: auto; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); border-radius: var(--p-border-radius, 6px); background: var(--p-content-background); }
    .add__opt { display: flex; align-items: center; gap: 0.45rem; width: 100%; padding: 0.35rem 0.5rem; border: 0; border-radius: 5px; background: transparent; color: var(--p-text-color); font: inherit; text-align: left; cursor: pointer; &:hover { background: var(--p-highlight-background, rgba(127,127,127,0.12)); } }
    .editor__actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
    .btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.9rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); border-radius: var(--p-border-radius, 6px); background: transparent; color: var(--p-text-color); font: inherit; font-size: 0.9rem; cursor: pointer; &:hover { border-color: var(--p-primary-color); } }
    .btn--primary { border-color: var(--p-primary-color); background: var(--p-primary-color); color: var(--p-primary-contrast-color, #fff); }
  `,
})
export class EntryEditor {
  readonly persona = input.required<Persona>();
  readonly entry = input.required<CompendiumEntry>();
  readonly skills = input.required<readonly Skill[]>();
  readonly traits = input.required<readonly Trait[]>();
  readonly inheritMatrix = input.required<InheritMatrix>();

  readonly save = output<CompendiumEntry>();
  readonly cancel = output<void>();

  // Draft state, seeded from the entry when the input changes.
  protected readonly level = signal(1);
  protected readonly skillIds = signal<SkillId[]>([]);
  protected readonly traitId = signal<string | null>(null);
  protected readonly addQuery = signal('');

  constructor() {
    // Reseed the draft whenever a different entry is loaded into the editor.
    effect(() => {
      const e = this.entry();
      this.level.set(e.level);
      this.skillIds.set([...e.skillIds]);
      this.traitId.set(e.traitId);
      this.addQuery.set('');
    });
  }

  private readonly skillsById = computed(() => {
    const m = new Map<SkillId, Skill>();
    for (const s of this.skills()) m.set(s.id, s);
    return m;
  });

  private readonly traitsById = computed(() => {
    const m = new Map<string, Trait>();
    for (const t of this.traits()) m.set(t.id, t);
    return m;
  });

  /** How each skill on the entry was come by, for the origin label. */
  private readonly nativeKind = computed(() => {
    const m = new Map<SkillId, 'innate' | 'level' | 'tag'>();
    for (const ls of this.persona().learnedSkills) m.set(ls.skillId, ls.kind);
    return m;
  });

  protected readonly skillRows = computed<EditorSkillRow[]>(() =>
    this.skillIds().map((id) => {
      const skill = this.skillsById().get(id);
      return {
        id,
        name: skill?.name ?? id,
        element: skill?.element ?? 'passive',
        unique: skill?.unique ?? false,
        origin: this.nativeKind().get(id) ?? 'inherited',
      };
    }),
  );

  protected readonly suggestions = computed<SkillSuggestion[]>(() =>
    newlyAvailableNativeSkills(this.persona(), this.level(), this.skillIds()),
  );

  /**
   * Trait choices, grouped. Fusion can inherit *any* trait (there is no per-trait
   * gating — unlike skills, traits carry no inherit element), so every trait must
   * be selectable; the old picker only listed the persona's native traits, so an
   * inherited trait like Frigid Bloodline could never be recorded. The innate and
   * learnable traits are grouped first as the common case; all others follow under
   * "Inherited".
   */
  protected readonly traitGroups = computed<TraitGroup[]>(() => {
    const p = this.persona();
    const nativeIds = new Set<string>();
    if (p.traitId) nativeIds.add(p.traitId);
    for (const lt of p.learnedTraits) nativeIds.add(lt.traitId);

    const byName = (a: TraitOption, b: TraitOption) => a.name.localeCompare(b.name);
    const native = [...nativeIds]
      .map((id) => ({ id, name: this.traitsById().get(id)?.name ?? id }))
      .sort(byName);
    const inherited = this.traits()
      .filter((t) => !nativeIds.has(t.id))
      .map((t) => ({ id: t.id, name: t.name }))
      .sort(byName);

    const groups: TraitGroup[] = [];
    if (native.length) groups.push({ label: 'This persona', options: native });
    if (inherited.length) groups.push({ label: 'Inherited', options: inherited });
    return groups;
  });

  /** Skills the persona could inherit and doesn't already hold — the add-picker pool. */
  private readonly addable = computed<SkillOption[]>(() => {
    const matrix = this.inheritMatrix();
    const inheritType = this.persona().inheritType;
    const have = new Set(this.skillIds());
    const options: SkillOption[] = [];
    for (const s of this.skills()) {
      // Reuse the fusion engine's §6.5 predicate rather than re-deriving it here.
      // `unique` blocks; a null inheritElement is *not* element-gated (buffs,
      // debuffs, heals, passives — Rakunda, Tarukaja, …) and is always
      // inheritable; otherwise the matrix decides. The old inline copy dropped
      // every null-element skill, so fused-in support skills couldn't be added.
      if (have.has(s.id)) continue;
      if (canInherit(matrix, inheritType, s)) {
        options.push({ id: s.id, name: s.name, element: s.element });
      }
    }
    return options.sort((a, b) => a.name.localeCompare(b.name));
  });

  /** Hand-rolled type-ahead over the inheritable pool (§9.3, no PrimeNG). */
  protected readonly addMatches = computed<SkillOption[]>(() => {
    const q = this.addQuery().trim().toLowerCase();
    if (!q) return [];
    return this.addable().filter((o) => o.name.toLowerCase().includes(q)).slice(0, 20);
  });

  // ---- Draft edits ------------------------------------------------------

  /** Level only changes the level. Skills are left exactly as they are (task 27). */
  protected setLevel(value: string): void {
    const n = Number.parseInt(value, 10);
    this.level.set(Number.isFinite(n) ? Math.min(99, Math.max(1, n)) : this.level());
  }

  protected setTrait(value: string): void {
    this.traitId.set(value || null);
  }

  protected untick(id: SkillId): void {
    this.skillIds.update((ids) => ids.filter((s) => s !== id));
  }

  protected addSkill(id: SkillId): void {
    this.skillIds.update((ids) => (ids.includes(id) ? ids : [...ids, id]));
  }

  protected emitSave(): void {
    this.save.emit({
      personaId: this.persona().id,
      level: this.level(),
      skillIds: this.skillIds(),
      traitId: this.traitId(),
    });
  }

  protected skillName(id: SkillId): string {
    return this.skillsById().get(id)?.name ?? id;
  }

  protected originLabel(origin: SkillOrigin): string {
    return ORIGIN_LABEL[origin];
  }
}
