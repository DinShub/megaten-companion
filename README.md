# Megaten Companion

Angular 22 + [PrimeNG](https://primeng.dev) 22, themed with the **Lara** preset on a purple
primary ramp, dark mode on by default.

## Getting started

```bash
npm install
npm start
```

Then open `http://localhost:4200/`.

## PrimeUI licence key

PrimeNG 22 is closed-source and verifies a [PrimeUI](https://primeui.dev/pricing) licence key at
startup; without a valid one it paints a watermark over the app. A free **Community** licence covers
individuals, students, non-profits and non-commercial open source.

Keys are per-developer and must not be redistributed, so the key lives in a gitignored file:

| File                                 | Tracked? | Purpose                        |
| ------------------------------------ | -------- | ------------------------------ |
| `src/environments/license.ts`        | no       | your real key                  |
| `src/environments/license.example.ts` | yes     | empty template, safe to commit |

`npm install` runs `scripts/ensure-license.mjs`, which copies the template to `license.ts` when it
is missing — so a fresh clone compiles immediately. Paste your key into that copy:

```ts
export const PRIMEUI_LICENSE_KEY = 'your-key-here';
```

A key is tied to a major version — a PrimeNG 22 key will not work on 21.

## Theming

`src/app/theme/lara-purple.ts` derives the theme from Lara, overriding only the primary ramp:

```ts
export const LaraPurple = definePreset(Lara, {
  semantic: { primary: { 50: '{purple.50}', /* … */ 950: '{purple.950}' } },
});
```

Everything Lara derives from that ramp (`primary.color`, hover/active states, contrast text) follows
automatically. To try another accent, swap `purple` for any primitive in the preset — `violet`,
`fuchsia`, `indigo`, `teal`, and so on.

### Dark mode

`app.config.ts` sets `darkModeSelector: '.app-dark'`, and `src/index.html` ships that class on
`<html>` so the first paint is already dark — no flash. `App#toggleDark` flips the class; the theme
swaps every `--p-*` token via CSS `light-dark()`.

Don't set an inline `color-scheme` on `<html>`: it outranks the theme's rule and pins the page dark.

To follow the OS setting instead, use `darkModeSelector: 'system'` and drop the class from
`index.html`.

## Commands

| Command                | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `npm start`            | dev server with live reload                    |
| `npm run build`        | production build into `dist/`                  |
| `npm test`             | unit tests ([Vitest](https://vitest.dev/))     |
| `ng generate component <name>` | scaffold a component (`ng generate --help` for more) |

For full CLI documentation see the
[Angular CLI reference](https://angular.dev/tools/cli).
