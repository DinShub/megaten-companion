import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { ThemeService } from '../../../../core/theme/theme.service';
import { SettingsStore } from '../../settings/settings.store';

/** Settings page (§4.8 / task 17). Composes the game settings store with the
 *  global theme service; both persist through the storage layer (task 16). */
@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ButtonModule,
    CardModule,
    InputNumberModule,
    SelectButtonModule,
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
        <ng-template #title>Appearance</ng-template>
        <div class="row">
          <label class="row__label" id="theme-label">
            <span>Theme</span>
          </label>
          <p-selectbutton
            ariaLabelledBy="theme-label"
            [options]="THEME_OPTIONS"
            optionLabel="label"
            optionValue="value"
            [allowEmpty]="false"
            [ngModel]="theme.theme()"
            (ngModelChange)="theme.set($event)"
          />
        </div>
      </p-card>

      <p-card>
        <ng-template #title>Data</ng-template>
        <div class="row">
          <label class="row__label">
            <span>Reset all local data</span>
            <small>Restores default settings and theme. This cannot be undone.</small>
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
  protected readonly theme = inject(ThemeService);

  protected readonly confirming = signal(false);

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

  protected readonly THEME_OPTIONS = [
    { label: 'Dark', value: 'dark' as const },
    { label: 'Light', value: 'light' as const },
  ];

  protected reset(): void {
    this.settings.reset();
    this.theme.set('dark');
    this.confirming.set(false);
  }
}
