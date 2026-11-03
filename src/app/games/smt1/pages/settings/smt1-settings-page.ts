import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { BackupService, type ValidBackup } from '../../../../core/backup/backup.service';
import { Smt1CompendiumStore } from '../../compendium/smt1-compendium.store';
import { Smt1SettingsStore } from '../../settings/smt1-settings.store';

/**
 * SMT1 settings, as the reader's own page at the back of the guide: the hero
 * level and the level-cap switch, then the whole-app backup, restore and reset.
 */
@Component({
  selector: 'app-smt1-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g1-page">
      <div class="g1-runhead">
        <div>
          <h1><span class="g1-runhead__jp g1-plate" lang="ja">設定</span>Settings</h1>
          <p>Settings for this game only. The backup covers every game.</p>
        </div>
      </div>

      <div class="g1-forms">
        <section class="g1-box" aria-labelledby="f-t">
          <div class="g1-box__bar g1-plate"><h2 id="f-t">Fusion</h2></div>
          <div class="g1-row">
            <label class="g1-row__label" for="hero-level"><b>Hero level</b><small>A result above your level is flagged, and the route finder won't use it.</small></label>
            <input class="g1-level" id="hero-level" type="number" min="1" max="99" [value]="settings.heroLevel()" (change)="settings.setHeroLevel(+$any($event.target).value)" />
          </div>
          <div class="g1-row">
            <label class="g1-row__label" for="cap"><b>Enforce level cap</b><small>Turn off to plan fusions you can't make yet.</small></label>
            <span class="g1-tick"><input id="cap" type="checkbox" [checked]="settings.enforceLevelCap()" (change)="settings.setEnforceLevelCap($any($event.target).checked)" /><i></i><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 10.5 8 15 17 3.5" /></svg></span>
          </div>
        </section>

        <section class="g1-box" aria-labelledby="d-t">
          <div class="g1-box__bar g1-plate"><h2 id="d-t">Data</h2></div>
          <div class="g1-row">
            <span class="g1-row__label"><b>Back up everything</b><small>One file with your compendiums and settings for every game.</small></span>
            <button type="button" class="g1-btn g1-btn--small" (click)="backup.download()">Back up</button>
          </div>
          <div class="g1-row">
            <label class="g1-row__label" for="restore-file"><b>Restore from backup</b><small>Replaces the data in the backup, for every game it covers. The app reloads afterwards.</small></label>
            <label class="g1-btn g1-btn--small">Restore…<input id="restore-file" type="file" accept="application/json,.json" hidden (change)="pickBackup($event)" /></label>
          </div>
          @if (restoring(); as r) {
            <div class="g1-row g1-row--confirm">
              <div>
                <p>Backup from {{ savedWhen(r.savedAt) }}:</p>
                <ul>
                  @for (item of r.items; track item.label) {
                    <li>{{ item.label }}@if (item.detail) {: {{ item.detail }}}</li>
                  }
                </ul>
                <p>This replaces what you have now for each item above.</p>
              </div>
              <span class="g1-actions">
                <button type="button" class="g1-btn g1-btn--small g1-btn--spot" (click)="restore(r)">Restore and reload</button>
                <button type="button" class="g1-btn g1-btn--small" (click)="restoring.set(null)">Cancel</button>
              </span>
            </div>
          }
          @if (backupError(); as err) { <p class="g1-legend g1-row" role="alert">{{ err }}</p> }
          <div class="g1-row">
            <span class="g1-row__label"><b>Reset SMT1 data</b><small>Restores default settings and unticks the SMT1 compendium. Other games are untouched. Export first: this can't be undone.</small></span>
            @if (confirming()) {
              <span class="g1-actions">
                <button type="button" class="g1-btn g1-btn--small g1-btn--spot" (click)="reset()">Confirm reset</button>
                <button type="button" class="g1-btn g1-btn--small" (click)="confirming.set(false)">Cancel</button>
              </span>
            } @else {
              <button type="button" class="g1-btn g1-btn--small" (click)="confirming.set(true)">Reset…</button>
            }
          </div>
        </section>
      </div>
    </div>
  `,
})
export class Smt1SettingsPage {
  protected readonly settings = inject(Smt1SettingsStore);
  private readonly compendium = inject(Smt1CompendiumStore);
  protected readonly backup = inject(BackupService);

  protected readonly confirming = signal(false);
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
