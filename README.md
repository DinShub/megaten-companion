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

## Games

| Game                              | Route    | Code               | Data                 |
| --------------------------------- | -------- | ------------------ | -------------------- |
| Persona 5 Royal                   | `/p5r`   | `src/app/games/p5r`  | `public/data/p5r/`   |
| Shin Megami Tensei III: Nocturne  | `/smt3`  | `src/app/games/smt3` | `public/data/smt3/`  |

Each game is a self-contained folder registered in `src/app/games/game.registry.ts`; the shell,
routing and shared components read only the `GameDefinition` seam. The header's game switcher
appears because more than one game is registered.

Each game's Compendium page exports and imports that one compendium (merge or replace). Each
Settings page also offers a **whole-app backup**: one JSON file holding every game's compendium and
settings, restored in one step (validated whole, rolled back if a write fails, then the app reloads).
A game lists what it persists in `GameDefinition.storedData` (`games/<id>/<id>.storage.ts`), so a new
game is backed up as soon as it declares its keys.

The Nocturne companion covers all 195 demons (stats, affinities, ailment resistances, body-type
inheritance, learn-sets, evolutions, field encounter data), 326 skills, the 25 magatama, a fusion
calculator (forward and reverse: normal, same-race → Element, Element rank shifts, Element pairs →
Mitama, special recipes, Deathstone Fiends), a skill-aware route finder over your compendium and
optional field recruits, the race and element charts, a compendium with export/import, and its own
settings (Demi-fiend level cap, unlock groups).

## Game data

`public/data/p5r/` holds the committed P5R datasets — personas, skills, traits, shadows, the fusion
and element charts, advanced recipes, and the inheritance matrix. `public/data/smt3/` holds
Nocturne's demons, skills, magatama, fusion/element charts and special recipes. They are static
assets fetched at runtime, not bundled, so they stay out of the initial-bundle budget and cache
independently of app code. **A fresh clone needs no network access to produce them.**

`meta.json` records the pinned upstream commit, per-dataset entry counts and source URLs, and the
import decisions that the data cannot explain for itself.

Data is converted from [aqiu384/megaten-fusion-tool](https://github.com/aqiu384/megaten-fusion-tool)
(the Unlicense — public domain). The underlying game facts are Atlus/Sega's. This is a
non-commercial fan tool shipping no game assets.

### Re-importing

The importer lives in `scripts/import/` and is **untracked developer tooling** — one-off, run by
hand, and not part of `npm install`, `npm start`, or `npm run build`. If you have it:

```bash
node scripts/import/import.mjs --dry-run   # list the upstream inventory
node scripts/import/import.mjs             # fetch, convert, validate, write
node --test "scripts/import/test/*.test.mjs"

node scripts/import/smt3/import.mjs        # Nocturne: same upstream, same pinned commit
node --test scripts/import/smt3/test/smt3.test.mjs
```

`node scripts/validate-data.mjs` (run in CI) re-checks both games' committed datasets without the
importer.

Upstream is pinned by SHA in `scripts/import/sources.mjs`; fetched files are cached under
`scripts/import/.cache/` so re-runs are offline. Every run re-checks referential integrity and
aborts rather than writing bad data, and two runs over the same commit produce byte-identical output.

## Commands

| Command                | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `npm start`            | dev server with live reload                    |
| `npm run build`        | production build into `dist/`                  |
| `npm test`             | unit tests ([Vitest](https://vitest.dev/))     |
| `ng generate component <name>` | scaffold a component (`ng generate --help` for more) |

For full CLI documentation see the
[Angular CLI reference](https://angular.dev/tools/cli).
