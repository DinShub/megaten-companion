import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

/**
 * Temporary landing for every feature route wired up in Phase 2 (task 15).
 * Each nav destination resolves here, lazily, until Phases 3–6 replace the
 * route with its real page. Title and blurb come from the route's `data`.
 */
interface PlaceholderData {
  readonly title?: string;
  readonly blurb?: string;
  readonly phase?: string;
}

@Component({
  selector: 'app-placeholder-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="placeholder">
      <i class="pi pi-compass placeholder__icon" aria-hidden="true"></i>
      <h1 class="placeholder__title">{{ data().title ?? 'Coming soon' }}</h1>
      @if (data().blurb) {
        <p class="placeholder__blurb">{{ data().blurb }}</p>
      }
      <p class="placeholder__note">
        This page is a placeholder from the app foundation.
        @if (data().phase) {
          <span>It arrives in {{ data().phase }}.</span>
        }
      </p>
    </section>
  `,
  styles: `
    .placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-height: 50vh;
      padding: 2rem 1rem;
      text-align: center;
    }
    .placeholder__icon {
      font-size: 2.5rem;
      color: var(--p-primary-color);
      margin-bottom: 0.5rem;
    }
    .placeholder__title {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
    }
    .placeholder__blurb {
      margin: 0;
      max-width: 34rem;
      color: var(--p-text-color);
    }
    .placeholder__note {
      margin: 0.25rem 0 0;
      color: var(--p-text-muted-color);
      font-size: 0.9rem;
    }
  `,
})
export class PlaceholderPage {
  private readonly route = inject(ActivatedRoute);
  private readonly routeData = toSignal(this.route.data, { initialValue: {} });
  protected readonly data = computed<PlaceholderData>(() => this.routeData() as PlaceholderData);
}
