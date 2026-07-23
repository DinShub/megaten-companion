import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Loading / error chrome for a data-backed page. Presentational: the page passes
 * the {@link GameDataService} states in, and a retry click bubbles back up so the
 * service (not this component) owns the re-fetch. A network failure surfaces a
 * retry here rather than a blank page (§task 12).
 *
 * The page renders its real content only once data is ready; this covers the
 * `loading` and `error` branches.
 */
@Component({
  selector: 'app-load-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error()) {
      <div class="load load--error" role="alert">
        <i class="pi pi-exclamation-triangle load__icon" aria-hidden="true"></i>
        <p class="load__msg">{{ error() }}</p>
        <button class="load__retry" type="button" (click)="retry.emit()">
          <i class="pi pi-refresh" aria-hidden="true"></i>
          <span>Retry</span>
        </button>
      </div>
    } @else if (loading()) {
      <div class="load" role="status" aria-live="polite">
        <i class="pi pi-spin pi-spinner load__icon" aria-hidden="true"></i>
        <p class="load__msg">Loading game data…</p>
      </div>
    }
  `,
  styles: `
    .load {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      min-height: 40vh;
      padding: 2rem 1rem;
      text-align: center;
    }
    .load__icon {
      font-size: 2rem;
      color: var(--p-primary-color);
    }
    .load--error .load__icon {
      color: var(--app-warn);
    }
    .load__msg {
      margin: 0;
      max-width: 32rem;
      color: var(--p-text-muted-color);
    }
    .load__retry {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.45rem 0.9rem;
      border: 1px solid var(--p-primary-color);
      border-radius: var(--p-border-radius, 6px);
      background: transparent;
      color: var(--p-primary-color);
      cursor: pointer;
      font: inherit;

      &:hover {
        background: var(--p-highlight-background, rgba(127, 127, 127, 0.12));
      }
      &:focus-visible {
        outline: 2px solid var(--p-primary-color);
        outline-offset: 2px;
      }
    }
  `,
})
export class LoadState {
  readonly loading = input.required<boolean>();
  readonly error = input.required<string | null>();
  readonly retry = output<void>();
}
