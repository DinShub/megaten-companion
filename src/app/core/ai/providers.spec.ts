import { afterEach, beforeEach, vi } from 'vitest';

import { createAnthropicSession } from './anthropic-provider';
import { AiError, MAX_TOOL_ROUNDS, type AiSession, type AiTool, type AiTurnEvents } from './ai.model';
import { createGeminiSession } from './gemini-provider';

/**
 * Both providers run through their real SDKs here; only `fetch` is replaced, with
 * replies in each API's wire format. So these check what actually goes over the
 * wire, but not that the live APIs agree with these fixtures.
 */
const LOOKUP: AiTool = {
  name: 'lookup',
  description: 'Look something up.',
  parameters: { type: 'object', properties: { name: { type: 'string', description: 'Name.' } }, required: ['name'], additionalProperties: false },
  run: (args) => ({ found: args['name'] }),
};

const CONFIG = { apiKey: 'test-key', system: 'Be helpful.', tools: [LOOKUP] };

interface Sent {
  readonly url: string;
  readonly headers: Headers;
  readonly body: Record<string, any>;
}

let sent: Sent[];
let replies: Response[];

function sse(blocks: readonly object[], named = false): Response {
  const body = blocks
    .map((b) => `${named ? `event: ${(b as { type: string }).type}\n` : ''}data: ${JSON.stringify(b)}\n\n`)
    .join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function events() {
  const text: string[] = [];
  const calls: string[] = [];
  const handlers: AiTurnEvents = { onText: (d) => text.push(d), onToolCall: (n) => calls.push(n) };
  return { text, calls, handlers };
}

beforeEach(() => {
  sent = [];
  replies = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({
      url: String(input instanceof Request ? input.url : input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, any>,
    });
    const reply = replies.shift();
    if (!reply) throw new Error('No reply queued');
    return reply;
  });
});

afterEach(() => vi.unstubAllGlobals());

const send = (session: AiSession, text: string, handlers = events().handlers, signal = new AbortController().signal) =>
  session.send(text, handlers, signal);

// ---- Anthropic -------------------------------------------------------------

const USAGE = { input_tokens: 1, output_tokens: 1 };
const start = { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'x', content: [], stop_reason: null, stop_sequence: null, usage: USAGE } };

function claudeText(text: string, stop = 'end_turn'): Response {
  return sse(
    [
      start,
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ],
    true,
  );
}

function claudeToolCall(id: string, input: object, stop = 'tool_use'): Response {
  return sse(
    [
      start,
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig-1' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id, name: 'lookup', input: {} } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ],
    true,
  );
}

const claudeError = (status: number, type: string): Response =>
  new Response(JSON.stringify({ type: 'error', error: { type, message: `${type} message` } }), { status, headers: { 'content-type': 'application/json' } });

describe('Anthropic session', () => {
  const session = (model = 'claude-opus-5-5') => createAnthropicSession({ ...CONFIG, model });

  it('streams text and opts in to browser access, caching and fallbacks', async () => {
    replies = [claudeText('Hello')];
    const { text, handlers } = events();
    expect(await send(session(), 'Hi', handlers)).toBe('done');
    expect(text.join('')).toBe('Hello');

    const [request] = sent;
    expect(request.url).toContain('/v1/messages');
    expect(request.headers.get('authorization')).toBe('Bearer test-key');
    expect(request.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(request.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(request.body['model']).toBe('claude-opus-5-5');
    expect(request.body['fallbacks']).toBe('default');
    expect(request.body['cache_control']).toEqual({ type: 'ephemeral' });
    expect(request.body['tools'][0].eager_input_streaming).toBe(true);
  });

  it("leaves fallbacks off for Haiku, which doesn't have them", async () => {
    replies = [claudeText('Hello')];
    await send(session('claude-haiku-5-5'), 'Hi');
    expect(sent[0].body['fallbacks']).toBeUndefined();
    expect(sent[0].headers.get('anthropic-beta')).toBeNull();
  });

  it('runs tools and returns the whole assistant turn unchanged', async () => {
    replies = [claudeToolCall('t1', { name: 'Pixie' }), claudeText('Pixie is level 2.')];
    const { calls, handlers } = events();
    expect(await send(session(), 'Who?', handlers)).toBe('done');
    expect(calls).toEqual(['lookup']);

    const messages = sent[1].body['messages'];
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content[0]).toMatchObject({ type: 'thinking', signature: 'sig-1' });
    expect(messages[1].content[1]).toMatchObject({ type: 'tool_use', id: 't1' });
    expect(messages[2].content[0]).toEqual({ type: 'tool_result', tool_use_id: 't1', content: '{"found":"Pixie"}', is_error: false });
  });

  it('reports a bad tool call to the model instead of failing', async () => {
    replies = [claudeToolCall('t1', { wrong: 1 }), claudeText('Sorry.')];
    expect(await send(session(), 'Who?')).toBe('done');
    expect(sent[1].body['messages'][2].content[0].is_error).toBe(true);
  });

  it('keeps earlier turns in later requests', async () => {
    const s = session();
    replies = [claudeText('One'), claudeText('Two')];
    await send(s, 'First');
    await send(s, 'Second');
    expect(sent[1].body['messages'].map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('maps a rejected key and rolls back, so re-sending does not duplicate', async () => {
    const s = session();
    replies = [claudeError(401, 'authentication_error')];
    const failure = await send(s, 'Hi').catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(AiError);
    expect((failure as AiError).kind).toBe('auth');
    expect((failure as AiError).message).not.toContain('test-key');

    replies = [claudeText('Hello')];
    await send(s, 'Hi');
    expect(sent.at(-1)?.body['messages']).toHaveLength(1);
  });

  it('reports refusals and truncation, and never runs a cut-off tool call', async () => {
    replies = [claudeText('', 'refusal')];
    expect(await send(session(), 'Hi')).toBe('refused');

    replies = [claudeText('Long', 'max_tokens')];
    expect(await send(session(), 'Hi')).toBe('truncated');

    const run = vi.spyOn(LOOKUP, 'run');
    replies = [claudeToolCall('t1', { name: 'Pixie' }, 'max_tokens')];
    expect(await send(session(), 'Hi')).toBe('truncated');
    expect(run).not.toHaveBeenCalled();
    run.mockRestore();
  });

  it('stops a model that keeps calling tools', async () => {
    replies = Array.from({ length: MAX_TOOL_ROUNDS + 1 }, (_, i) => claudeToolCall(`t${i}`, { name: 'Pixie' }));
    expect(await send(session(), 'Hi')).toBe('tool-limit');
    expect(sent).toHaveLength(MAX_TOOL_ROUNDS + 1);
  });

  it('reports cancellation', async () => {
    const abort = new AbortController();
    abort.abort();
    replies = [claudeText('Hello')];
    const failure = await send(session(), 'Hi', events().handlers, abort.signal).catch((e: unknown) => e);
    expect((failure as AiError).kind).toBe('cancelled');
  });
});

// ---- Gemini ----------------------------------------------------------------

const geminiChunk = (parts: object[], finishReason?: string) => ({ candidates: [{ content: { role: 'model', parts }, finishReason }] });

describe('Gemini session', () => {
  const session = () => createGeminiSession({ ...CONFIG, model: 'gemini-3.8-flash' });

  it('streams text across chunks and skips thought parts', async () => {
    replies = [sse([geminiChunk([{ text: 'hmm', thought: true }]), geminiChunk([{ text: 'Hel' }]), geminiChunk([{ text: 'lo' }], 'STOP')])];
    const { text, handlers } = events();
    expect(await send(session(), 'Hi', handlers)).toBe('done');
    expect(text.join('')).toBe('Hello');

    const [request] = sent;
    expect(request.url).toContain('gemini-3.8-flash:streamGenerateContent');
    expect(request.headers.get('x-goog-api-key')).toBe('test-key');
    expect(request.body['systemInstruction'].parts[0].text).toBe('Be helpful.');
    expect(request.body['tools'][0].functionDeclarations[0].parametersJsonSchema.required).toEqual(['name']);
  });

  it('runs function calls and returns thought signatures unchanged', async () => {
    replies = [
      sse([geminiChunk([{ functionCall: { id: 'c1', name: 'lookup', args: { name: 'Pixie' } }, thoughtSignature: 'sig-1' }], 'STOP')]),
      sse([geminiChunk([{ text: 'Level 2.' }], 'STOP')]),
    ];
    const { calls, handlers } = events();
    expect(await send(session(), 'Who?', handlers)).toBe('done');
    expect(calls).toEqual(['lookup']);

    const contents = sent[1].body['contents'];
    expect(contents[1].role).toBe('model');
    expect(contents[1].parts[0].thoughtSignature).toBe('sig-1');
    expect(contents[2].role).toBe('user');
    expect(contents[2].parts[0].functionResponse).toEqual({ id: 'c1', name: 'lookup', response: { output: '{"found":"Pixie"}' } });
  });

  it('reports a bad function call to the model instead of failing', async () => {
    replies = [
      sse([geminiChunk([{ functionCall: { name: 'lookup', args: {} } }], 'STOP')]),
      sse([geminiChunk([{ text: 'Sorry.' }], 'STOP')]),
    ];
    expect(await send(session(), 'Who?')).toBe('done');
    expect(sent[1].body['contents'][2].parts[0].functionResponse.response.error).toContain('Missing required argument');
  });

  it('maps a rejected key and rolls back', async () => {
    const s = session();
    replies = [
      new Response(JSON.stringify({ error: { code: 400, message: 'API key not valid.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    ];
    const failure = await send(s, 'Hi').catch((e: unknown) => e);
    expect((failure as AiError).kind).toBe('auth');

    replies = [sse([geminiChunk([{ text: 'Hello' }], 'STOP')])];
    await send(s, 'Hi');
    expect(sent.at(-1)?.body['contents']).toHaveLength(1);
  });

  it('reports blocks and truncation, and never runs a cut-off call', async () => {
    replies = [sse([{ promptFeedback: { blockReason: 'SAFETY' } }])];
    expect(await send(session(), 'Hi')).toBe('refused');

    replies = [sse([geminiChunk([{ text: 'Nope' }], 'SAFETY')])];
    expect(await send(session(), 'Hi')).toBe('refused');

    replies = [sse([geminiChunk([{ text: 'Long' }], 'MAX_TOKENS')])];
    expect(await send(session(), 'Hi')).toBe('truncated');

    const run = vi.spyOn(LOOKUP, 'run');
    replies = [sse([geminiChunk([{ functionCall: { name: 'lookup', args: { name: 'x' } } }], 'MAX_TOKENS')])];
    expect(await send(session(), 'Hi')).toBe('truncated');
    expect(run).not.toHaveBeenCalled();
    run.mockRestore();
  });
});
