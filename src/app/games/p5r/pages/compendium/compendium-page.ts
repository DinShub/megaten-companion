import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { FocusTrap } from '../../../../shared/a11y/focus-trap';
import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { PersonaPicker, type PickerOption } from '../../../../shared/persona-picker/persona-picker';
import { VirtualList } from '../../../../shared/virtual-list/virtual-list';
import { CompendiumStore } from '../../compendium/compendium.store';
import { defaultEntryFor } from '../../compendium/quick-add';
import { exportFilename, parseImport, serializeProfile } from '../../compendium/compendium-io';
import { GameDataService } from '../../data/game-data.service';
import type { CompendiumEntry, Persona } from '../../model';
import { SettingsStore } from '../../settings/settings.store';
import { titleCase } from '../../ui/format';
import { EntryEditor } from './entry-editor';

type SortKey = 'name' | 'arcana' | 'level';

interface Row {
  readonly id: string;
  readonly name: string;
  readonly arcana: string;
  readonly level: number;
  readonly baseLevel: number;
  readonly skillCount: number;
  readonly trait: string;
}

/**
 * Compendium management (§4.6, tasks 26/28/29). One screen for the whole feature:
 * quick-add at the top, the registered roster below (searchable, sortable, inline
 * level edit, bulk delete, total count), export/import, and the {@link EntryEditor}
 * in a hand-rolled modal. The empty state explains the feature and links to the
 * persona list.
 *
 * PrimeNG-free apart from the shared {@link PersonaPicker}: the modal, toolbar and
 * inline controls are native, so this lazy page adds no new PrimeNG component
 * family and the initial bundle stays under budget (§9.3).
 *
 * The protagonist level (§4.6 "a compendium-level field, prompted on first use")
 * is surfaced here but stored in {@link SettingsStore}, the single source of truth
 * the fusion engine reads — see {@link CompendiumStore} for why it isn't duplicated.
 */
@Component({
  selector: 'app-compendium-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState, VirtualList, PersonaPicker, EntryEditor, FocusTrap],
  template: `
    @if (data.ready()) {
      <div class="page list-page">
        <header class="page__head">
          <h1 class="page__title">Compendium</h1>
          <span class="page__count">{{ store.count() }} registered</span>
        </header>

        <div class="protag" [class.protag--unset]="settings.protagonistLevel() === 1">
          <label for="protag-level"><i class="pi pi-user" aria-hidden="true"></i> Protagonist level</label>
          <input
            id="protag-level"
            type="number"
            min="1"
            max="99"
            [value]="settings.protagonistLevel()"
            (change)="setProtagonist($any($event.target).value)"
          />
          <small>Gates fusion results to your cap. Set this once so recipes stay accurate.</small>
        </div>

        <section class="quickadd">
          <h2 class="quickadd__title">Add a persona</h2>
          <app-persona-picker
            [options]="pickerOptions()"
            [compendiumOnly]="false"
            placeholder="Search the roster to register…"
            (picked)="quickAdd($event)"
          />
          @if (notice(); as n) {
            <p class="quickadd__notice">
              <i class="pi pi-check-circle" aria-hidden="true"></i>
              {{ n.text }}
              @if (n.personaId) {
                <button type="button" class="linkbtn" (click)="edit(n.personaId)">Edit skills</button>
              }
            </p>
          }
        </section>

        @if (store.count() === 0) {
          <div class="empty">
            <i class="pi pi-book empty__icon" aria-hidden="true"></i>
            <h2>Your compendium is empty</h2>
            <p>Register the personas you own so the fusion tools can plan from what you actually have —
              recipes you can make now, skills you can inherit, costs to re-summon.</p>
            <p>Use the search above, or <a [routerLink]="nav.link('personas')">browse the persona list</a>.</p>
          </div>
        } @else {
          <div class="toolbar">
            <span class="toolbar__search">
              <i class="pi pi-search" aria-hidden="true"></i>
              <input type="text" placeholder="Search your compendium…" aria-label="Search your compendium" [value]="search()" (input)="search.set($any($event.target).value)" />
            </span>
            @if (selection().size > 0) {
              <button class="toolbar__btn toolbar__btn--danger" type="button" (click)="deleteSelected()">
                <i class="pi pi-trash" aria-hidden="true"></i><span>Delete {{ selection().size }}</span>
              </button>
              <button class="toolbar__btn" type="button" (click)="clearSelection()">Cancel</button>
            }
            <span class="toolbar__spacer"></span>
            <button class="toolbar__btn" type="button" (click)="exportFile()"><i class="pi pi-download" aria-hidden="true"></i><span>Export</span></button>
            <label class="toolbar__btn" role="button">
              <i class="pi pi-upload" aria-hidden="true"></i><span>Import</span>
              <input type="file" accept="application/json,.json" class="sr-only" (change)="onFile($event)" />
            </label>
          </div>

          @if (importError(); as err) {
            <p class="banner banner--error" role="alert"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i> {{ err }}
              <button type="button" class="linkbtn" (click)="importError.set(null)">Dismiss</button></p>
          }

          <div class="tablewrap list-page__body">
            <div class="grid grid--head" role="row">
              <span class="cell cell--check">
                <input type="checkbox" [checked]="allSelected()" (change)="toggleAll()" aria-label="Select all" />
              </span>
              <button class="cell" [class.is-sort]="sort() === 'name'" (click)="setSort('name')">Persona{{ caret('name') }}</button>
              <button class="cell col-md" [class.is-sort]="sort() === 'arcana'" (click)="setSort('arcana')">Arcana{{ caret('arcana') }}</button>
              <button class="cell cell--lv" [class.is-sort]="sort() === 'level'" (click)="setSort('level')">Level{{ caret('level') }}</button>
              <span class="cell cell--skills col-md">Skills</span>
              <span class="cell cell--trait col-lg">Trait</span>
              <span class="cell cell--act">Edit</span>
            </div>

            <app-virtual-list class="list-page__scroll" [items]="rows()" [itemSize]="48" [row]="rowTpl" [trackBy]="trackId" />
            <ng-template #rowTpl let-r>
              <div class="grid grid--row" [class.is-selected]="selection().has(r.id)">
                <span class="cell cell--check">
                  <input type="checkbox" [checked]="selection().has(r.id)" (change)="toggle(r.id)" [attr.aria-label]="'Select ' + r.name" />
                </span>
                <a class="cell cell--name" [routerLink]="nav.link('personas', r.id)">{{ r.name }}</a>
                <span class="cell col-md cell--arcana">{{ titleCase(r.arcana) }}</span>
                <span class="cell cell--lv">
                  <input class="lvedit" type="number" min="1" max="99" [value]="r.level" (change)="editLevel(r.id, $any($event.target).value)" [attr.aria-label]="'Level of ' + r.name" />
                  @if (r.level !== r.baseLevel) { <span class="lvedit__base" title="Base level">/{{ r.baseLevel }}</span> }
                </span>
                <span class="cell cell--skills col-md">{{ r.skillCount }}</span>
                <span class="cell cell--trait col-lg">{{ r.trait }}</span>
                <span class="cell cell--act">
                  <button type="button" class="iconbtn" (click)="edit(r.id)" [attr.aria-label]="'Edit ' + r.name"><i class="pi pi-pencil" aria-hidden="true"></i></button>
                  <button type="button" class="iconbtn" (click)="store.remove(r.id)" [attr.aria-label]="'Remove ' + r.name"><i class="pi pi-times" aria-hidden="true"></i></button>
                </span>
              </div>
            </ng-template>

            @if (rows().length === 0) {
              <p class="empty-rows">No registered persona matches “{{ search() }}”.</p>
            }
          </div>
        }
      </div>

      @if (editing(); as e) {
        @if (editingPersona(); as p) {
          <div class="modal" role="dialog" aria-modal="true" [attr.aria-label]="'Edit ' + p.name">
            <div class="modal__scrim" (click)="closeEditor()"></div>
            <div class="modal__panel" appFocusTrap (escape)="closeEditor()">
              <div class="modal__head">
                <h2 class="modal__title">{{ p.name }}</h2>
                <button type="button" class="iconbtn" (click)="closeEditor()" aria-label="Close editor"><i class="pi pi-times" aria-hidden="true"></i></button>
              </div>
              <app-entry-editor
                [persona]="p"
                [entry]="e"
                [skills]="data.data()!.skills"
                [traits]="data.data()!.traits"
                [inheritMatrix]="data.data()!.inheritMatrix"
                (save)="onSave($event)"
                (cancel)="closeEditor()"
              />
            </div>
          </div>
        }
      }
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .page { display: flex; flex-direction: column; gap: 1rem; }
    .page__head { display: flex; align-items: baseline; gap: 0.75rem; }
    .page__title { margin: 0; font-size: 1.5rem; }
    .page__count { color: var(--p-text-muted-color); font-size: 0.9rem; }

    .empty { padding: 2.5rem 1rem; text-align: center; color: var(--p-text-muted-color); display: flex; flex-direction: column; gap: 0.5rem; align-items: center; max-width: 34rem; margin: 0 auto; }
    .empty__icon { font-size: 2rem; color: var(--p-primary-color); }
    .empty h2 { margin: 0.5rem 0 0; color: var(--p-text-color); font-size: 1.2rem; }
    .empty a { color: var(--p-primary-color); }

    .toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
    .toolbar__spacer { flex: 1 1 auto; }
    .toolbar__search {
      display: inline-flex; align-items: center; gap: 0.5rem; flex: 1 1 14rem;
      padding: 0.4rem 0.7rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3));
      border-radius: var(--p-border-radius, 6px); background: var(--p-content-background);
      .pi { color: var(--p-text-muted-color); }
      input { flex: 1 1 auto; border: 0; background: transparent; color: var(--p-text-color); font: inherit; outline: none; }
    }
    .toolbar__btn {
      display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.75rem; margin: 0;
      border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); border-radius: var(--p-border-radius, 6px);
      background: transparent; color: var(--p-text-color); font: inherit; font-size: 0.9rem; cursor: pointer;
      &:hover { border-color: var(--p-primary-color); }
    }
    .toolbar__btn--danger { border-color: color-mix(in srgb, #ef4444 55%, transparent); color: var(--app-danger); }

    .tablewrap { display: flex; flex-direction: column; overflow-x: auto; }
    .grid { display: grid; align-items: center; grid-template-columns: 2.5rem minmax(8rem, 1.6fr) 7rem 6.5rem 4rem minmax(7rem, 1fr) 4.5rem; gap: 0.5rem; padding: 0 0.5rem; min-width: 44rem; }
    .grid--head { position: sticky; top: 0; z-index: 1; height: 2.4rem; border-bottom: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); background: var(--p-content-background); font-size: 0.78rem; color: var(--p-text-muted-color); text-transform: uppercase; letter-spacing: 0.03em; }
    .grid--head .cell { background: transparent; border: 0; color: inherit; font: inherit; text-transform: inherit; letter-spacing: inherit; text-align: left; padding: 0; }
    button.cell { cursor: pointer; &:hover { color: var(--p-text-color); } &.is-sort { color: var(--p-primary-color); } }

    .grid--row { height: 100%; border-bottom: 1px solid var(--p-content-border-color, rgba(127,127,127,0.12)); &:hover { background: var(--p-highlight-background, rgba(127,127,127,0.08)); } }
    .grid--row.is-selected { background: color-mix(in srgb, var(--p-primary-color) 12%, transparent); }
    .cell { overflow: hidden; }
    .cell--check { display: inline-flex; align-items: center; input { cursor: pointer; } }
    .cell--name { font-weight: 600; text-decoration: none; color: var(--p-text-color); text-overflow: ellipsis; white-space: nowrap; &:hover { color: var(--p-primary-color); } }
    .cell--arcana { text-transform: capitalize; color: var(--p-text-muted-color); font-size: 0.9rem; }
    .cell--lv { display: inline-flex; align-items: baseline; gap: 0.2rem; font-variant-numeric: tabular-nums; }
    .cell--skills { color: var(--p-text-muted-color); font-variant-numeric: tabular-nums; }
    .cell--trait { color: var(--p-text-muted-color); font-size: 0.85rem; text-overflow: ellipsis; white-space: nowrap; }
    .cell--act { display: inline-flex; gap: 0.15rem; }

    .empty-rows { padding: 2rem 1rem; text-align: center; color: var(--p-text-muted-color); }
    .linkbtn { border: 0; background: transparent; color: var(--p-primary-color); cursor: pointer; font: inherit; text-decoration: underline; padding: 0; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }

    @media (max-width: 767.98px) {
      .grid { grid-template-columns: 2.2rem minmax(6rem, 1.6fr) 6rem 4.5rem; min-width: 0; }
      .col-md, .col-lg { display: none; }
    }
  `,
})
export class CompendiumPage {
  protected readonly data = inject(GameDataService);
  protected readonly store = inject(CompendiumStore);
  protected readonly settings = inject(SettingsStore);
  protected readonly nav = inject(GameRouteContext);
  protected readonly titleCase = titleCase;

  protected readonly search = signal('');
  protected readonly sort = signal<SortKey>('name');
  protected readonly dir = signal<'asc' | 'desc'>('asc');
  protected readonly selection = signal<ReadonlySet<string>>(new Set());
  protected readonly editing = signal<CompendiumEntry | null>(null);
  protected readonly notice = signal<{ text: string; personaId: string | null } | null>(null);
  protected readonly importError = signal<string | null>(null);

  private readonly personasById = computed(() => {
    const m = new Map<string, Persona>();
    for (const p of this.data.data()?.personas ?? []) m.set(p.id, p);
    return m;
  });

  private readonly traitsById = computed(() => {
    const m = new Map<string, string>();
    for (const t of this.data.data()?.traits ?? []) m.set(t.id, t.name);
    return m;
  });

  /** Whole roster as picker options, badged by ownership (§4.6 quick-add). */
  protected readonly pickerOptions = computed<PickerOption[]>(() => {
    const owned = this.store.entryMap();
    return (this.data.data()?.personas ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      arcana: titleCase(p.arcana),
      owned: owned.has(p.id),
      level: owned.get(p.id)?.level ?? null,
    }));
  });

  protected readonly rows = computed<Row[]>(() => {
    const q = this.search().trim().toLowerCase();
    const personas = this.personasById();
    const rows: Row[] = this.store.entries().map((e) => {
      const p = personas.get(e.personaId);
      return {
        id: e.personaId,
        name: p?.name ?? e.personaId,
        arcana: p?.arcana ?? '',
        level: e.level,
        baseLevel: p?.level ?? e.level,
        skillCount: e.skillIds.length,
        trait: e.traitId ? (this.traitsById().get(e.traitId) ?? e.traitId) : '—',
      };
    });
    const filtered = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.arcana.toLowerCase().includes(q)) : rows;
    const sign = this.dir() === 'desc' ? -1 : 1;
    const key = this.sort();
    return filtered.sort((a, b) => {
      const cmp = key === 'level' ? a.level - b.level : String(a[key]).localeCompare(String(b[key]));
      return (cmp !== 0 ? cmp : a.name.localeCompare(b.name)) * sign;
    });
  });

  protected readonly editingPersona = computed<Persona | undefined>(() => {
    const e = this.editing();
    return e ? this.personasById().get(e.personaId) : undefined;
  });

  protected readonly allSelected = computed(() => {
    const rows = this.rows();
    return rows.length > 0 && rows.every((r) => this.selection().has(r.id));
  });

  protected readonly trackId = (r: Row): string => r.id;

  // ---- Quick-add (§4.6, task 26) ----------------------------------------

  protected quickAdd(option: PickerOption): void {
    const persona = this.personasById().get(option.id);
    if (!persona) return;
    if (this.store.has(persona.id)) {
      this.notice.set({ text: `${persona.name} is already registered.`, personaId: persona.id });
      return;
    }
    this.store.upsert(defaultEntryFor(persona));
    this.notice.set({ text: `Added ${persona.name}.`, personaId: persona.id });
  }

  // ---- Editor (task 27) -------------------------------------------------

  protected edit(personaId: string): void {
    const entry = this.store.entryFor(personaId);
    if (entry) this.editing.set(entry);
  }

  protected onSave(entry: CompendiumEntry): void {
    this.store.upsert(entry);
    this.closeEditor();
    this.notice.set({ text: `Saved ${this.personasById().get(entry.personaId)?.name ?? entry.personaId}.`, personaId: null });
  }

  protected closeEditor(): void {
    this.editing.set(null);
  }

  // ---- List controls (task 28) ------------------------------------------

  protected editLevel(personaId: string, value: string): void {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) this.store.setLevel(personaId, n);
  }

  protected setProtagonist(value: string): void {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) this.settings.setProtagonistLevel(n);
  }

  protected setSort(key: SortKey): void {
    if (this.sort() === key) this.dir.set(this.dir() === 'asc' ? 'desc' : 'asc');
    else {
      this.sort.set(key);
      this.dir.set('asc');
    }
  }

  protected caret(key: SortKey): string {
    if (this.sort() !== key) return '';
    return this.dir() === 'asc' ? ' ▲' : ' ▼';
  }

  protected toggle(id: string): void {
    this.selection.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected toggleAll(): void {
    const rows = this.rows();
    this.selection.set(this.allSelected() ? new Set() : new Set(rows.map((r) => r.id)));
  }

  protected deleteSelected(): void {
    this.store.removeMany(this.selection());
    this.clearSelection();
  }

  protected clearSelection(): void {
    this.selection.set(new Set());
  }

  // ---- Export / import (§4.6, task 29) ----------------------------------

  protected exportFile(): void {
    const profile = this.store.buildProfile();
    const blob = new Blob([serializeProfile(profile)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename(profile);
    a.click();
    URL.revokeObjectURL(url);
  }

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file
    if (!file) return;
    this.importError.set(null);
    const text = await file.text();
    const result = parseImport(text);
    if (!result.ok) {
      this.importError.set(result.error);
      return;
    }
    // Import offers merge or replace (§4.6). Replace only when the user confirms
    // discarding a non-empty compendium.
    const count = result.profile.entries.length;
    const replace =
      this.store.count() === 0 ||
      confirm(
        `Import ${count} ${count === 1 ? 'entry' : 'entries'}?\n\n` +
          `OK = Replace your ${this.store.count()} current ${this.store.count() === 1 ? 'entry' : 'entries'}.\n` +
          `Cancel = Merge (keep yours, add/overwrite from the file).`,
      );
    this.store.applyImport(result.profile, replace ? 'replace' : 'merge');
    this.notice.set({ text: `Imported ${count} ${count === 1 ? 'entry' : 'entries'} (${replace ? 'replaced' : 'merged'}).`, personaId: null });
  }
}
