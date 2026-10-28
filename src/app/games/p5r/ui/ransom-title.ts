import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type TileStyle = 'paper' | 'ink' | 'accent' | 'cut';

interface Tile {
  readonly ch: string;
  readonly style: TileStyle;
  readonly rot: string;
  readonly lift: string;
}

const STYLES: readonly TileStyle[] = ['paper', 'accent', 'ink', 'cut'];

/**
 * A page title set as a ransom note — each letter cut from a different "page":
 * paper, ink, accent, or an italic clipping (the Calling Card skin's signature).
 *
 * The cut is deterministic: a small seeded generator keyed on the text picks each
 * tile's look, tilt and lift, so a title looks the same on every visit and never
 * repeats a look on neighbouring letters. The heading's accessible name is the
 * plain text (`aria-label`); the tiles themselves are hidden from assistive tech.
 */
@Component({
  selector: 'app-ransom-title',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="ransom" [attr.aria-label]="text()">
      @for (word of words(); track $index; let last = $last) {
        <span class="ransom__word">
          @for (t of word; track $index) {
            <span
              [class]="'ransom__t ransom__t--' + t.style"
              [style.--r]="t.rot"
              [style.--y]="t.lift"
              aria-hidden="true"
              >{{ t.ch }}</span
            >
          }
        </span>
        @if (!last) {
          <span class="ransom__gap" aria-hidden="true">{{ ' ' }}</span>
        }
      }
    </h1>
  `,
  styles: `
    :host { display: block; }
    .ransom {
      display: flex; flex-wrap: wrap; align-items: center; gap: 0.1em 0;
      margin: 0; font-size: clamp(1.5rem, 7.5vw, 2.8rem); font-weight: 400; line-height: 1;
    }
    /* A word never breaks across lines; only the gaps between words do. */
    .ransom__word { display: inline-flex; gap: 0.04em; white-space: nowrap; }
    .ransom__gap { width: 0.3em; }
    .ransom__t {
      display: inline-block; padding: 0.06em 0.12em 0.1em;
      font-family: var(--app-font-display); font-weight: 400;
      transform: rotate(var(--r, 0deg)) translateY(var(--y, 0));
      &--paper { background: #fff; color: #000; }
      &--accent { background: var(--cc-accent, var(--p-primary-color)); color: #000; }
      &--ink { background: #000; color: #fff; outline: max(1.5px, 0.05em) solid #fff; outline-offset: -0.13em; }
      &--cut { background: #fff; color: var(--cc-accent-deep, #b91c1c); font-family: var(--app-font-body); font-weight: 800; font-style: italic; }
    }
  `,
})
export class RansomTitle {
  readonly text = input.required<string>();

  /** The tiles, grouped by word so a word never wraps part-way. */
  protected readonly words = computed<Tile[][]>(() => {
    const text = this.text();
    let seed = 0;
    for (const ch of text) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
    // Park–Miller: tiny, seeded, and good enough to look hand-cut.
    const next = () => (seed = Math.abs((Math.imul(seed || 1, 48271) | 0) % 2147483647)) / 2147483647;

    let prev = -1;
    return text.split(' ').map((word) =>
      [...word].map((ch) => {
        let pick = Math.floor(next() * STYLES.length);
        if (pick === prev) pick = (pick + 1) % STYLES.length;
        prev = pick;
        const rot = `${Math.round((next() - 0.5) * 12)}deg`;
        const lift = `${((next() - 0.5) * 0.12).toFixed(2)}em`;
        return { ch, style: STYLES[pick], rot, lift };
      }),
    );
  });
}
