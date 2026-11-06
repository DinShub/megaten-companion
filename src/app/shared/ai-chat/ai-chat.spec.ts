import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AI_SESSION_FACTORY } from '../../core/ai/ai-chat.store';
import { AiSettingsStore } from '../../core/ai/ai-settings.store';
import type { AiSession, AiSessionConfig } from '../../core/ai/ai.model';
import { GAME_AI, type GameAi } from '../../core/ai/game-ai';
import type { StorageBackend } from '../../core/storage/storage-envelope';
import { STORAGE_BACKEND } from '../../core/storage/storage.service';
import { AiChat } from './ai-chat';

class MemoryBackend implements StorageBackend {
  private readonly m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

function mount(reply = '**Fuse** Pixie.', status: 'ready' | 'loading' | 'error' = 'ready') {
  const sent: string[] = [];
  const game: GameAi = {
    gameId: 'test',
    gameTitle: 'Test Game',
    notes: '',
    suggestions: ['What should I fuse?'],
    status: signal(status),
    error: signal(status === 'error' ? 'No data.' : null),
    retry: () => undefined,
    snapshot: () => 'Level 1.',
    tools: () => [],
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: STORAGE_BACKEND, useValue: new MemoryBackend() },
      { provide: GAME_AI, useValue: game },
      {
        provide: AI_SESSION_FACTORY,
        useValue: async (_: string, __: AiSessionConfig): Promise<AiSession> => ({
          send: async (text, events) => {
            sent.push(text);
            events.onToolCall('fusable_now', {});
            events.onText(reply);
            return 'done';
          },
        }),
      },
    ],
  });
  const fixture = TestBed.createComponent(AiChat);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  };
  return { fixture, el, sent, settle, settings: TestBed.inject(AiSettingsStore) };
}

describe('AiChat', () => {
  it('asks for a key first and blocks sending without one', async () => {
    const { el, settle } = mount();
    await settle();
    expect(el.querySelector('details')?.open).toBe(true);
    expect(el.querySelector('textarea')?.disabled).toBe(true);
    expect((el.querySelector('.ai-chat__suggestions button') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector<HTMLInputElement>('input')?.type).toBe('password');
    expect(el.textContent).toContain('left out of backups');
  });

  it('remembers a pasted key and enables the composer', async () => {
    const { el, settle, settings } = mount();
    await settle();
    const key = el.querySelector('input') as HTMLInputElement;
    key.value = ' sk-test ';
    key.dispatchEvent(new Event('change'));
    await settle();
    expect(settings.apiKey()).toBe('sk-test');
    expect(el.querySelector('textarea')?.disabled).toBe(false);
    expect(el.querySelector('details')?.open).toBe(false);
  });

  it('switches model lists with the provider', async () => {
    const { el, settle } = mount();
    await settle();
    const [provider] = Array.from(el.querySelectorAll('select'));
    expect(el.querySelectorAll('select')[1].textContent).toContain('Claude Opus 5.5');
    provider.value = 'gemini';
    provider.dispatchEvent(new Event('change'));
    await settle();
    expect(el.querySelectorAll('select')[1].textContent).toContain('Gemini 3.8 Flash');
    expect(el.querySelector('.ai-chat__fine a')?.getAttribute('href')).toBe('https://aistudio.google.com/apikey');
  });

  it('sends on Enter, keeps a line on Shift+Enter, and shows the reply with its lookups', async () => {
    const { el, sent, settle, settings } = mount();
    settings.setApiKey('k');
    await settle();
    const box = el.querySelector('textarea') as HTMLTextAreaElement;
    box.value = 'What now?';
    box.dispatchEvent(new Event('input'));
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
    await settle();
    expect(sent).toHaveLength(0);

    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(sent).toHaveLength(1);
    expect(el.querySelector('.ai-msg--user')?.textContent).toBe('What now?');
    expect(el.querySelector('.ai-msg__lookups')?.textContent).toContain('Checking what you can fuse now');
    expect(el.querySelector('.ai-msg__body strong')?.textContent).toBe('Fuse');
    expect(box.value).toBe('');
  });

  it('sends a suggestion when clicked', async () => {
    const { el, sent, settle, settings } = mount();
    settings.setApiKey('k');
    await settle();
    (el.querySelector('.ai-chat__suggestions button') as HTMLButtonElement).click();
    await settle();
    expect(sent[0]).toContain('What should I fuse?');
  });

  it('never turns a reply or a message into live markup', async () => {
    const { el, settle, settings } = mount('<img src=x onerror=alert(1)><script>alert(2)</script>');
    settings.setApiKey('k');
    await settle();
    const box = el.querySelector('textarea') as HTMLTextAreaElement;
    box.value = '<img src=x onerror=alert(3)>';
    box.dispatchEvent(new Event('input'));
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(el.querySelector('.ai-chat__log img, .ai-chat__log script')).toBeNull();
    expect(el.querySelector('.ai-msg__body')?.textContent).toContain('<img src=x');
  });

  it('waits for the game data, and offers a retry if it fails', async () => {
    const loading = mount('', 'loading');
    await loading.settle();
    expect(loading.el.textContent).toContain('Loading the game data');
    expect(loading.el.querySelector('textarea')).toBeNull();
    TestBed.resetTestingModule();

    const failed = mount('', 'error');
    await failed.settle();
    expect(failed.el.textContent).toContain('No data.');
    expect(failed.el.textContent).toContain('Retry');
  });
});
