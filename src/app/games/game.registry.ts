import type { GameDefinition } from './game.model';
import { p3rGame } from './p3r/p3r.game';
import { p4gGame } from './p4g/p4g.game';
import { p5rGame } from './p5r/p5r.game';
import { smt3Game } from './smt3/smt3.game';

/**
 * The single composition point that names the shipped games (§9.2). This is the
 * *only* file outside `games/<id>/` that imports a concrete game — the seam's
 * intentional exception. Everything else routes through {@link GameDefinition}.
 */
export const GAMES: readonly GameDefinition[] = [p5rGame, p4gGame, p3rGame, smt3Game];

/** `/` redirects here. */
export const DEFAULT_GAME_ID = p5rGame.id;

export function getGame(id: string | null | undefined): GameDefinition | undefined {
  return GAMES.find((game) => game.id === id);
}
