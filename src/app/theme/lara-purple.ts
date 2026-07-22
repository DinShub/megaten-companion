import { definePreset } from '@primeuix/themes';
import Lara from '@primeuix/themes/lara';

/**
 * Lara with its primary ramp swapped from the stock emerald to purple.
 *
 * `{purple.*}` resolves against the preset's own primitive palette, and
 * `definePreset` merges deeply, so the derived semantic tokens Lara builds on
 * top of the ramp (`primary.color`, `hoverColor`, `contrastColor`, ...) keep
 * working untouched — including their `light-dark()` wrappers.
 */
export const LaraPurple = definePreset(Lara, {
  semantic: {
    primary: {
      50: '{purple.50}',
      100: '{purple.100}',
      200: '{purple.200}',
      300: '{purple.300}',
      400: '{purple.400}',
      500: '{purple.500}',
      600: '{purple.600}',
      700: '{purple.700}',
      800: '{purple.800}',
      900: '{purple.900}',
      950: '{purple.950}',
    },
  },
});
