import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { Smt3CompendiumStore } from '../../compendium/smt3-compendium.store';
import type { UnlockGroup } from '../../model';
import { Smt3SettingsStore } from '../../settings/smt3-settings.store';

const UNLOCK_GROUPS: readonly { id: UnlockGroup; label: string; blurb: string }[] = [
  { id: 'story', label: 'Story progression', blurb: 'Bosses that join after you beat them — Ose, the Four Oni, the Archangels, Thor…' },
  { id: 'fiend', label: 'Fiend encounters', blurb: 'The Fiends — Matador, Daisoujou, the Four Horsemen… — made by Deathstone fusion.' },
  { id: 'amala', label: 'Labyrinth of Amala', blurb: 'Black Frost, Beelzebub, Metatron, the Shady Broker variants, Dante / Raidou.' },
];

/**
 * Nocturne settings: the Demi-fiend level (Nocturne refuses a fusion whose
 * result outranks him), the level-cap switch, and the three unlock groups.
 * Native controls only — a light page.
 */
@Component({
  selector: 'app-smt3-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="s3-page st">
      <header class="s3-head"><h1>Settings</h1></header>

      <section class="s3-panel">
        <h2>Fusion</h2>
        <div class="st__row">
          <label for="df-level"><span>Demi-fiend level</span><small class="s3-muted">A result above your level is flagged, and the route finder won't fuse it.</small></label>
          <input id="df-level" class="s3-input" type="number" min="1" max="99" [value]="settings.protagonistLevel()" (change)="settings.setProtagonistLevel(+$any($event.target).value)" />
        </div>
        <div class="st__row">
          <label for="cap"><span>Enforce level cap</span><small class="s3-muted">Off shows capped fusions as available, for planning ahead.</small></label>
          <input id="cap" type="checkbox" role="switch" [checked]="settings.enforceLevelCap()" (change)="settings.setEnforceLevelCap($any($event.target).checked)" />
        </div>
      </section>

      <section class="s3-panel">
        <h2>Unlock groups</h2>
        <p class="s3-note">A group switched off removes its demons from fusion results and recipes.</p>
        @for (g of groups; track g.id) {
          <div class="st__row">
            <label [attr.for]="'unlock-' + g.id"><span>{{ g.label }}</span><small class="s3-muted">{{ g.blurb }}</small></label>
            <input [id]="'unlock-' + g.id" type="checkbox" role="switch" [checked]="settings.unlockGroups()[g.id]" (change)="settings.setUnlockGroup(g.id, $any($event.target).checked)" />
          </div>
        }
      </section>

      <section class="s3-panel">
        <h2>Data</h2>
        <div class="st__row">
          <label><span>Reset Nocturne data</span><small class="s3-muted">Restores default Nocturne settings and empties the Nocturne compendium. P5R data is untouched. Can't be undone — export first.</small></label>
          @if (confirming()) {
            <span class="s3-actions">
              <button type="button" class="s3-btn" (click)="reset()">Confirm reset</button>
              <button type="button" class="s3-btn" (click)="confirming.set(false)">Cancel</button>
            </span>
          } @else {
            <button type="button" class="s3-btn" (click)="confirming.set(true)">Reset…</button>
          }
        </div>
      </section>
    </div>
  `,
  styles: `
    .st { max-width: 44rem; }
    .st__row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.6rem 0;
      border-top: 1px solid var(--p-content-border-color, rgba(127,127,127,0.12)); &:first-of-type { border-top: 0; }
      label { display: flex; flex-direction: column; gap: 0.15rem; } small { font-size: 0.8rem; }
      input[type='checkbox'] { width: 1.15rem; height: 1.15rem; accent-color: var(--p-primary-color); } }
  `,
})
export class Smt3SettingsPage {
  protected readonly settings = inject(Smt3SettingsStore);
  private readonly compendium = inject(Smt3CompendiumStore);

  protected readonly groups = UNLOCK_GROUPS;
  protected readonly confirming = signal(false);

  protected reset(): void {
    this.settings.reset();
    this.compendium.clear();
    this.confirming.set(false);
  }
}
