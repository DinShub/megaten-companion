import type { GameDefinition } from './game.model';
import { p5rGame } from './p5r/p5r.game';

/**
 * The single composition point that names the shipped games (§9.2). This is the
 * *only* file outside `games/<id>/` that imports a concrete game — the seam's
 * intentional exception. Everything else routes through {@link GameDefinition}.
 */
export const GAMES: readonly GameDefinition[] = [p5rGame];

/** v1 ships one game; `/` redirects here. */
export const DEFAULT_GAME_ID = p5rGame.id;

export function getGame(id: string | null | undefined): GameDefinition | undefined {
  return GAMES.find((game) => game.id === id);
}
