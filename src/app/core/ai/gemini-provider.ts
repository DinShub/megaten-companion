import { ApiError, FinishReason, GoogleGenAI, type Content, type FunctionCall, type Part } from '@google/genai';

import { AiError, MAX_TOOL_ROUNDS, type AiSession, type AiSessionConfig, type AiTurnEnd } from './ai.model';
import { runTool } from './run-tool';

/**
 * A conversation with Gemini, called straight from the browser with the user's own
 * key. Loaded on demand: importing this file pulls in the SDK.
 *
 * The model's parts go into the history exactly as they arrived, because Gemini
 * attaches thought signatures to them and needs them back to continue a tool loop.
 */
export function createGeminiSession(config: AiSessionConfig): AiSession {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const functionDeclarations = config.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.parameters,
  }));
  const history: Content[] = [];

  return {
    async send(text, events, signal): Promise<AiTurnEnd> {
      const checkpoint = history.length;
      history.push({ role: 'user', parts: [{ text }] });
      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const stream = await ai.models.generateContentStream({
            model: config.model,
            contents: history,
            config: {
              systemInstruction: config.system,
              tools: [{ functionDeclarations }],
              abortSignal: signal,
            },
          });

          const parts: Part[] = [];
          let finish: FinishReason | undefined;
          let blocked = false;
          for await (const chunk of stream) {
            if (signal.aborted) throw new AiError('cancelled', 'Stopped.');
            if (chunk.promptFeedback?.blockReason) blocked = true;
            const candidate = chunk.candidates?.[0];
            finish = candidate?.finishReason ?? finish;
            for (const part of candidate?.content?.parts ?? []) {
              parts.push(part);
              if (part.text && !part.thought) events.onText(part.text);
            }
          }

          const calls = parts.flatMap((part): FunctionCall[] => (part.functionCall ? [part.functionCall] : []));
          if (blocked || (parts.length === 0 && finish !== FinishReason.MAX_TOKENS) || isSafetyStop(finish)) {
            history.length = checkpoint;
            return 'refused';
          }
          if (finish === FinishReason.MAX_TOKENS) {
            // A cut-off function call is never run; a cut-off reply is kept.
            if (calls.length > 0) history.length = checkpoint;
            else history.push({ role: 'model', parts });
            return 'truncated';
          }

          history.push({ role: 'model', parts });
          if (calls.length === 0) return 'done';
          if (round === MAX_TOOL_ROUNDS) {
            history.length = checkpoint;
            return 'tool-limit';
          }

          for (const call of calls) events.onToolCall(call.name ?? '', call.args ?? {});
          await new Promise((resolve) => setTimeout(resolve)); // let the "looking up…" line paint
          history.push({
            role: 'user',
            parts: calls.map((call) => {
              const run = runTool(config.tools, call.name ?? '', call.args ?? {});
              return {
                functionResponse: {
                  id: call.id,
                  name: call.name,
                  response: run.isError ? { error: run.output } : { output: run.output },
                },
              };
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

function isSafetyStop(finish: FinishReason | undefined): boolean {
  return (
    finish === FinishReason.SAFETY ||
    finish === FinishReason.RECITATION ||
    finish === FinishReason.BLOCKLIST ||
    finish === FinishReason.PROHIBITED_CONTENT ||
    finish === FinishReason.SPII
  );
}

function toAiError(err: unknown, signal: AbortSignal): AiError {
  if (err instanceof AiError) return err;
  if (signal.aborted) return new AiError('cancelled', 'Stopped.');
  if (err instanceof ApiError) {
    const invalidKey = err.status === 400 && err.message.includes('API_KEY_INVALID');
    if (invalidKey || err.status === 401 || err.status === 403) {
      return new AiError('auth', 'Google rejected the API key. Check it under Connection.');
    }
    if (err.status === 429) {
      return new AiError('rate-limit', 'Google says you hit a rate limit. Wait a moment and try again.');
    }
    return new AiError('other', `Google returned an error (${err.status}): ${err.message}`);
  }
  if (err instanceof TypeError) {
    return new AiError('network', "Couldn't reach Google. Check your connection and try again.");
  }
  return new AiError('other', err instanceof Error ? err.message : String(err));
}
