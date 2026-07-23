/**
 * Minimal ambient declarations so the fusion golden suite (`fusion/golden.spec.ts`)
 * can read the committed `public/data/p5r/*.json` datasets through Node at test
 * time. `@types/node` is intentionally *not* a project dependency — the app never
 * touches these APIs, and pulling in the full Node typings would widen the global
 * scope for no benefit. Only the handful of members the suite uses are declared.
 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string): string;
}

interface ImportMeta {
  readonly url: string;
}
