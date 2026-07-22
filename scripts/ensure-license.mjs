/**
 * Creates the gitignored `src/environments/license.ts` from the committed
 * template when it is missing, so a fresh clone compiles straight after
 * `npm install` instead of failing on an unresolved import.
 *
 * Runs as a postinstall hook; never overwrites an existing key.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'src/environments/license.ts');
const template = resolve(root, 'src/environments/license.example.ts');

if (existsSync(target) || !existsSync(template)) {
  process.exit(0);
}

copyFileSync(template, target);
console.log(
  'Created src/environments/license.ts — add your PrimeUI key (https://primeui.dev/pricing).',
);
