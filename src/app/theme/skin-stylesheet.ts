import type { GameSkin } from '../games/game.model';

/**
 * Skin stylesheets load on demand. Each skin builds to its own
 * `skin-<name>.css` (angular.json, `inject: false`), so none of them count
 * against the initial budget; this adds the active game's `<link>` the first time
 * it is needed and keeps it. Every skin scopes itself under
 * `:root[data-skin='<name>']`, so a loaded sheet for another game is inert.
 *
 * Resolves when the sheet has loaded or failed — or after `timeoutMs`, so a
 * slow or blocked sheet can never hold up bootstrap. Paths are relative, so a
 * base-href subpath deploy resolves.
 */
const pending = new Map<GameSkin, Promise<void>>();

export function ensureSkinStylesheet(skin: GameSkin, timeoutMs = 4000): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  const existing = pending.get(skin);
  if (existing) return existing;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `skin-${skin}.css`;
  link.dataset['skin'] = skin;
  const loaded = new Promise<void>((resolve) => {
    const done = (): void => resolve();
    link.addEventListener('load', done, { once: true });
    link.addEventListener('error', done, { once: true });
    setTimeout(done, timeoutMs);
  });
  document.head.appendChild(link);
  pending.set(skin, loaded);
  return loaded;
}
