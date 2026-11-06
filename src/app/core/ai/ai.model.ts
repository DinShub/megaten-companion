/**
 * The provider-neutral vocabulary of the AI chat. Nothing here imports an SDK, so
 * the page and stores stay light; the SDKs load on the first message sent.
 */
export type AiProviderId = 'anthropic' | 'gemini';

export interface AiModelOption {
  readonly id: string;
  readonly label: string;
}

export interface AiProviderInfo {
  readonly id: AiProviderId;
  readonly label: string;
  /** Where the user creates an API key. */
  readonly keyUrl: string;
  /** The first entry is the default. */
  readonly models: readonly AiModelOption[];
}

export const AI_PROVIDERS: Readonly<Record<AiProviderId, AiProviderInfo>> = {
  anthropic: {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    keyUrl: 'https://platform.claude.com/settings/keys',
    models: [
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
    ],
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini (Google)',
    keyUrl: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
      { id: 'gemini-4-argon', label: 'Gemini 4 Argon' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
    ],
  },
};

/** The JSON Schema subset the tools declare; both providers accept it as is. */
export interface AiSchemaProperty {
  readonly type: 'string' | 'integer' | 'boolean' | 'array';
  readonly description: string;
  readonly enum?: readonly string[];
  readonly items?: { readonly type: 'string' };
}

export interface AiToolParameters {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, AiSchemaProperty>>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
}

/** A read-only lookup the model may call. Throwing reports the message back to the model. */
export interface AiTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: AiToolParameters;
  readonly run: (args: Readonly<Record<string, unknown>>) => unknown;
}

export interface AiSessionConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly system: string;
  readonly tools: readonly AiTool[];
}

export interface AiTurnEvents {
  /** A piece of the visible reply. */
  readonly onText: (delta: string) => void;
  /** The model is about to run a tool. */
  readonly onToolCall: (name: string, args: Readonly<Record<string, unknown>>) => void;
}

/**
 * How a finished turn ended:
 *  - `done` — the model finished normally;
 *  - `truncated` — the reply hit the output limit;
 *  - `refused` — the provider's safety system declined it;
 *  - `tool-limit` — it kept calling tools past {@link MAX_TOOL_ROUNDS}.
 */
export type AiTurnEnd = 'done' | 'truncated' | 'refused' | 'tool-limit';

/** One conversation with one model. Keeps its own provider-native history. */
export interface AiSession {
  /**
   * Run one user turn, including any tool calls. Rejects with {@link AiError}; a
   * failed or cancelled turn leaves the history as it was, so it can be re-sent.
   */
  send(text: string, events: AiTurnEvents, signal: AbortSignal): Promise<AiTurnEnd>;
}

export type AiErrorKind = 'auth' | 'rate-limit' | 'network' | 'cancelled' | 'other';

/** A provider failure in words the chat can show. Never carries the API key. */
export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

/** Tool-call rounds allowed in one turn, so a confused model can't spend without limit. */
export const MAX_TOOL_ROUNDS = 10;
