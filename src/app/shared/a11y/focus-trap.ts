import {
  booleanAttribute,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';

/** Tabbable elements inside a trap. `[tabindex="-1"]` is programmatic-only. */
const FOCUSABLE =
  'a[href],area[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible focus management for dialogs and drawers (task 57 / §10). Applied to
 * the element that contains the overlay's focusable controls:
 *
 *  - on arm, records the currently-focused element and moves focus to the first
 *    control inside (so keyboard and screen-reader users land in the overlay);
 *  - traps Tab / Shift+Tab so focus can't escape to the page behind;
 *  - emits `escape` on the Escape key;
 *  - on disarm (input flips false, or the host is destroyed) restores focus to
 *    the element that had it when the overlay opened.
 *
 * For an `@if`-gated overlay, bind the literal `true` (armed for its whole life,
 * restore happens on destroy). For an always-rendered element like the mobile
 * drawer, bind the open signal — and pair it with `[attr.inert]="!open()"` so the
 * closed overlay is neither tabbable nor exposed to assistive tech.
 *
 * Deliberately hand-rolled rather than pulling `@angular/cdk/a11y`: the drawer
 * lives in the always-loaded shell, and the shell stays dependency-light to hold
 * the initial-bundle budget (§8.5) — the same reason the virtual list is bespoke.
 */
@Directive({ selector: '[appFocusTrap]' })
export class FocusTrap {
  /**
   * Arms the trap. `booleanAttribute` coercion means the bare `appFocusTrap`
   * attribute reads as `true` (the `@if`-gated-overlay case), while
   * `[appFocusTrap]="open()"` binds a signal (the always-rendered drawer).
   */
  readonly active = input(true, { alias: 'appFocusTrap', transform: booleanAttribute });
  readonly escape = output<void>();

  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private previous: HTMLElement | null = null;
  private armed = false;

  constructor() {
    effect(() => (this.active() ? this.arm() : this.disarm()));
    inject(DestroyRef).onDestroy(() => this.disarm());
  }

  private arm(): void {
    if (this.armed || typeof document === 'undefined') return;
    this.armed = true;
    this.previous = document.activeElement as HTMLElement | null;
    this.host.nativeElement.addEventListener('keydown', this.onKeydown, true);
    // Defer so the overlay's view (and any `inert` removal) has settled first.
    queueMicrotask(() => {
      if (this.armed) (this.focusables()[0] ?? this.host.nativeElement).focus();
    });
  }

  private disarm(): void {
    if (!this.armed) return;
    this.armed = false;
    this.host.nativeElement.removeEventListener('keydown', this.onKeydown, true);
    const prev = this.previous;
    this.previous = null;
    if (prev && typeof prev.focus === 'function') queueMicrotask(() => prev.focus());
  }

  private focusables(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
  }

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.escape.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = this.focusables();
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const el = this.host.nativeElement;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !el.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };
}
