import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GameRouteContext } from '../../../../shared/game-route';
import { LoadState } from '../../../../shared/load-state/load-state';
import { exportFilename, MAX_NOTE_LENGTH, parseImport, serializeProfile } from '../../compendium/smt1-compendium-io';
import { Smt1CompendiumStore } from '../../compendium/smt1-compendium.store';
import { Smt1DataService } from '../../data/smt1-data.service';
import type { Demon, Profile } from '../../model';
import { displayLevel } from '../../model';
import { RACE_ORDER } from '../../model/ids';
import { raceLabel } from '../../ui/smt1-format';

type Show = 'all' | 'have' | 'missing';

/**
 * The compendium as the guide's demon checklist: a box per demon, grouped by
 * race, ticked in pen. Each owned demon can carry a short note. SMT1 demons keep
 * a fixed level and skills, so a tick is the whole entry (§17.1 A3). Backup is
 * export / import of this list.
 */
@Component({
  selector: 'app-smt1-compendium-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadState],
  template: `
    @if (data.ready()) {
      <div class="g1-page">
        <div class="g1-runhead">
          <div>
            <h1><span class="g1-runhead__jp g1-plate" lang="ja">悪魔全書</span>Compendium</h1>
            <p>Tick the demons you have. The route finder starts from your ticked demons.</p>
          </div>
          <p class="g1-tally" aria-live="polite">
            <span class="g1-tally__n">{{ store.count() }}<small> / {{ total() }}</small></span>
            <span class="g1-tally__bar" aria-hidden="true"><i [style.width.%]="(store.count() / total()) * 100"></i></span>
          </p>
        </div>

        <div class="g1-checklist-layout">
          <div>
            <div class="g1-toolbar">
              <label class="g1-field">
                <span>Filter</span>
                <input type="search" placeholder="Name, katakana or race" [value]="query()" (input)="query.set($any($event.target).value)" />
              </label>
              <div class="g1-seg" role="group" aria-label="Show">
                <button type="button" [attr.aria-pressed]="show() === 'all'" (click)="show.set('all')">All</button>
                <button type="button" [attr.aria-pressed]="show() === 'have'" (click)="show.set('have')">Ticked</button>
                <button type="button" [attr.aria-pressed]="show() === 'missing'" (click)="show.set('missing')">Not yet</button>
              </div>
            </div>

            @if (groups().length) {
              <div class="g1-checklist">
                @for (g of groups(); track g.race) {
                  <section class="g1-race">
                    <h2>{{ race(g.race) }}<small>{{ g.owned }}/{{ g.total }}</small></h2>
                    <ul>
                      @for (d of g.demons; track d.id) {
                        <li>
                          <label class="g1-item">
                            <span class="g1-tick">
                              <input type="checkbox" [checked]="store.has(d.id)" (change)="store.setOwned(d.id, $any($event.target).checked)" [attr.aria-label]="'Have ' + d.name" />
                              <i></i><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 10.5 8 15 17 3.5" /></svg>
                            </span>
                            <span class="lv">{{ level(d) }}</span>
                            <span class="nm">{{ d.name }}</span>
                          </label>
                          @if (store.has(d.id)) {
                            <button type="button" class="g1-linkbtn g1-item__note" (click)="editing.set(editing() === d.id ? null : d.id)" [attr.aria-expanded]="editing() === d.id">
                              {{ store.entryFor(d.id)?.note || 'Add a note' }}
                            </button>
                            @if (editing() === d.id) {
                              <div class="g1-note-edit">
                                <label class="g1-sr" [attr.for]="'note-' + d.id">Note for {{ d.name }}</label>
                                <textarea [id]="'note-' + d.id" rows="2" [attr.maxlength]="maxNote" [value]="store.entryFor(d.id)?.note ?? ''"
                                  (change)="store.setNote(d.id, $any($event.target).value)"></textarea>
                                <span class="g1-actions">
                                  <a [routerLink]="nav.link('demons', d.id)">Open entry</a>
                                  <button type="button" class="g1-btn g1-btn--small" (click)="editing.set(null)">Done</button>
                                </span>
                              </div>
                            }
                          }
                        </li>
                      }
                    </ul>
                  </section>
                }
              </div>
            } @else {
              <p class="g1-empty">{{ show() === 'have' && !store.count() ? 'Nothing ticked yet. Tick a demon you have and it shows up here.' : 'No demon matches that filter.' }}</p>
            }
          </div>

          <aside class="g1-side">
            <section class="g1-box" aria-labelledby="bk-t">
              <div class="g1-box__bar g1-plate"><h2 id="bk-t">Backup</h2></div>
              <div class="g1-box__data">
                <p class="g1-meta">Save your ticks and notes to a file, or load them on another device.</p>
                <div class="g1-actions">
                  <button type="button" class="g1-btn g1-btn--small" (click)="exportFile()">Export</button>
                  <label class="g1-btn g1-btn--small">Import<input type="file" accept="application/json,.json" hidden (change)="importFile($event)" /></label>
                  @if (confirmClear()) {
                    <button type="button" class="g1-btn g1-btn--small g1-btn--spot" (click)="store.clear(); confirmClear.set(false)">Untick all {{ store.count() }}</button>
                    <button type="button" class="g1-btn g1-btn--small" (click)="confirmClear.set(false)">Keep them</button>
                  } @else {
                    <button type="button" class="g1-btn g1-btn--small" [disabled]="!store.count()" (click)="confirmClear.set(true)">Untick all</button>
                  }
                </div>
                @if (pending(); as p) {
                  <p class="g1-meta">“{{ p.name }}”: {{ p.entries.length }} demons.</p>
                  <div class="g1-actions">
                    <button type="button" class="g1-btn g1-btn--small" (click)="apply('merge')">Merge</button>
                    <button type="button" class="g1-btn g1-btn--small" (click)="apply('replace')">Replace</button>
                    <button type="button" class="g1-linkbtn" (click)="pending.set(null)">Cancel</button>
                  </div>
                }
                @if (message(); as m) { <p class="g1-legend" role="status">{{ m }}</p> }
              </div>
            </section>
            <aside class="g1-point g1-halftone" aria-label="About entries">
              <span class="g1-point__mark g1-plate" lang="ja" aria-hidden="true">注意</span>
              <p>An SMT1 demon keeps its level and skills, so an entry is a tick and a note. Level and skills come from the demon's data.</p>
            </aside>
          </aside>
        </div>
        <p class="g1-foot">Your ticks are kept in this browser and go into the whole-app backup in Settings.</p>
      </div>
    } @else {
      <app-load-state [loading]="data.loading()" [error]="data.error()" (retry)="data.retry()" />
    }
  `,
})
export class Smt1CompendiumPage {
  protected readonly data = inject(Smt1DataService);
  protected readonly store = inject(Smt1CompendiumStore);
  protected readonly nav = inject(GameRouteContext);
  protected readonly race = raceLabel;
  protected readonly level = displayLevel;
  protected readonly maxNote = MAX_NOTE_LENGTH;

  protected readonly query = signal('');
  protected readonly show = signal<Show>('all');
  protected readonly editing = signal<string | null>(null);
  protected readonly confirmClear = signal(false);
  protected readonly pending = signal<Profile | null>(null);
  protected readonly message = signal<string | null>(null);

  protected readonly total = computed(() => this.data.data()?.demons.length ?? 1);

  protected readonly groups = computed(() => {
    const q = this.query().trim().toLowerCase();
    const show = this.show();
    const owned = this.store.ownedIds();
    const demons = [...(this.data.data()?.demons ?? [])];
    return RACE_ORDER.flatMap((race) => {
      const all = demons.filter((d) => d.race === race).sort((a, b) => a.level - b.level);
      const shown = all.filter((d: Demon) => {
        const has = owned.has(d.id);
        const text = `${d.name} ${d.jp ?? ''} ${d.race}`.toLowerCase();
        return (!q || text.includes(q)) && (show === 'all' || (show === 'have') === has);
      });
      return shown.length ? [{ race, demons: shown, total: all.length, owned: all.filter((d) => owned.has(d.id)).length }] : [];
    });
  });

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
