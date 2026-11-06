import { inject, Injectable, InjectionToken, signal, type Signal, type WritableSignal } from '@angular/core';

import { buildSystemPrompt, withGameState } from './ai-prompt';
import { AiSettingsStore } from './ai-settings.store';
import { AiError, type AiProviderId, type AiSession, type AiSessionConfig, type AiTurnEnd } from './ai.model';
import type { GameAi } from './game-ai';

/** Starts a provider session, loading that provider's SDK on first use. Tests replace it. */
export const AI_SESSION_FACTORY = new InjectionToken<(provider: AiProviderId, config: AiSessionConfig) => Promise<AiSession>>(
  'AI_SESSION_FACTORY',
  {
    providedIn: 'root',
    factory: () => async (provider, config) =>
      provider === 'anthropic'
        ? (await import('./anthropic-provider')).createAnthropicSession(config)
        : (await import('./gemini-provider')).createGeminiSession(config),
  },
);

export interface ChatMessage {
  readonly id: number;
  readonly role: 'user' | 'assistant' | 'notice';
  readonly text: string;
  /** What the model looked up while answering. */
  readonly lookups: readonly string[];
  /** A problem with this reply, shown beneath it. */
  readonly error: string | null;
}

interface Conversation {
  readonly messages: WritableSignal<readonly ChatMessage[]>;
  readonly busy: WritableSignal<boolean>;
  session: AiSession | null;
  /** Provider, model and key the session was started with. A change starts a new one. */
  sessionKey: string | null;
  /** The last snapshot the model saw, so an unchanged one isn't sent again. */
  sentSnapshot: string | null;
  abort: AbortController | null;
  /** The text of a failed turn, for "Try again". */
  failedText: string | null;
}

const END_NOTES: Readonly<Record<AiTurnEnd, string | null>> = {
  done: null,
  truncated: 'This reply hit the length limit and was cut off.',
  refused: "The provider's safety system declined this message, so it won't be part of the conversation.",
  'tool-limit': 'The model made too many lookups for one question and was stopped. Try a narrower question.',
};

/**
 * The chat conversations, one per game. A root singleton so a conversation survives
 * moving around the app, like the route finder's form; it isn't persisted, so a
 * reload starts fresh. Referenced only from the lazy chat pages.
 */
@Injectable({ providedIn: 'root' })
export class AiChatStore {
  private readonly settings = inject(AiSettingsStore);
  private readonly createSession = inject(AI_SESSION_FACTORY);

  private readonly conversations = new Map<string, Conversation>();
  private nextId = 1;

  messages(gameId: string): Signal<readonly ChatMessage[]> {
    return this.conversation(gameId).messages;
  }

  busy(gameId: string): Signal<boolean> {
    return this.conversation(gameId).busy;
  }

  canRetry(gameId: string): boolean {
    return this.conversation(gameId).failedText !== null;
  }

  async send(game: GameAi, rawText: string): Promise<void> {
    const convo = this.conversation(game.gameId);
    const text = rawText.trim();
    if (!text || convo.busy() || !this.settings.connected()) return;

    this.syncSession(convo);
    convo.failedText = null;
    convo.busy.set(true);
    const abort = new AbortController();
    convo.abort = abort;

    this.push(convo, 'user', text);
    const replyId = this.push(convo, 'assistant', '');
    const patchReply = (patch: (m: ChatMessage) => ChatMessage): void =>
      convo.messages.update((list) => list.map((m) => (m.id === replyId ? patch(m) : m)));

    try {
      convo.session ??= await this.createSession(this.settings.provider(), {
        apiKey: this.settings.apiKey(),
        model: this.settings.model(),
        system: buildSystemPrompt(game),
        tools: game.tools(),
      });
      const snapshot = game.snapshot();
      const outgoing = snapshot === convo.sentSnapshot ? text : withGameState(snapshot, text);
      const end = await convo.session.send(
        outgoing,
        {
          onText: (delta) => patchReply((m) => ({ ...m, text: m.text + delta })),
          onToolCall: (name, args) => patchReply((m) => ({ ...m, lookups: [...m.lookups, describeLookup(name, args)] })),
        },
        abort.signal,
      );
      if (end === 'done' || end === 'truncated') convo.sentSnapshot = snapshot;
      const note = END_NOTES[end];
      if (note) patchReply((m) => ({ ...m, error: note }));
    } catch (err) {
      // The session rolled its history back, so this turn can simply be sent again.
      const kind = err instanceof AiError ? err.kind : 'other';
      if (kind !== 'cancelled') convo.failedText = text;
      const message =
        kind === 'cancelled'
          ? "Stopped. This exchange won't be part of the conversation."
          : err instanceof Error
            ? err.message
            : String(err);
      patchReply((m) => ({ ...m, error: message }));
    } finally {
      convo.abort = null;
      convo.busy.set(false);
    }
  }

  /** Send the failed message again, in place of the failed attempt. */
  async retry(game: GameAi): Promise<void> {
    const convo = this.conversation(game.gameId);
    const text = convo.failedText;
    if (text === null || convo.busy()) return;
    convo.messages.update((list) => list.slice(0, -2));
    await this.send(game, text);
  }

  stop(gameId: string): void {
    this.conversation(gameId).abort?.abort();
  }

  /** Forget the conversation and start over. */
  clear(gameId: string): void {
    const convo = this.conversation(gameId);
    convo.abort?.abort();
    convo.messages.set([]);
    convo.session = null;
    convo.sessionKey = null;
    convo.sentSnapshot = null;
    convo.failedText = null;
  }

  /** A changed provider, model or key can't continue the old session, so say so and start anew. */
  private syncSession(convo: Conversation): void {
    const key = `${this.settings.provider()}|${this.settings.model()}|${this.settings.apiKey()}`;
    if (convo.sessionKey === key) return;
    if (convo.session) {
      this.push(convo, 'notice', `Connection changed: this is a new conversation with ${this.settings.model()}. It can't see the messages above.`);
    }
    convo.session = null;
    convo.sessionKey = key;
    convo.sentSnapshot = null;
  }

  private conversation(gameId: string): Conversation {
    let convo = this.conversations.get(gameId);
    if (!convo) {
      convo = {
        messages: signal<readonly ChatMessage[]>([]),
        busy: signal(false),
        session: null,
        sessionKey: null,
        sentSnapshot: null,
        abort: null,
        failedText: null,
      };
      this.conversations.set(gameId, convo);
    }
    return convo;
  }

  private push(convo: Conversation, role: ChatMessage['role'], text: string): number {
    const id = this.nextId++;
    convo.messages.update((list) => [...list, { id, role, text, lookups: [], error: null }]);
    return id;
  }
}

/** A tool call in the player's words. */
function describeLookup(name: string, args: Readonly<Record<string, unknown>>): string {
  const subject = args['target'] ?? args['name'] ?? args['ingredient'] ?? args['query'];
  const about = typeof subject === 'string' ? ` ${subject}` : '';
  switch (name) {
    case 'fusable_now':
      return 'Checking what you can fuse now';
    case 'recipes_for':
      return `Finding recipes for${about}`;
    case 'fusions_from':
      return `Checking what${about} can make`;
    case 'find_route':
      return `Planning a route to${about}`;
    case 'fuse':
      return Array.isArray(args['ingredients']) ? `Fusing ${args['ingredients'].join(' + ')}` : 'Running a fusion';
    case 'get_details':
    case 'get_skill':
      return `Reading up on${about}`;
    default:
      return about ? `Searching for${about}` : 'Searching the game data';
  }
}
