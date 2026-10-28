import type { GameTheme, PrimaryColor } from '../games/game.model';
import { DEFAULT_GAME_ID, getGame } from '../games/game.registry';
import { AppPreset, bootTheme, gamePreset, THEME_OPTIONS } from './app-preset';
import { SKINS } from './skins';

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

interface PresetShape {
  primitive: Record<string, Record<string | number, string>>;
  semantic: { primary: Record<number, string>; surface: Record<number, string> };
}

const shape = (preset: unknown) => preset as PresetShape;
const theme = (primary: PrimaryColor, skin: GameTheme['skin'] = 'comp'): GameTheme => ({ primary, skin });

describe('app theme preset', () => {
  it('points a game preset at the named primitive colour ramp', () => {
    const primary = shape(gamePreset(theme('blue'))).semantic.primary;
    for (const shade of SHADES) {
      expect(primary[shade]).toBe(`{blue.${shade}}`);
    }
  });

  it('builds a distinct ramp per colour', () => {
    expect(shape(gamePreset(theme('red'))).semantic.primary[500]).toBe('{red.500}');
    expect(shape(gamePreset(theme('blue'))).semantic.primary[500]).toBe('{blue.500}');
  });

  it('defines the app-only ember ramp next to Lara’s primitives', () => {
    const preset = shape(gamePreset(theme('ember')));
    expect(preset.semantic.primary[400]).toBe('{ember.400}');
    for (const shade of SHADES) {
      expect(preset.primitive['ember'][shade]).toMatch(/^#[0-9a-f]{6}$/);
    }
    // Lara's own ramps survive the merge.
    expect(preset.primitive['red'][500]).toBe('#ef4444');
  });

  it('swaps in the skin’s surfaces and corner radii', () => {
    for (const skin of ['comp', 'calling-card'] as const) {
      const preset = shape(gamePreset(theme('red', skin)));
      expect(preset.semantic.surface[900]).toBe(SKINS[skin].surface[900]);
      expect(preset.primitive['borderRadius']['md']).toBe(SKINS[skin].radius.md);
    }
    expect(shape(gamePreset(theme('red', 'comp'))).semantic.surface[900]).not.toBe(
      shape(gamePreset(theme('red', 'calling-card'))).semantic.surface[900],
    );
  });

  it('boots into the default game’s theme when the URL names no game', () => {
    const defaultTheme = getGame(DEFAULT_GAME_ID)!.theme;
    expect(bootTheme()).toEqual(defaultTheme);
    expect(shape(AppPreset).semantic.primary[500]).toBe(`{${defaultTheme.primary}.500}`);
  });

  it('shares the dark-mode selector with the shell class on <html>', () => {
    expect(THEME_OPTIONS.darkModeSelector).toBe('.app-dark');
  });
});
