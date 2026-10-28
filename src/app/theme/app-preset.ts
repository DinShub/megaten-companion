import { definePreset, type PaletteDesignToken, type Preset } from '@primeuix/themes';
import base from '@primeuix/themes/lara/base';
import button from '@primeuix/themes/lara/button';
import card from '@primeuix/themes/lara/card';
import inputnumber from '@primeuix/themes/lara/inputnumber';
import inputtext from '@primeuix/themes/lara/inputtext';
import ripple from '@primeuix/themes/lara/ripple';
import toggleswitch from '@primeuix/themes/lara/toggleswitch';

import type { GameTheme, PrimaryColor } from '../games/game.model';
import { DEFAULT_GAME_ID, GAMES, getGame } from '../games/game.registry';
import { SKINS } from './skins';

/**
 * Lara, reduced to the component token sets the app actually renders, with a
 * primary ramp driven by the active game (§4.8).
 *
 * Only the used component modules are pulled in rather than `@primeuix/themes/
 * lara`'s all-~90-component barrel (task 58, §8.5 budget). That barrel statically
 * imports every component module — ~114 kB into the eager bundle the shell works
 * to keep under 500 kB — even though the whole app uses just Button, Card,
 * InputNumber and ToggleSwitch (plus the tokens those compose from: InputText,
 * Ripple). `base` stays: it defines the primitive + semantic `--p-*` variables
 * the shell and global styles read for their colours, borders and surfaces —
 * including every primitive colour ramp the
 * per-game primary references below resolve against. Adding a PrimeNG component
 * to a page means adding its module here.
 */
const laraSubset = {
  ...base,
  components: {
    button,
    card,
    inputnumber,
    inputtext,
    ripple,
    toggleswitch,
  },
};

/** PrimeNG theme options; shared by bootstrap and the runtime game switch so the
 * dark-mode selector stays consistent. Must match the class on `<html>`, which
 * index.html ships permanently — the app is dark-only. */
export const THEME_OPTIONS = { darkModeSelector: '.app-dark' } as const;

/**
 * App-defined primitive ramps, merged alongside Lara's. `ember` is a burnt, dark
 * orange: Lara's own `orange` sits at #fb923c in dark mode (its `primary.color`
 * is shade 400 there), which reads as bright tangerine, so this ramp shifts every
 * stop roughly one shade darker and a touch redder.
 */
const APP_PRIMITIVES = {
  ember: {
    50: '#fff4ec',
    100: '#ffe2cc',
    200: '#fec398',
    300: '#f99a5b',
    400: '#ef7223',
    500: '#d4560b',
    600: '#b2440a',
    700: '#8f360c',
    800: '#752d0f',
    900: '#60270f',
    950: '#361105',
  },
} as const;

/**
 * A primary ramp that references a primitive colour, e.g. `red` →
 * `{ 50: '{red.50}', … 950: '{red.950}' }`. `definePreset` merges deeply, so
 * Lara's derived semantic tokens (`primary.color`, `hoverColor`, … and their
 * `light-dark()` wrappers) keep working on top of the swapped ramp.
 */
function primaryPalette(color: PrimaryColor): PaletteDesignToken {
  return {
    50: `{${color}.50}`,
    100: `{${color}.100}`,
    200: `{${color}.200}`,
    300: `{${color}.300}`,
    400: `{${color}.400}`,
    500: `{${color}.500}`,
    600: `{${color}.600}`,
    700: `{${color}.700}`,
    800: `{${color}.800}`,
    900: `{${color}.900}`,
    950: `{${color}.950}`,
  };
}

/**
 * The theme preset for a game: its primary ramp swapped to the game's colour, and
 * its skin's surfaces and corner radii in place of Lara's. The surface ramp is a
 * plain value rather than Lara's `light-dark()` pair because the app is dark-only.
 */
export function gamePreset(theme: GameTheme): Preset {
  const skin = SKINS[theme.skin];
  return definePreset(laraSubset, {
    primitive: { ...APP_PRIMITIVES, borderRadius: skin.radius },
    semantic: { primary: primaryPalette(theme.primary), surface: skin.surface },
  });
}

/**
 * The theme of the game the app is booting into, read from the address bar
 * (relative to the base href, so a subpath deploy resolves) before the router has
 * run. A bare `/` or unknown path falls back to the default game; the shell
 * corrects it on the first `NavigationEnd` if the router redirects elsewhere.
 */
export function bootTheme(): GameTheme {
  let id: string | undefined;
  if (typeof document !== 'undefined') {
    const base = new URL(document.baseURI).pathname;
    const path = location.pathname.startsWith(base)
      ? location.pathname.slice(base.length)
      : location.pathname;
    id = path.split('/').filter(Boolean)[0];
  }
  return (getGame(id ?? '') ?? getGame(DEFAULT_GAME_ID) ?? GAMES[0]).theme;
}

/**
 * The bootstrap preset, baked from the booting game's theme so the very first
 * paint already shows the right accent and skin; the shell then swaps it on every
 * game change via `PrimeNG.setThemeConfig` (see App).
 */
export const AppPreset = gamePreset(bootTheme());
