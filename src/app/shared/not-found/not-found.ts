import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

/** Catch-all 404 (task 15). Game-agnostic; `/` redirects to the default game. */
@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonModule],
  template: `
    <section class="not-found">
      <p class="not-found__code">404</p>
      <h1 class="not-found__title">Page not found</h1>
      <p class="not-found__blurb">That route doesn't exist. Let's get you back on track.</p>
      <p-button routerLink="/" label="Go home" icon="pi pi-home" />
    </section>
  `,
  styles: `
    .not-found {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-height: 60vh;
      padding: 2rem 1rem;
      text-align: center;
    }
    .not-found__code {
      margin: 0;
      font-size: 3.5rem;
      font-weight: 800;
      line-height: 1;
      color: var(--p-primary-color);
    }
    .not-found__title {
      margin: 0;
      font-size: 1.5rem;
    }
    .not-found__blurb {
      margin: 0 0 1rem;
      color: var(--p-text-muted-color);
    }
  `,
})
export class NotFound {}
