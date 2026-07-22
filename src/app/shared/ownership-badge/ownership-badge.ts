import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Compact registered / not-registered marker (§10). Appears wherever a persona
 * is named, so compendium context is always present without a lookup. Colour is
 * backed by an icon and text, never colour alone.
 */
@Component({
  selector: 'app-ownership-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge" [class.badge--owned]="registered()" [attr.aria-label]="aria()">
      <i class="pi" [class.pi-check-circle]="registered()" [class.pi-circle]="!registered()" aria-hidden="true"></i>
      <span class="badge__text">{{ text() }}</span>
    </span>
  `,
  styles: `
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.1rem 0.45rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      background: var(--p-surface-700, rgba(127, 127, 127, 0.18));
      color: var(--p-text-muted-color);
      white-space: nowrap;
    }
    .badge--owned {
      background: color-mix(in srgb, #22c55e 22%, transparent);
      color: #4ade80;
    }
    .pi {
      font-size: 0.8rem;
    }
  `,
})
export class OwnershipBadge {
  readonly registered = input.required<boolean>();
  /** Optional registered level, shown when owned. */
  readonly level = input<number | null>(null);

  protected readonly text = computed(() => {
    if (!this.registered()) return 'Not registered';
    const lvl = this.level();
    return lvl != null ? `Registered · Lv ${lvl}` : 'Registered';
  });

  protected readonly aria = computed(() =>
    this.registered() ? this.text() : 'Not in your compendium',
  );
}
