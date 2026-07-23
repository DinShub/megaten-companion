import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { SettingsStore } from '../../settings/settings.store';

/**
 * In-context Fusion Alarm switch (§6.7, task 55). The alarm is a single boolean
 * modifier threaded through fusion and itemization (`FusionContext.alarm`, sourced
 * from {@link SettingsStore.alarm}) — *not* a duplicate dataset. This control is
 * the modifier made visible: it reads and writes that one signal, so flipping it
 * on any fusion surface instantly re-derives every alarm-sensitive result
 * (itemization cards, the gallows EXP note) across all of them at once.
 *
 * A tiny standalone component rather than repeated inline markup: the calculator
 * shell and the itemization page both host it, and both must drive the *same*
 * setting. It injects the P5R store directly (so it lives under `games/p5r/`, not
 * `shared/`) and is only imported by the lazy fusion pages, so it adds nothing to
 * the eager bundle.
 */
@Component({
  selector: 'app-fusion-alarm-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      role="switch"
      class="alarm"
      [class.is-on]="on()"
      [attr.aria-checked]="on()"
      [title]="on() ? 'Fusion Alarm on — itemization and gallows EXP reflect it' : 'Fusion Alarm off — turn on to see alarm results'"
      (click)="toggle()"
    >
      <i class="pi" [class.pi-bell]="on()" [class.pi-bell-slash]="!on()" aria-hidden="true"></i>
      <span class="alarm__lbl">Fusion Alarm</span>
      <span class="alarm__state">{{ on() ? 'On' : 'Off' }}</span>
    </button>
  `,
  styles: `
    .alarm {
      display: inline-flex; align-items: center; gap: 0.45rem; white-space: nowrap;
      padding: 0.4rem 0.8rem; border: 1px solid var(--p-content-border-color, rgba(127, 127, 127, 0.3));
      border-radius: 999px; background: transparent; color: var(--p-text-muted-color);
      font: inherit; font-size: 0.85rem; cursor: pointer;
      &:hover { color: var(--p-text-color); border-color: var(--p-text-muted-color); }
      &.is-on {
        color: var(--p-primary-color);
        border-color: color-mix(in srgb, var(--p-primary-color) 55%, transparent);
        background: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
      }
    }
    .alarm__state {
      padding: 0.05rem 0.4rem; border-radius: 999px; font-size: 0.72rem; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.03em;
      background: var(--p-surface-700, rgba(127, 127, 127, 0.2));
      .is-on & { background: color-mix(in srgb, var(--p-primary-color) 22%, transparent); }
    }
  `,
})
export class FusionAlarmToggle {
  private readonly settings = inject(SettingsStore);

  /** The one Fusion Alarm signal (§6.7) — shared by every surface that hosts this toggle. */
  protected readonly on = this.settings.alarm;

  protected toggle(): void {
    this.settings.setAlarm(!this.on());
  }
}
