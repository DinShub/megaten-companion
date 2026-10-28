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
  // A CRT: near-black warmed toward the ember phosphor, text in warm off-white.
  comp: {
    surface: {
      0: '#fff7ef',
      50: '#fbefe3',
      100: '#f1e0cf',
      200: '#dcc6b0',
      300: '#bea58c',
      400: '#988069',
      500: '#6f5a48',
      600: '#4c3c30',
      700: '#33271f',
      800: '#21170f',
      900: '#120b07',
      950: '#0a0604',
    },
    radius: SQUARE,
  },
};
