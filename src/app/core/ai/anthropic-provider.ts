import Anthropic from '@anthropic-ai/sdk';

import { AiError, MAX_TOOL_ROUNDS, type AiSession, type AiSessionConfig, type AiTurnEnd, type AiTurnEvents } from './ai.model';
import { runTool } from './run-tool';

type Message = Anthropic.Beta.BetaMessage;
type MessageParam = Anthropic.Beta.BetaMessageParam;

/** Consecutive unparseable tool inputs tolerated before giving up on a turn. */
const MAX_JSON_RETRIES = 2;

/**
 * A conversation with Claude, called straight from the browser with the user's own
 * key. Loaded on demand: importing this file pulls in the SDK.
 *
 * The history is append-only and holds whole response `content` arrays, because
 * thinking and fallback blocks must go back to the API exactly as they came.
 */
export function createAnthropicSession(config: AiSessionConfig): AiSession {
  const client = new Anthropic({ apiKey: config.apiKey, dangerouslyAllowBrowser: true });

  const tools: Anthropic.Beta.BetaTool[] = config.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as unknown as Anthropic.Beta.BetaTool.InputSchema,
    eager_input_streaming: true,
  }));

  // Haiku has no server-side fallback; the other models re-run a declined request.
  const fallback = config.model.includes('haiku')
    ? {}
    : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

  const history: MessageParam[] = [];

  const streamOnce = async (events: AiTurnEvents, signal: AbortSignal): Promise<Message> => {
    for (let retries = 0; ; retries++) {
      const stream = client.beta.messages.stream(
        {
          model: config.model,
          max_tokens: 64_000,
          output_config: { effort: 'medium' },
          // Caches everything up to the newest block, so each turn re-reads the
          // system prompt, tools and history at the cached rate.
          cache_control: { type: 'ephemeral' },
          system: config.system,
          tools,
          messages: history,
          ...fallback,
        },
        { signal },
      );
      stream.on('text', (delta) => events.onText(delta));
      try {
        return await stream.finalMessage();
      } catch (err) {
        // Only a tool input that wouldn't parse is worth re-issuing.
        if (err instanceof Anthropic.APIError || signal.aborted || retries >= MAX_JSON_RETRIES) throw err;
      }
    }
  };

  return {
    async send(text, events, signal): Promise<AiTurnEnd> {
      const checkpoint = history.length;
      history.push({ role: 'user', content: text });
      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const message = await streamOnce(events, signal);

          if (message.stop_reason === 'refusal') {
            history.length = checkpoint;
            return 'refused';
          }
          history.push({ role: 'assistant', content: message.content });
          if (message.stop_reason === 'pause_turn') continue;

          const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
          if (message.stop_reason === 'max_tokens') {
            // A cut-off tool input can still parse, so never run it.
            if (calls.length > 0) history.length = checkpoint;
            return 'truncated';
          }
          if (calls.length === 0) return 'done';
          if (round === MAX_TOOL_ROUNDS) {
            history.length = checkpoint;
            return 'tool-limit';
          }

          for (const call of calls) events.onToolCall(call.name, asArgs(call.input));
          await nextFrame();
          history.push({
            role: 'user',
            content: calls.map((call) => {
              const run = runTool(config.tools, call.name, call.input);
              return { type: 'tool_result', tool_use_id: call.id, content: run.output, is_error: run.isError };
            }),
          });
        }
        return 'tool-limit';
      } catch (err) {
        history.length = checkpoint;
        throw toAiError(err, signal);
      }
    },
  };
}

function asArgs(input: unknown): Readonly<Record<string, unknown>> {
  return typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
}

/** Let the "looking up…" line paint before a synchronous tool runs. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

function toAiError(err: unknown, signal: AbortSignal): AiError {
  if (signal.aborted || err instanceof Anthropic.APIUserAbortError) return new AiError('cancelled', 'Stopped.');
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AiError('auth', 'Anthropic rejected the API key. Check it under Connection.');
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AiError('rate-limit', 'Anthropic says you hit a rate limit. Wait a moment and try again.');
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AiError('network', "Couldn't reach Anthropic. Check your connection and try again.");
  }
  if (err instanceof Anthropic.APIError) {
    return new AiError('other', `Anthropic returned an error (${err.status ?? 'unknown status'}): ${err.message}`);
  }
  return new AiError('other', err instanceof Error ? err.message : String(err));
}
