/**
 * The Guidebook's press run: the one orchestrated moment, played on the first
 * page of a visit. The sheet (`.app-main`) is set down on the desk, the blue
 * plate (every `.g1-plate`, moved together through `--g1-mx/--g1-my/--g1-mr`)
 * prints out of register and is pulled into line in two jolts, then the
 * halftone inks in (`--g1-ink-in`). Any click or key skips to the end state;
 * reduced motion shows only that. DOM-only, no Angular.
 */
const SESSION_KEY = 'g1-pressed';

export function playPressRun(doc: Document = document): () => void {
  const root = doc.documentElement;
  const sheet = doc.querySelector<HTMLElement>('.app-main');
  const win = doc.defaultView;
  const still = win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;

  let first = true;
  try {
    first = !win?.sessionStorage.getItem(SESSION_KEY);
    win?.sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* storage blocked: play it */
  }

  const set = (x: number, y: number, r: number, ink?: number): void => {
    root.style.setProperty('--g1-mx', `${x}px`);
    root.style.setProperty('--g1-my', `${y}px`);
    root.style.setProperty('--g1-mr', `${r}deg`);
    if (ink !== undefined) root.style.setProperty('--g1-ink-in', String(ink));
  };

  const timers: ReturnType<typeof setTimeout>[] = [];
  let done = false;
  const end = (): void => {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    set(0, 0, 0, 1);
    sheet?.classList.remove('g1-lifted');
    timers.push(setTimeout(() => {
      root.classList.remove('g1-press-jolt', 'g1-press-ink');
      sheet?.classList.remove('g1-landing');
    }, 450));
    doc.removeEventListener('pointerdown', end);
    doc.removeEventListener('keydown', end);
  };

  if (still || !first || !sheet || !win) {
    end();
    return end;
  }

  const at = (ms: number, fn: () => void): void => {
    timers.push(setTimeout(fn, ms));
  };
  set(8, -5, 0.25, 0);
  sheet.classList.add('g1-lifted');
  win.requestAnimationFrame(() =>
    win.requestAnimationFrame(() => {
      sheet.classList.add('g1-landing');
      sheet.classList.remove('g1-lifted');
    }),
  );
  at(380, () => {
    root.classList.add('g1-press-jolt');
    set(3, -2, 0.08);
  });
  at(640, () => set(0, 0, 0));
  at(820, () => {
    root.classList.add('g1-press-ink');
    root.style.setProperty('--g1-ink-in', '1');
  });
  at(1300, end);
  doc.addEventListener('pointerdown', end, { once: true });
  doc.addEventListener('keydown', end, { once: true });
  return end;
}
