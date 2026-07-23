import { definePreset } from '@primeuix/themes';
import base from '@primeuix/themes/lara/base';
import button from '@primeuix/themes/lara/button';
import card from '@primeuix/themes/lara/card';
import inputnumber from '@primeuix/themes/lara/inputnumber';
import inputtext from '@primeuix/themes/lara/inputtext';
import ripple from '@primeuix/themes/lara/ripple';
import selectbutton from '@primeuix/themes/lara/selectbutton';
import togglebutton from '@primeuix/themes/lara/togglebutton';
import toggleswitch from '@primeuix/themes/lara/toggleswitch';

/**
 * Lara with its primary ramp swapped from the stock emerald to purple.
 *
 * `{purple.*}` resolves against the preset's own primitive palette, and
 * `definePreset` merges deeply, so the derived semantic tokens Lara builds on
 * top of the ramp (`primary.color`, `hoverColor`, `contrastColor`, ...) keep
 * working untouched — including their `light-dark()` wrappers.
 *
 * Only the component token sets the app actually renders are pulled in, rather
 * than `@primeuix/themes/lara`'s all-~90-component barrel (task 58, §8.5 budget).
 * That barrel statically imports every component module — ~114 kB into the eager
 * bundle the shell works to keep under 500 kB — even though the whole app uses
 * just Button, Card, InputNumber, SelectButton and ToggleSwitch (plus the tokens
 * those compose from: InputText, ToggleButton, Ripple). `base` stays: it defines
 * the primitive + semantic `--p-*` variables the shell and global styles read for
 * their colours, borders and light/dark surfaces. Adding a PrimeNG component to a
 * page means adding its module here.
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

export const LaraPurple = definePreset(laraSubset, {
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
