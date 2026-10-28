import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { BackupService, type ValidBackup } from '../../../../core/backup/backup.service';
import { P4gCompendiumStore } from '../../compendium/p4g-compendium.store';
import type { UnlockGroup } from '../../model';
import { P4gSettingsStore } from '../../settings/p4g-settings.store';

const UNLOCK_GROUPS: readonly { id: UnlockGroup; label: string; blurb: string }[] = [
  { id: 'story', label: 'Story progression', blurb: 'Izanagi-no-Okami, after the true ending.' },
  { id: 'social-link', label: 'Maxed Social Links', blurb: 'The ultimate persona of each arcana — Loki, Kaguya, Magatsu-Izanagi… — once its Social Link reaches rank 10.' },
];

/**
 * P4G settings: the protagonist level (P4G refuses a fusion whose
 * result outranks the protagonist), the level-cap switch, and the two unlock groups.
 * Native controls only — a light page.
 */
@Component({
  selector: 'app-p4g-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p4-page st">
      <header class="p4-head"><h1>Settings</h1></header>

      <section class="p4-panel">
        <h2>Fusion</h2>
        <div class="st__row">
          <label for="df-level"><span>Protagonist level</span><small class="p4-muted">A result above your level is flagged, and the route finder won't fuse it.</small></label>
          <input id="df-level" class="p4-input" type="number" min="1" max="99" [value]="settings.protagonistLevel()" (change)="settings.setProtagonistLevel(+$any($event.target).value)" />
        </div>
        <div class="st__row">
          <label for="cap"><span>Enforce level cap</span><small class="p4-muted">Off shows capped fusions as available, for planning ahead.</small></label>
          <input id="cap" type="checkbox" role="switch" [checked]="settings.enforceLevelCap()" (change)="settings.setEnforceLevelCap($any($event.target).checked)" />
        </div>
      </section>

      <section class="p4-panel">
        <h2>Unlock groups</h2>
        <p class="p4-note">A group switched off removes its personas from fusion results and recipes.</p>
        @for (g of groups; track g.id) {
          <div class="st__row">
            <label [attr.for]="'unlock-' + g.id"><span>{{ g.label }}</span><small class="p4-muted">{{ g.blurb }}</small></label>
            <input [id]="'unlock-' + g.id" type="checkbox" role="switch" [checked]="settings.unlockGroups()[g.id]" (change)="settings.setUnlockGroup(g.id, $any($event.target).checked)" />
          </div>
        }
      </section>

      <section class="p4-panel">
        <h2>Data</h2>
        <div class="st__row">
          <label><span>Back up everything</span><small class="p4-muted">One file with your compendiums and settings for every game.</small></label>
          <button type="button" class="p4-btn" (click)="backup.download()"><i class="pi pi-download" aria-hidden="true"></i> Back up</button>
        </div>
        <div class="st__row">
          <label for="restore-file"><span>Restore from backup</span><small class="p4-muted">Replaces the data in the backup — every game it covers. The app reloads afterwards.</small></label>
          <label class="p4-btn"><i class="pi pi-upload" aria-hidden="true"></i> Restore…<input id="restore-file" type="file" accept="application/json,.json" hidden (change)="pickBackup($event)" /></label>
        </div>
        @if (restoring(); as r) {
          <div class="p4-info st__restore">
            <p>Backup from {{ savedWhen(r.savedAt) }}:</p>
            <ul>
              @for (item of r.items; track item.label) {
                <li>{{ item.label }}@if (item.detail) { — {{ item.detail }} }</li>
              }
            </ul>
            <p>This replaces what you have now for each item above.</p>
            <span class="p4-actions">
              <button type="button" class="p4-btn" (click)="restore(r)">Restore and reload</button>
              <button type="button" class="p4-btn" (click)="restoring.set(null)">Cancel</button>
            </span>
          </div>
        }
        @if (backupError(); as err) { <p class="p4-note" role="alert">{{ err }}</p> }
        <div class="st__row">
          <label><span>Reset P4G data</span><small class="p4-muted">Restores default P4G settings and empties the P4G compendium. Other games are untouched. Can't be undone — export first.</small></label>
          @if (confirming()) {
            <span class="p4-actions">
              <button type="button" class="p4-btn" (click)="reset()">Confirm reset</button>
              <button type="button" class="p4-btn" (click)="confirming.set(false)">Cancel</button>
            </span>
          } @else {
            <button type="button" class="p4-btn" (click)="confirming.set(true)">Reset…</button>
          }
        </div>
      </section>
    </div>
  `,
  styles: `
    .st { max-width: 44rem; }
    .st__row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.6rem 0;
      border-top: 1px solid var(--p-content-border-color, rgba(127,127,127,0.12)); &:first-of-type { border-top: 0; }
      label:not(.p4-btn) { display: flex; flex-direction: column; gap: 0.15rem; } small { font-size: 0.8rem; }
      input[type='checkbox'] { width: 1.15rem; height: 1.15rem; accent-color: var(--p-primary-color); }
      .p4-btn { flex-shrink: 0; white-space: nowrap; } }
    .st__restore { margin: 0.25rem 0 0.6rem; p { margin: 0.25rem 0; } ul { margin: 0.25rem 0 0.5rem; padding-left: 1.25rem; } }
  `,
})
export class P4gSettingsPage {
  protected readonly settings = inject(P4gSettingsStore);
  private readonly compendium = inject(P4gCompendiumStore);

  protected readonly backup = inject(BackupService);

  protected readonly groups = UNLOCK_GROUPS;
  protected readonly confirming = signal(false);
  /** A validated backup awaiting the user's confirmation. */
  protected readonly restoring = signal<ValidBackup | null>(null);
  protected readonly backupError = signal<string | null>(null);

  protected reset(): void {
    this.settings.reset();
    this.compendium.clear();
    this.confirming.set(false);
  }

  protected pickBackup(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    void file.text().then((text) => {
      const result = this.backup.parse(text);
      this.restoring.set(result.ok ? result : null);
      this.backupError.set(result.ok ? null : result.error);
    });
  }

  protected restore(backup: ValidBackup): void {
    this.backupError.set(this.backup.restore(backup));
    this.restoring.set(null);
  }

  protected savedWhen(savedAt: string): string {
    const date = new Date(savedAt);
    return savedAt && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'an unknown date';
  }
}
