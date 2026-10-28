import { DEFAULT_GAME_ID, getGame } from '../games/game.registry';
import { AppPreset, gamePreset, THEME_OPTIONS } from './app-preset';

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** Read the primary ramp off a preset produced by `definePreset`. */
function primaryOf(preset: unknown): Record<number, string> {
  return (preset as { semantic: { primary: Record<number, string> } }).semantic.primary;
}

describe('app theme preset', () => {
  it('points a game preset at the named primitive colour ramp', () => {
    const primary = primaryOf(gamePreset('blue'));
    for (const shade of SHADES) {
      expect(primary[shade]).toBe(`{blue.${shade}}`);
    }
  });

  it('builds a distinct ramp per colour', () => {
    expect(primaryOf(gamePreset('red'))[500]).toBe('{red.500}');
    expect(primaryOf(gamePreset('blue'))[500]).toBe('{blue.500}');
  });

  it('defines the app-only ember ramp next to Lara’s primitives', () => {
    const preset = gamePreset('ember') as { primitive: Record<string, Record<number, string>> };
    expect(primaryOf(preset)[400]).toBe('{ember.400}');
    for (const shade of SHADES) {
      expect(preset.primitive['ember'][shade]).toMatch(/^#[0-9a-f]{6}$/);
    }
    // Lara's own ramps survive the merge.
    expect(preset.primitive['red'][500]).toBe('#ef4444');
  });

  it('bakes the default game’s colour into the bootstrap preset', () => {
    const defaultColor = getGame(DEFAULT_GAME_ID)!.theme.primary;
    expect(primaryOf(AppPreset)[500]).toBe(`{${defaultColor}.500}`);
  });

  it('shares the dark-mode selector with the shell class on <html>', () => {
    expect(THEME_OPTIONS.darkModeSelector).toBe('.app-dark');
  });
});
