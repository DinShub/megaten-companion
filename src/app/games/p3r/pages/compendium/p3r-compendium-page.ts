import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { PersonaPicker } from '../../../../shared/persona-picker/persona-picker';
import { exportFilename, parseImport, serializeProfile } from '../../compendium/p3r-compendium-io';
import { P3rCompendiumStore } from '../../compendium/p3r-compendium.store';
import { P3rDataService } from '../../data/p3r-data.service';
import { nativeSkills } from '../../fusion';
import type { Profile } from '../../model';
import { ARCANA_ORDER } from '../../model/ids';
import { arcanaLabel } from '../../ui/p3r-format';
import { P3rEntryEditor } from './p3r-entry-editor';

const ARCANA_INDEX = new Map(ARCANA_ORDER.map((r, i) => [r, i] as const));

/**
 * The P3R compendium: the personas you've registered, at their current
 * level and with the skills they actually carry. It's the pool the route
 * finder fuses from and the source of every ownership badge. Export/import is
 * one versioned JSON file, validated whole before anything is applied.
 * `?edit=<id>` opens that entry's editor.
 */
@Component({
  selector: 'app-p3r-compendium-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState, PersonaPicker, P3rEntryEditor],
  template: `
    @if (data.ready()) {
      <div class="p3-page">
        <header class="p3-head">
          <h1>Compendium</h1>
          <span class="p3-count">{{ store.count() }} registered</span>
        </header>

        <div class="p3-cols">
          <section class="p3-panel">
            <h2>Register a persona</h2>
            <app-persona-picker [options]="unregistered()" [compendiumOnly]="false" placeholder="Search personas to register…" (picked)="register($event.id)" />
            <p class="p3-note">Registers it at its base level with the skills it knows there; edit either afterwards.</p>
          </section>
          <section class="p3-panel">
            <h2>Backup</h2>
            <div class="p3-actions">
              <button type="button" class="p3-btn" (click)="exportFile()"><i class="pi pi-download" aria-hidden="true"></i> Export</button>
              <label class="p3-btn"><i class="pi pi-upload" aria-hidden="true"></i> Import<input type="file" accept="application/json,.json" hidden (change)="importFile($event)" /></label>
              @if (store.count()) {
                @if (confirmClear()) {
                  <button type="button" class="p3-btn" (click)="store.clear(); confirmClear.set(false)">Really remove all {{ store.count() }}?</button>
                  <button type="button" class="p3-btn" (click)="confirmClear.set(false)">Keep</button>
                } @else {
                  <button type="button" class="p3-btn" (click)="confirmClear.set(true)"><i class="pi pi-trash" aria-hidden="true"></i> Clear</button>
                }
              }
            </div>
            @if (pending(); as p) {
              <p class="p3-info">“{{ p.name }}” — {{ p.entries.length }} personas.
                <button type="button" class="p3-btn" (click)="apply('merge')">Merge</button>
                <button type="button" class="p3-btn" (click)="apply('replace')">Replace</button>
                <button type="button" class="p3-linkbtn" (click)="pending.set(null)">Cancel</button>
              </p>
            }
            @if (message(); as m) { <p class="p3-note" role="status">{{ m }}</p> }
          </section>
        </div>

        @if (rows().length) {
          <div class="p3-toolbar">
            <span class="p3-search">
              <i class="pi pi-filter" aria-hidden="true"></i>
              <input type="text" placeholder="Filter registered personas…" aria-label="Filter registered personas" [value]="query()" (input)="query.set($any($event.target).value)" />
            </span>
          </div>
          <ul class="p3-list p3-panel">
            @for (r of rows(); track r.id) {
              <li class="cp__row">
                <div class="cp__main">
                  <a class="p3-strong" [routerLink]="nav.link('personas', r.id)">{{ r.name }}</a>
                  <span class="p3-muted">{{ r.arcana }} · Lv {{ r.level }}</span>
                  <span class="p3-muted cp__skills">{{ r.skills }}</span>
                  <span class="cp__actions">
                    <button type="button" class="p3-btn" (click)="editing.set(editing() === r.id ? null : r.id)"><i class="pi pi-pencil" aria-hidden="true"></i> Edit</button>
                    <button type="button" class="p3-btn" (click)="store.remove(r.id)" [attr.aria-label]="'Unregister ' + r.name"><i class="pi pi-times" aria-hidden="true"></i></button>
                  </span>
                </div>
                @if (editing() === r.id) {
                  <app-p3r-entry-editor [personaId]="r.id" (done)="editing.set(null)" />
                }
              </li>
            }
          </ul>
        } @else if (store.count() === 0) {
          <p class="p3-empty">Compendium empty. Register the personas you have in-game; the calculator and route finder fuse from them.</p>
        } @else {
          <p class="p3-empty">No registered persona matches “{{ query() }}”.</p>
        }
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .p3-list > .cp__row { flex-direction: column; align-items: stretch; }
    .cp__main { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.75rem; }
    .cp__skills { flex: 1 1 14rem; font-size: 0.8rem; }
    .cp__actions { display: inline-flex; gap: 0.35rem; margin-left: auto; }
    label.p3-btn { cursor: pointer; }
  `,
})
export class P3rCompendiumPage {
  protected readonly data = inject(P3rDataService);
  protected readonly store = inject(P3rCompendiumStore);
  protected readonly nav = inject(GameRouteContext);

  protected readonly query = signal('');
  protected readonly editing = signal<string | null>(inject(ActivatedRoute).snapshot.queryParamMap.get('edit'));
  protected readonly confirmClear = signal(false);
  protected readonly pending = signal<Profile | null>(null);
  protected readonly message = signal<string | null>(null);

  protected readonly unregistered = computed(() => {
    const owned = this.store.entryMap();
    return (this.data.data()?.personas ?? [])
      .filter((d) => !owned.has(d.id))
      .map((d) => ({ id: d.id, name: d.name, arcana: `${arcanaLabel(d.arcana)} · Lv ${d.level}` }));
  });

  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const personas = this.data.personasById();
    const skills = this.data.skillsById();
    return this.store
      .entries()
      .map((e) => ({ e, d: personas.get(e.personaId) }))
      .filter(({ e, d }) => !q || (d?.name ?? e.personaId).toLowerCase().includes(q))
      .sort((a, b) => (ARCANA_INDEX.get(a.d?.arcana ?? 'fool') ?? 0) - (ARCANA_INDEX.get(b.d?.arcana ?? 'fool') ?? 0) || a.e.level - b.e.level)
      .map(({ e, d }) => ({
        id: e.personaId,
        name: d?.name ?? e.personaId,
        arcana: d ? arcanaLabel(d.arcana) : '?',
        level: e.level,
        skills: e.skillIds.map((id) => skills.get(id)?.name ?? id).join(', ') || 'No skills recorded',
      }));
  });

  protected register(id: string): void {
    const d = this.data.personasById().get(id);
    if (d) this.store.upsert({ personaId: d.id, level: d.level, skillIds: nativeSkills(d) });
  }

  protected exportFile(): void {
    const profile = this.store.buildProfile();
    const blob = new Blob([serializeProfile(profile)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename(profile);
    a.click();
    URL.revokeObjectURL(url);
    this.message.set(`Exported ${profile.entries.length} personas.`);
  }

  protected importFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    void file.text().then((text) => {
      const result = parseImport(text, new Set(this.data.personasById().keys()));
      if (result.ok) {
        this.pending.set(result.profile);
        this.message.set(null);
      } else {
        this.pending.set(null);
        this.message.set(result.error);
      }
    });
  }

  protected apply(mode: 'merge' | 'replace'): void {
    const p = this.pending();
    if (!p) return;
    this.store.applyImport(p, mode);
    this.pending.set(null);
    this.message.set(`${mode === 'merge' ? 'Merged' : 'Replaced with'} ${p.entries.length} personas.`);
  }
}
