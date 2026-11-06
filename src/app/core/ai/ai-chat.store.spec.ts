import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { GAMES } from '../../games/game.registry';
import type { StorageBackend } from '../storage/storage-envelope';
import { STORAGE_BACKEND, StorageService, STORAGE_KEY_PREFIX } from '../storage/storage.service';
import { AI_SESSION_FACTORY, AiChatStore } from './ai-chat.store';
import { AI_SETTINGS_KEY, AiSettingsStore } from './ai-settings.store';
import { AiError, type AiSession, type AiSessionConfig, type AiTurnEnd, type AiTurnEvents } from './ai.model';
import type { GameAi } from './game-ai';

class MemoryBackend implements StorageBackend {
  readonly map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

type Script = (text: string, events: AiTurnEvents, signal: AbortSignal) => Promise<AiTurnEnd>;

function setup() {
  const backend = new MemoryBackend();
  const started: { provider: string; config: AiSessionConfig }[] = [];
  const sentTexts: string[] = [];
  let script: Script = async (_, events) => {
    events.onText('Reply');
    return 'done';
  };

  TestBed.configureTestingModule({
    providers: [
      { provide: STORAGE_BACKEND, useValue: backend },
      {
        provide: AI_SESSION_FACTORY,
        useValue: async (provider: string, config: AiSessionConfig): Promise<AiSession> => {
          started.push({ provider, config });
          return {
            send: (text, events, s) => {
              sentTexts.push(text);
              return script(text, events, s);
            },
          };
        },
      },
    ],
  });

  const snapshot = signal('Level 10.');
  const game: GameAi = {
    gameId: 'test',
    gameTitle: 'Test Game',
    notes: 'Test notes.',
    suggestions: [],
    status: signal('ready' as const),
    error: signal(null),
    retry: () => undefined,
    snapshot: () => snapshot(),
    tools: () => [],
  };
  const settings = TestBed.inject(AiSettingsStore);
  settings.setApiKey('  key-1  ');
  return {
    backend,
    game,
    snapshot,
    settings,
    started,
    sentTexts,
    store: TestBed.inject(AiChatStore),
    setScript: (s: Script) => (script = s),
  };
}

describe('AiChatStore', () => {
  it('sends nothing without a key or text', async () => {
    const t = setup();
    await t.store.send(t.game, '   ');
    expect(t.started).toHaveLength(0);
    t.settings.setApiKey('');
    await t.store.send(t.game, 'Hi');
    expect(t.started).toHaveLength(0);
    expect(t.store.messages('test')()).toHaveLength(0);
  });

  it('starts a session with the settings, the game prompt and a trimmed key', async () => {
    const t = setup();
    await t.store.send(t.game, 'Hi');
    expect(t.started[0].provider).toBe('anthropic');
    expect(t.started[0].config.apiKey).toBe('key-1');
    expect(t.started[0].config.model).toBe('claude-opus-5-5');
    expect(t.started[0].config.system).toContain('Test Game');
    expect(t.started[0].config.system).toContain('Test notes.');
    expect(t.store.messages('test')().map((m) => [m.role, m.text])).toEqual([
      ['user', 'Hi'],
      ['assistant', 'Reply'],
    ]);
  });

  it('shows the player their own words, not the game state sent with them', async () => {
    const t = setup();
    await t.store.send(t.game, 'Hi');
    expect(t.sentTexts[0]).toBe('<game_state>\nLevel 10.\n</game_state>\n\nHi');
    expect(t.store.messages('test')()[0].text).toBe('Hi');
  });

  it('sends the game state again only when it has changed', async () => {
    const t = setup();
    await t.store.send(t.game, 'One');
    await t.store.send(t.game, 'Two');
    expect(t.sentTexts[1]).toBe('Two');

    t.snapshot.set('Level 11.');
    await t.store.send(t.game, 'Three');
    expect(t.sentTexts[2]).toContain('Level 11.');
    expect(t.started).toHaveLength(1);
  });

  it('re-sends the game state after a failed turn, which the session forgot', async () => {
    const t = setup();
    t.setScript(async () => {
      throw new AiError('network', 'Offline.');
    });
    await t.store.send(t.game, 'One');
    t.setScript(async () => 'done');
    await t.store.send(t.game, 'Two');
    expect(t.sentTexts[1]).toContain('<game_state>');
  });

  it('shows failures and retries in place of the failed attempt', async () => {
    const t = setup();
    t.setScript(async () => {
      throw new AiError('auth', 'Bad key.');
    });
    await t.store.send(t.game, 'Hi');
    expect(t.store.messages('test')()[1].error).toBe('Bad key.');
    expect(t.store.canRetry('test')).toBe(true);
    expect(t.store.busy('test')()).toBe(false);

    t.setScript(async (_, events) => {
      events.onText('Fine');
      return 'done';
    });
    await t.store.retry(t.game);
    expect(t.store.messages('test')().map((m) => m.text)).toEqual(['Hi', 'Fine']);
    expect(t.store.canRetry('test')).toBe(false);
  });

  it('stop aborts the turn without offering a retry', async () => {
    const t = setup();
    t.setScript(
      (_, _events, s) =>
        new Promise((_resolve, reject) => {
          s.addEventListener('abort', () => reject(new AiError('cancelled', 'Stopped.')));
        }),
    );
    const turn = t.store.send(t.game, 'Hi');
    await Promise.resolve();
    await Promise.resolve();
    expect(t.store.busy('test')()).toBe(true);
    t.store.stop('test');
    await turn;
    expect(t.store.busy('test')()).toBe(false);
    expect(t.store.messages('test')()[1].error).toContain('Stopped');
    expect(t.store.canRetry('test')).toBe(false);
  });

  it('notes end states that are not errors', async () => {
    const t = setup();
    t.setScript(async () => 'refused');
    await t.store.send(t.game, 'Hi');
    expect(t.store.messages('test')()[1].error).toContain('declined');
  });

  it('starts a new session and says so when the connection changes', async () => {
    const t = setup();
    await t.store.send(t.game, 'One');
    t.settings.setModel('claude-sonnet-5-5');
    await t.store.send(t.game, 'Two');
    expect(t.started).toHaveLength(2);
    expect(t.started[1].config.model).toBe('claude-sonnet-5-5');
    expect(t.sentTexts[1]).toContain('<game_state>');
    expect(t.store.messages('test')().some((m) => m.role === 'notice')).toBe(true);
  });

  it('keeps each game\'s conversation separate', async () => {
    const t = setup();
    await t.store.send(t.game, 'Hi');
    expect(t.store.messages('other')()).toHaveLength(0);
    t.store.clear('test');
    expect(t.store.messages('test')()).toHaveLength(0);
  });

  it('turns tool calls into readable lookups', async () => {
    const t = setup();
    t.setScript(async (_, events) => {
      events.onToolCall('recipes_for', { target: 'Pixie' });
      events.onToolCall('fusable_now', {});
      return 'done';
    });
    await t.store.send(t.game, 'Hi');
    expect(t.store.messages('test')()[1].lookups).toEqual(['Finding recipes for Pixie', 'Checking what you can fuse now']);
  });
});

describe('AiSettingsStore', () => {
  it('keeps a key per provider and survives a reload', () => {
    const t = setup();
    t.settings.setProvider('gemini');
    expect(t.settings.connected()).toBe(false);
    t.settings.setApiKey('key-2');
    t.settings.setModel('gemini-4-argon');
    expect(t.settings.apiKey()).toBe('key-2');
    t.settings.setProvider('anthropic');
    expect(t.settings.apiKey()).toBe('key-1');

    TestBed.inject(StorageService).flushWrites();
    const stored = t.backend.map.get(`${STORAGE_KEY_PREFIX}${AI_SETTINGS_KEY}`);
    expect(stored).toContain('key-2');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: STORAGE_BACKEND, useValue: t.backend }] });
    const reloaded = TestBed.inject(AiSettingsStore);
    expect(reloaded.apiKey()).toBe('key-1');
    reloaded.setProvider('gemini');
    expect(reloaded.apiKey()).toBe('key-2');
    expect(reloaded.model()).toBe('gemini-4-argon');
  });

  it('falls back to the default when a saved model has left the list', () => {
    const backend = new MemoryBackend();
    backend.setItem(
      `${STORAGE_KEY_PREFIX}${AI_SETTINGS_KEY}`,
      JSON.stringify({
        schemaVersion: 1,
        savedAt: 'x',
        data: { provider: 'anthropic', keys: { anthropic: 'k', gemini: '' }, models: { anthropic: 'claude-retired', gemini: 'gemini-3.8-flash' } },
      }),
    );
    TestBed.configureTestingModule({ providers: [{ provide: STORAGE_BACKEND, useValue: backend }] });
    expect(TestBed.inject(AiSettingsStore).model()).toBe('claude-opus-5-5');
  });

  it('is never part of a backup, so the key cannot leave in a file or through Drive', () => {
    const backedUp = GAMES.flatMap((game) => game.storedData).map((value) => value.key);
    expect(backedUp.length).toBeGreaterThan(0);
    expect(backedUp).not.toContain(AI_SETTINGS_KEY);
  });
});
