import { definePreset, type PaletteDesignToken, type Preset } from '@primeuix/themes';
import base from '@primeuix/themes/lara/base';
import button from '@primeuix/themes/lara/button';
import card from '@primeuix/themes/lara/card';
import inputnumber from '@primeuix/themes/lara/inputnumber';
import inputtext from '@primeuix/themes/lara/inputtext';
import ripple from '@primeuix/themes/lara/ripple';
import selectbutton from '@primeuix/themes/lara/selectbutton';
import togglebutton from '@primeuix/themes/lara/togglebutton';
import toggleswitch from '@primeuix/themes/lara/toggleswitch';

import type { PrimaryColor } from '../games/game.model';
import { DEFAULT_GAME_ID, getGame } from '../games/game.registry';

/**
 * Lara, reduced to the component token sets the app actually renders, with a
 * primary ramp driven by the active game (§4.8).
 *
 * Only the used component modules are pulled in rather than `@primeuix/themes/
 * lara`'s all-~90-component barrel (task 58, §8.5 budget). That barrel statically
 * imports every component module — ~114 kB into the eager bundle the shell works
 * to keep under 500 kB — even though the whole app uses just Button, Card,
 * InputNumber, SelectButton and ToggleSwitch (plus the tokens those compose from:
 * InputText, ToggleButton, Ripple). `base` stays: it defines the primitive +
 * semantic `--p-*` variables the shell and global styles read for their colours,
 * borders and light/dark surfaces — including every primitive colour ramp the
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
    selectbutton,
    togglebutton,
    toggleswitch,
  },
};

/** PrimeNG theme options; shared by bootstrap and the runtime game switch so the
 * dark-mode selector stays consistent. Must match the class on `<html>`. */
export const THEME_OPTIONS = { darkModeSelector: '.app-dark' } as const;

/**
 * App-defined primitive ramps, merged alongside Lara's. `ember` is a burnt, dark
 * orange: Lara's own `orange` sits at #fb923c in dark mode (its `primary.color`
 * is shade 400 there), which reads as bright tangerine, so this ramp shifts every
 * stop roughly one shade darker and a touch redder. Both modes stay legible —
 * 400 on the dark surface and 500 on white each clear AA for large text.
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

/** The theme preset for a game, its primary ramp swapped to the game's colour. */
export function gamePreset(color: PrimaryColor): Preset {
  return definePreset(laraSubset, {
    primitive: APP_PRIMITIVES,
    semantic: { primary: primaryPalette(color) },
  });
}

/**
 * The bootstrap preset. Its primary is baked from the default game's colour so
 * the very first paint already shows the right accent; the shell then swaps it on
 * every game change via `PrimeNG.setThemeConfig` (see App).
 */
export const AppPreset = gamePreset(getGame(DEFAULT_GAME_ID)?.theme.primary ?? 'purple');
