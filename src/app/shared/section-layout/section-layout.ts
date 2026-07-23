import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/**
 * One tab in a section's in-page sub-navigation.
 * `path` is relative to the section's own route (`''` is the section's index).
 */
export interface SectionTab {
  readonly label: string;
  /** Child route path under the section, or `''` for the section index page. */
  readonly path: string;
}

/**
 * A routed layout that renders a section's sub-pages as an on-page tab strip
 * above its `<router-outlet>` — instead of a top-nav dropdown (§10, ISSUES.md).
 *
 * Game-agnostic: the tabs come from the section route's `data.sections`, and the
 * links are built from the section's own resolved URL segments, so the same
 * component serves any game's multi-page feature (Shadows, Fusion, …).
 */
@Component({
  selector: 'app-section-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    @if (tabs().length > 1) {
      <nav class="section-tabs" aria-label="Section">
        @for (tab of tabs(); track tab.path) {
          <a
            class="section-tabs__tab"
            [routerLink]="linkTo(tab.path)"
            routerLinkActive="is-active"
            [routerLinkActiveOptions]="{ exact: tab.path === '' }"
          >
            {{ tab.label }}
          </a>
        }
      </nav>
    }

    <router-outlet />
  `,
  styles: `
    .section-tabs {
      display: flex;
      gap: 0.25rem;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid
        var(--app-border, var(--p-content-border-color, rgba(127, 127, 127, 0.25)));
      overflow-x: auto;
    }
    .section-tabs__tab {
      padding: 0.55rem 0.9rem;
      color: var(--p-text-muted-color);
      text-decoration: none;
      font-size: 0.95rem;
      white-space: nowrap;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;

      &:hover {
        color: var(--p-text-color);
      }
      &.is-active {
        color: var(--p-primary-color);
        border-bottom-color: var(--p-primary-color);
      }
    }
  `,
})
export class SectionLayout {
  private readonly route = inject(ActivatedRoute);

  private readonly data = toSignal(this.route.data, { initialValue: this.route.snapshot.data });

  /** The section's tab list, from the route's `data.sections`. */
  protected readonly tabs = computed<readonly SectionTab[]>(
    () => (this.data()['sections'] as SectionTab[] | undefined) ?? [],
  );

  /**
   * Absolute link to a child of this section. Built from the section route's own
   * resolved URL segments (e.g. `['p5r', 'shadows']`), so it never names a game.
   */
  private readonly base = this.route.snapshot.pathFromRoot.flatMap((r) =>
    r.url.map((segment) => segment.path),
  );

  protected linkTo(path: string): unknown[] {
    return path ? ['/', ...this.base, path] : ['/', ...this.base];
  }
}
