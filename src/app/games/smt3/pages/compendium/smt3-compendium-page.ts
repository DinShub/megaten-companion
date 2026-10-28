import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { PersonaPicker } from '../../../../shared/persona-picker/persona-picker';
import { exportFilename, parseImport, serializeProfile } from '../../compendium/smt3-compendium-io';
import { Smt3CompendiumStore } from '../../compendium/smt3-compendium.store';
import { Smt3DataService } from '../../data/smt3-data.service';
import { nativeSkills } from '../../fusion';
import type { Profile } from '../../model';
import { RACE_ORDER } from '../../model/ids';
import { raceLabel } from '../../ui/smt3-format';
import { Smt3EntryEditor } from './smt3-entry-editor';

const RACE_INDEX = new Map(RACE_ORDER.map((r, i) => [r, i] as const));

/**
 * The Nocturne compendium: the demons you've registered, at their current
 * level and with the skills they actually carry. It's the pool the route
 * finder fuses from and the source of every ownership badge. Export/import is
 * one versioned JSON file, validated whole before anything is applied.
 * `?edit=<id>` opens that entry's editor.
 */
@Component({
  selector: 'app-smt3-compendium-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState, PersonaPicker, Smt3EntryEditor],
  template: `
    @if (data.ready()) {
      <div class="s3-page">
        <header class="s3-head">
          <h1>Compendium</h1>
          <span class="s3-count">{{ store.count() }} registered</span>
        </header>

        <div class="s3-cols">
          <section class="s3-panel">
            <h2>Register a demon</h2>
            <app-persona-picker [options]="unregistered()" [compendiumOnly]="false" placeholder="Search demons to register…" (picked)="register($event.id)" />
            <p class="s3-note">Registers it at its base level with the skills it knows there; edit either afterwards.</p>
          </section>
          <section class="s3-panel">
            <h2>Backup</h2>
            <div class="s3-actions">
              <button type="button" class="s3-btn" (click)="exportFile()"><i class="pi pi-download" aria-hidden="true"></i> Export</button>
              <label class="s3-btn"><i class="pi pi-upload" aria-hidden="true"></i> Import<input type="file" accept="application/json,.json" hidden (change)="importFile($event)" /></label>
              @if (store.count()) {
                @if (confirmClear()) {
                  <button type="button" class="s3-btn" (click)="store.clear(); confirmClear.set(false)">Really remove all {{ store.count() }}?</button>
                  <button type="button" class="s3-btn" (click)="confirmClear.set(false)">Keep</button>
                } @else {
                  <button type="button" class="s3-btn" (click)="confirmClear.set(true)"><i class="pi pi-trash" aria-hidden="true"></i> Clear</button>
                }
              }
            </div>
            @if (pending(); as p) {
              <p class="s3-info">“{{ p.name }}” — {{ p.entries.length }} demons.
                <button type="button" class="s3-btn" (click)="apply('merge')">Merge</button>
                <button type="button" class="s3-btn" (click)="apply('replace')">Replace</button>
                <button type="button" class="s3-linkbtn" (click)="pending.set(null)">Cancel</button>
              </p>
            }
            @if (message(); as m) { <p class="s3-note" role="status">{{ m }}</p> }
          </section>
        </div>

        @if (rows().length) {
          <div class="s3-toolbar">
            <span class="s3-search">
              <i class="pi pi-filter" aria-hidden="true"></i>
              <input type="text" placeholder="Filter registered demons…" aria-label="Filter registered demons" [value]="query()" (input)="query.set($any($event.target).value)" />
            </span>
          </div>
          <ul class="s3-list s3-panel">
            @for (r of rows(); track r.id) {
              <li class="cp__row">
                <div class="cp__main">
                  <a class="s3-strong" [routerLink]="nav.link('demons', r.id)">{{ r.name }}</a>
                  <span class="s3-muted">{{ r.race }} · Lv {{ r.level }}</span>
                  <span class="s3-muted cp__skills">{{ r.skills }}</span>
                  <span class="cp__actions">
                    <button type="button" class="s3-btn" (click)="editing.set(editing() === r.id ? null : r.id)"><i class="pi pi-pencil" aria-hidden="true"></i> Edit</button>
                    <button type="button" class="s3-btn" (click)="store.remove(r.id)" [attr.aria-label]="'Unregister ' + r.name"><i class="pi pi-times" aria-hidden="true"></i></button>
                  </span>
                </div>
                @if (editing() === r.id) {
                  <app-smt3-entry-editor [demonId]="r.id" (done)="editing.set(null)" />
                }
              </li>
            }
          </ul>
        } @else if (store.count() === 0) {
          <p class="s3-empty">Nothing registered yet. Register the demons you have in-game, and the calculator and route finder will fuse from them.</p>
        } @else {
          <p class="s3-empty">No registered demon matches “{{ query() }}”.</p>
        }
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
  styles: `
    .cp__row { flex-direction: column; align-items: stretch; }
    .cp__main { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.75rem; }
    .cp__skills { flex: 1 1 14rem; font-size: 0.8rem; }
    .cp__actions { display: inline-flex; gap: 0.35rem; margin-left: auto; }
    label.s3-btn { cursor: pointer; }
  `,
})
export class Smt3CompendiumPage {
  protected readonly data = inject(Smt3DataService);
  protected readonly store = inject(Smt3CompendiumStore);
  protected readonly nav = inject(GameRouteContext);

  protected readonly query = signal('');
  protected readonly editing = signal<string | null>(inject(ActivatedRoute).snapshot.queryParamMap.get('edit'));
  protected readonly confirmClear = signal(false);
  protected readonly pending = signal<Profile | null>(null);
  protected readonly message = signal<string | null>(null);

  protected readonly unregistered = computed(() => {
    const owned = this.store.entryMap();
    return (this.data.data()?.demons ?? [])
      .filter((d) => !owned.has(d.id))
      .map((d) => ({ id: d.id, name: d.name, arcana: `${raceLabel(d.race)} · Lv ${d.level}` }));
  });

  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const demons = this.data.demonsById();
    const skills = this.data.skillsById();
    return this.store
      .entries()
      .map((e) => ({ e, d: demons.get(e.demonId) }))
      .filter(({ e, d }) => !q || (d?.name ?? e.demonId).toLowerCase().includes(q))
      .sort((a, b) => (RACE_INDEX.get(a.d?.race ?? 'deity') ?? 0) - (RACE_INDEX.get(b.d?.race ?? 'deity') ?? 0) || a.e.level - b.e.level)
      .map(({ e, d }) => ({
        id: e.demonId,
        name: d?.name ?? e.demonId,
        race: d ? raceLabel(d.race) : '?',
        level: e.level,
        skills: e.skillIds.map((id) => skills.get(id)?.name ?? id).join(', ') || 'No skills recorded',
      }));
  });

  protected register(id: string): void {
    const d = this.data.demonsById().get(id);
    if (d) this.store.upsert({ demonId: d.id, level: d.level, skillIds: nativeSkills(d) });
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
    this.message.set(`Exported ${profile.entries.length} demons.`);
  }

  protected importFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    void file.text().then((text) => {
      const result = parseImport(text, new Set(this.data.demonsById().keys()));
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
    this.message.set(`${mode === 'merge' ? 'Merged' : 'Replaced with'} ${p.entries.length} demons.`);
  }
}
