import type { Event as RouterEvent } from '@angular/router';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart } from '@angular/router';

/**
 * The Guidebook's page turn between SMT1 routes. When a navigation inside the
 * game starts, the sheet (`.app-main`) is copied, exactly where it sits on
 * screen, into a fixed overlay; when the new page has rendered underneath, the
 * copy lifts off to the left with a slight tilt and is removed. The current
 * thumb tab slides from its old height to its new one (FLIP, Web Animations).
 *
 * Deliberately not the View Transitions API: the router's integration holds the
 * navigation until the browser runs its update callback, which a hidden tab
 * never does, so links stall. This only ever adds an overlay on top of a
 * navigation that proceeds as normal. Skipped under reduced motion, in a hidden
 * tab, and for navigations that leave the game. DOM-only, no Angular DI.
 */
const TURN_MS = 380;
const THUMB_MS = 340;
const SETTLE = 'cubic-bezier(0.2, 0.9, 0.25, 1)';

export function createPageTurn(doc: Document, gameId: string): (event: RouterEvent) => void {
  const win = doc.defaultView;
  let overlay: HTMLElement | null = null;
  let thumbTop: number | null = null;

  const inGame = (url: string): boolean => url.split(/[?#]/)[0].split('/').filter(Boolean)[0] === gameId;
  const still = (): boolean =>
    !win || doc.visibilityState !== 'visible' || win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const activeThumb = (): HTMLElement | null => doc.querySelector<HTMLElement>('.app-nav__link.is-active');

  const drop = (): void => {
    overlay?.remove();
    overlay = null;
    thumbTop = null;
  };

  return (event: RouterEvent): void => {
    if (event instanceof NavigationStart) {
      drop();
      const sheet = doc.querySelector<HTMLElement>('.app-main');
      if (!sheet || still() || !inGame(win!.location.pathname) || !inGame(event.url)) return;
      const rect = sheet.getBoundingClientRect();
      const copy = sheet.cloneNode(true) as HTMLElement;
      copy.classList.add('g1-turning');
      copy.removeAttribute('id');
      copy.setAttribute('aria-hidden', 'true');
      copy.inert = true;
      Object.assign(copy.style, {
        position: 'fixed',
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: '0',
        zIndex: '50',
        pointerEvents: 'none',
      });
      overlay = copy;
      thumbTop = activeThumb()?.getBoundingClientRect().top ?? null;
      return;
    }

    if (event instanceof NavigationCancel || event instanceof NavigationError) {
      drop();
      return;
    }

    if (event instanceof NavigationEnd && overlay) {
      const copy = overlay;
      const fromTop = thumbTop;
      overlay = null;
      thumbTop = null;
      doc.body.appendChild(copy);
      // The copy covers the swap, so the turn can start at once; a timer (not a
      // frame callback, which a background page never runs) lets the new page
      // render underneath first. The copy is removed on a timer too, whatever
      // happens to the animation.
      win!.setTimeout(() => {
        copy.animate(
          [
            { transform: 'none', opacity: 1, transformOrigin: '0 100%' },
            { transform: 'translate(-45px, -6px) rotate(-1.6deg)', opacity: 0, transformOrigin: '0 100%' },
          ],
          { duration: TURN_MS, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' },
        );
        const thumb = activeThumb();
        const toTop = thumb?.getBoundingClientRect().top;
        if (thumb && fromTop !== null && toTop !== undefined && Math.abs(fromTop - toTop) > 1) {
          thumb.animate([{ translate: `0 ${fromTop - toTop}px` }, { translate: '0 0' }], { duration: THUMB_MS, easing: SETTLE });
        }
      }, 0);
      win!.setTimeout(() => copy.remove(), TURN_MS + 120);
    }
  };
}
