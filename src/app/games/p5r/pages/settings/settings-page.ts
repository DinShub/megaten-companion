import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { BackupService, type ValidBackup } from '../../../../core/backup/backup.service';
import { SettingsStore } from '../../settings/settings.store';

/** Settings page (§4.8 / task 17). The game settings store, persisted
 *  through the storage layer (task 16). The app is dark-only, so no theme row. */
@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ButtonModule,
    CardModule,
    InputNumberModule,
    ToggleSwitchModule,
  ],
  template: `
    <div class="settings">
      <h1 class="settings__title">Settings</h1>

      <p-card>
        <ng-template #title>Fusion</ng-template>
        <div class="row">
          <label class="row__label" for="protag-level">
            <span>Protagonist level</span>
            <small>Gates fusion results — a result above your level is flagged, not hidden.</small>
          </label>
          <p-inputnumber
            inputId="protag-level"
            [min]="1"
            [max]="99"
            [showButtons]="true"
            [useGrouping]="false"
            [ngModel]="settings.protagonistLevel()"
            (ngModelChange)="settings.setProtagonistLevel($event)"
          />
        </div>

        <div class="row">
          <label class="row__label" for="enforce-cap">
            <span>Enforce level cap</span>
            <small>Off shows level-capped fusions as available, for theoretical planning.</small>
          </label>
          <p-toggleswitch
            inputId="enforce-cap"
            [ngModel]="settings.enforceLevelCap()"
            (ngModelChange)="settings.setEnforceLevelCap($event)"
          />
        </div>

        <div class="row">
          <label class="row__label" for="alarm">
            <span>Fusion Alarm</span>
            <small>Alters fusion and itemization results (§6.7).</small>
          </label>
          <p-toggleswitch
            inputId="alarm"
            [ngModel]="settings.alarm()"
            (ngModelChange)="settings.setAlarm($event)"
          />
        </div>
      </p-card>

      <p-card>
        <ng-template #title>Unlock groups</ng-template>
        <ng-template #subtitle>
          A group switched off hides its personas from lists and excludes them from fusion.
        </ng-template>

        @for (group of UNLOCK_GROUPS; track group.id) {
          <div class="row">
            <label class="row__label" [attr.for]="'unlock-' + group.id">
              <span>{{ group.label }}</span>
              <small>{{ group.blurb }}</small>
            </label>
            <p-toggleswitch
              [inputId]="'unlock-' + group.id"
              [ngModel]="settings.unlockGroups()[group.id]"
              (ngModelChange)="settings.setUnlockGroup(group.id, $event)"
            />
          </div>
        }
      </p-card>

      <p-card>
        <ng-template #title>Data</ng-template>
        <div class="row">
          <label class="row__label">
            <span>Back up everything</span>
            <small>One file with your compendiums and settings for every game — P5R and Nocturne.</small>
          </label>
          <p-button
            label="Back up"
            icon="pi pi-download"
            severity="secondary"
            [outlined]="true"
            size="small"
            (onClick)="backup.download()"
          />
        </div>

        <div class="row">
          <label class="row__label" for="restore-file">
            <span>Restore from backup</span>
            <small>Replaces the data in the backup — every game it covers. The app reloads afterwards.</small>
          </label>
          <input
            #restoreFile
            id="restore-file"
            type="file"
            accept="application/json,.json"
            hidden
            (change)="pickBackup($event)"
          />
          <p-button
            label="Restore…"
            icon="pi pi-upload"
            severity="secondary"
            [outlined]="true"
            size="small"
            (onClick)="restoreFile.click()"
          />
        </div>

        @if (restoring(); as r) {
          <div class="restore" role="group" aria-label="Confirm restore">
            <p>Backup from {{ savedWhen(r.savedAt) }}:</p>
            <ul>
              @for (item of r.items; track item.label) {
                <li>{{ item.label }}@if (item.detail) { — {{ item.detail }} }</li>
              }
            </ul>
            <p>This replaces what you have now for each item above.</p>
            <div class="row__confirm">
              <p-button label="Restore and reload" severity="danger" size="small" (onClick)="restore(r)" />
              <p-button
                label="Cancel"
                severity="secondary"
                [text]="true"
                size="small"
                (onClick)="restoring.set(null)"
              />
            </div>
          </div>
        }
        @if (backupError(); as err) {
          <p class="restore__error" role="alert"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i> {{ err }}</p>
        }

        <div class="row">
          <label class="row__label">
            <span>Reset all local data</span>
            <small>Restores default settings. This cannot be undone.</small>
          </label>
          @if (confirming()) {
            <div class="row__confirm">
              <p-button label="Confirm reset" severity="danger" size="small" (onClick)="reset()" />
              <p-button
                label="Cancel"
                severity="secondary"
                [text]="true"
                size="small"
                (onClick)="confirming.set(false)"
              />
            </div>
          } @else {
            <p-button
              label="Reset…"
              icon="pi pi-trash"
              severity="danger"
              [outlined]="true"
              size="small"
              (onClick)="confirming.set(true)"
            />
          }
        </div>
      </p-card>
    </div>
  `,
  styles: `
    .settings {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      max-width: 44rem;
    }
    .settings__title {
      margin: 0;
      font-size: 1.5rem;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.65rem 0;
      border-top: 1px solid var(--p-content-border-color, rgba(255, 255, 255, 0.08));
    }
    .row:first-of-type {
      border-top: 0;
    }
    .row__label {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;

      small {
        color: var(--p-text-muted-color);
        font-size: 0.82rem;
        max-width: 30rem;
      }
    }
    .restore {
      margin: 0.25rem 0 0.75rem;
      padding: 0.75rem 1rem;
      border: 1px solid var(--p-content-border-color, rgba(255, 255, 255, 0.08));

      p {
        margin: 0.25rem 0;
      }
      ul {
        margin: 0.25rem 0 0.5rem;
        padding-left: 1.25rem;
      }
      .row__confirm {
        justify-content: flex-start;
      }
    }
    .restore__error {
      margin: 0.25rem 0 0.75rem;
      color: var(--p-red-600, #dc2626);
    }
    .row__confirm {
      display: inline-flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
  `,
})
export class SettingsPage {
  protected readonly settings = inject(SettingsStore);

  protected readonly backup = inject(BackupService);

  protected readonly confirming = signal(false);
  /** A validated backup awaiting the user's confirmation. */
  protected readonly restoring = signal<ValidBackup | null>(null);
  protected readonly backupError = signal<string | null>(null);

  protected readonly UNLOCK_GROUPS = [
    {
      id: 'story' as const,
      label: 'Story Progression',
      blurb: 'Black Frost, Satanael, Third-Semester personas…',
    },
    {
      id: 'confidant' as const,
      label: 'Maxed Confidant',
      blurb: '23 personas gated behind a maxed Confidant (Vishnu, Metatron…).',
    },
    {
      id: 'dlc' as const,
      label: 'Downloadable Content',
      blurb: 'DLC personas (Izanagi, Raoul, Orpheus…). Off by default.',
    },
  ];

  protected reset(): void {
    this.settings.reset();
    this.confirming.set(false);
  }

  protected async pickBackup(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file
    if (!file) return;
    const result = this.backup.parse(await file.text());
    this.restoring.set(result.ok ? result : null);
    this.backupError.set(result.ok ? null : result.error);
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
