import type { GameSkin } from '../games/game.model';

type Shade = 0 | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;

/**
 * The PrimeNG-facing half of a skin: the tokens the preset swaps when the skin
 * becomes active. Everything else a skin does (typefaces, panel shapes, nav,
 * motion) lives in its `src/styles/skins/_<skin>.scss` partial, scoped under
 * `:root[data-skin='<skin>']`.
 *
 * The app is dark-only, so `surface` is a single ramp (no light/dark pair): 900
 * is the page, 800/700 the raised panels, 0–300 the text end.
 */
export interface SkinTokens {
  readonly surface: Readonly<Record<Shade, string>>;
  /** Lara's `borderRadius` primitive scale. */
  readonly radius: Readonly<Record<'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl', string>>;
}

const SQUARE = { none: '0', xs: '0', sm: '0', md: '0', lg: '0', xl: '0' } as const;

export const SKINS: Readonly<Record<GameSkin, SkinTokens>> = {
  // True black page, neutral greys: the accent and the white "paper" panels
  // carry all the colour.
  'calling-card': {
    surface: {
      0: '#ffffff',
      50: '#f7f7f7',
      100: '#ededed',
      200: '#dcdcdc',
      300: '#c2c2c2',
      400: '#9b9b9b',
      500: '#6f6f6f',
      600: '#4b4b4b',
      700: '#2f2f2f',
      800: '#1a1a1a',
      900: '#000000',
      950: '#000000',
    },
    radius: SQUARE,
  },
  // A CRT: near-black warmed toward the ember phosphor. Text (0) is pale
  // phosphor rather than white, muted text (400) a dim amber that still clears
  // AA on the 900 page, and 700 — Lara's border colour — a soft ember rule.
  comp: {
    surface: {
      0: '#fbd7be',
      50: '#f5ceb2',
      100: '#efc4a5',
      200: '#e3b18e',
      300: '#d69c74',
      400: '#c68860',
      500: '#96613f',
      600: '#6b4228',
      700: '#472b19',
      800: '#1d110b',
      900: '#130b07',
      950: '#0b0604',
    },
    radius: SQUARE,
  },
  // A dark room at midnight: violet-black surfaces lit by the TV. Text (0) is a
  // cool off-white, muted text (400) a lilac grey that clears AA on the 900 page,
  // and the radii are soft — pills and rounded screens, not cut paper or boxes.
  'midnight-channel': {
    surface: {
      0: '#efeaf5',
      50: '#e2dcea',
      100: '#d2cadd',
      200: '#bdb3cb',
      300: '#aaa0ba',
      400: '#968ba8',
      500: '#6f6582',
      600: '#4d445c',
      700: '#3a3048',
      800: '#1a1424',
      900: '#0e0a14',
      950: '#08060c',
    },
    radius: { none: '0', xs: '4px', sm: '6px', md: '10px', lg: '14px', xl: '20px' },
  },
  // Deep water: blue-black at the bottom of the page, lighter blues up toward
  // the surface. Text (0) is a cool white, muted text (300/400) a pale foam blue
  // that clears AA on the 900 page, and the radii are generous — glass panels
  // and a rounded white result card, nothing cut or boxed.
  abyss: {
    surface: {
      0: '#f4f8ff',
      50: '#e4eeff',
      100: '#cfe0fb',
      200: '#bcd2f5',
      300: '#a6bde8',
      400: '#8ea6d6',
      500: '#5f78b0',
      600: '#3a5290',
      700: '#26407c',
      800: '#0d2462',
      900: '#04103a',
      950: '#020a26',
    },
    radius: { none: '0', xs: '6px', sm: '10px', md: '16px', lg: '22px', xl: '28px' },
  },
};
