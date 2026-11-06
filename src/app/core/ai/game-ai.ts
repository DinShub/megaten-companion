import { InjectionToken, type Signal } from '@angular/core';

import type { AiTool } from './ai.model';

/**
 * What the shared chat needs from a game. Each game implements this in its own
 * lazy `ai/` folder and provides it from a thin chat page, so nothing shared names
 * a game and the game's tools stay out of the initial bundle.
 */
export interface GameAi {
  readonly gameId: string;
  readonly gameTitle: string;
  /** Rules worth telling the model up front, as short sentences. */
  readonly notes: string;
  /** Example questions for an empty chat. */
  readonly suggestions: readonly string[];
  /** Dataset load state; the chat waits for `ready`. */
  readonly status: Signal<'idle' | 'loading' | 'ready' | 'error'>;
  readonly error: Signal<string | null>;
  retry(): void;
  /** The player's level, settings and compendium right now, as compact text. */
  snapshot(): string;
  tools(): readonly AiTool[];
}

export const GAME_AI = new InjectionToken<GameAi>('GAME_AI');
