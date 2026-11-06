import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Pipe,
  type PipeTransform,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';

import { AiChatStore } from '../../core/ai/ai-chat.store';
import { renderMarkdown } from '../../core/ai/ai-markdown';
import { AiSettingsStore } from '../../core/ai/ai-settings.store';
import { AI_PROVIDERS, type AiProviderId } from '../../core/ai/ai.model';
import { GAME_AI } from '../../core/ai/game-ai';

/** Pure, so a streaming reply re-renders only the message that changed. */
@Pipe({ name: 'aiMarkdown' })
export class AiMarkdownPipe implements PipeTransform {
  transform(source: string): string {
    return renderMarkdown(source);
  }
}

/**
 * The chat itself, shared by every game. The game comes from {@link GAME_AI}, which
 * a thin per-game page provides; the look comes from the skin's `--app-*` variables.
 * Encapsulation is off because a reply's HTML arrives through `[innerHTML]`, which
 * scoped styles can't reach; every selector sits under `.ai-chat` instead.
 */
@Component({
  selector: 'app-ai-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [AiMarkdownPipe],
  template: `
    <div class="ai-chat">
      <details class="ai-chat__connection" [open]="!settings.connected()">
        <summary>
          <i class="pi pi-key" aria-hidden="true"></i>
          Connection:
          @if (settings.connected()) {
            {{ model() }}
          } @else {
            add your API key to start
          }
        </summary>
        <div class="ai-chat__fields">
          <label>
            <span>Provider</span>
            <select [value]="settings.provider()" (change)="settings.setProvider($any($event.target).value)">
              @for (p of providers; track p.id) {
                <option [value]="p.id" [selected]="p.id === settings.provider()">{{ p.label }}</option>
              }
            </select>
          </label>
          <label>
            <span>Model</span>
            <select (change)="settings.setModel($any($event.target).value)">
              @for (m of settings.providerInfo().models; track m.id) {
                <option [value]="m.id" [selected]="m.id === settings.model()">{{ m.label }}</option>
              }
            </select>
          </label>
          <label class="ai-chat__key">
            <span>API key</span>
            <input
              type="password"
              autocomplete="off"
              spellcheck="false"
              [value]="settings.apiKey()"
              (change)="settings.setApiKey($any($event.target).value)"
              placeholder="Paste your key"
            />
          </label>
          @if (settings.connected()) {
            <button type="button" class="ai-chat__btn" (click)="settings.setApiKey('')">Remove key</button>
          }
        </div>
        <p class="ai-chat__fine">
          Get a key from <a [href]="settings.providerInfo().keyUrl" target="_blank" rel="noopener noreferrer">{{ settings.providerInfo().label }}</a>;
          usage is billed to that account. The key stays in this browser and is left out of backups and Drive sync.
          Your messages, level, settings and compendium go straight to the provider, and nowhere else.
        </p>
      </details>

      @switch (game.status()) {
        @case ('error') {
          <div class="ai-chat__empty" role="alert">
            <p>{{ game.error() }}</p>
            <button type="button" class="ai-chat__btn" (click)="game.retry()">Retry</button>
          </div>
        }
        @case ('ready') {
          <div #log class="ai-chat__log" role="log" aria-live="polite" tabindex="0">
            @for (m of messages(); track m.id) {
              @switch (m.role) {
                @case ('user') {
                  <div class="ai-msg ai-msg--user">{{ m.text }}</div>
                }
                @case ('notice') {
                  <p class="ai-msg ai-msg--notice">{{ m.text }}</p>
                }
                @default {
                  <div class="ai-msg ai-msg--assistant">
                    @if (m.lookups.length) {
                      <ul class="ai-msg__lookups">
                        @for (lookup of m.lookups; track $index) {
                          <li><i class="pi pi-search" aria-hidden="true"></i> {{ lookup }}</li>
                        }
                      </ul>
                    }
                    @if (m.text) {
                      <div class="ai-msg__body" [innerHTML]="m.text | aiMarkdown"></div>
                    } @else if (!m.error && busy() && $last) {
                      <p class="ai-msg__thinking">Thinking…</p>
                    }
                    @if (m.error) {
                      <p class="ai-msg__error" role="alert">{{ m.error }}</p>
                      @if ($last && store.canRetry(game.gameId)) {
                        <button type="button" class="ai-chat__btn" (click)="retry()">Try again</button>
                      }
                    }
                  </div>
                }
              }
            } @empty {
              <div class="ai-chat__empty">
                <p>Ask about {{ game.gameTitle }}. I can see your level, settings and compendium, and I check fusions with this app's engine.</p>
                <div class="ai-chat__suggestions">
                  @for (s of game.suggestions; track s) {
                    <button type="button" class="ai-chat__btn" [disabled]="!settings.connected()" (click)="send(s)">{{ s }}</button>
                  }
                </div>
              </div>
            }
          </div>

          <form class="ai-chat__composer" (submit)="$event.preventDefault(); sendDraft()">
            <textarea
              rows="2"
              aria-label="Message"
              [placeholder]="settings.connected() ? 'Ask anything. Enter sends, Shift+Enter adds a line.' : 'Add your API key above to start.'"
              [disabled]="!settings.connected()"
              [value]="draft()"
              (input)="draft.set($any($event.target).value)"
              (keydown.enter)="onEnter($any($event))"
            ></textarea>
            <div class="ai-chat__actions">
              @if (busy()) {
                <button type="button" class="ai-chat__btn" (click)="store.stop(game.gameId)">
                  <i class="pi pi-stop-circle" aria-hidden="true"></i> Stop
                </button>
              } @else {
                <button type="submit" class="ai-chat__btn ai-chat__btn--primary" [disabled]="!canSend()">
                  <i class="pi pi-send" aria-hidden="true"></i> Send
                </button>
              }
              @if (messages().length) {
                <button type="button" class="ai-chat__btn" (click)="store.clear(game.gameId)">New chat</button>
              }
            </div>
          </form>
        }
        @default {
          <p class="ai-chat__empty">Loading the game data…</p>
        }
      }
    </div>
  `,
  styles: `
    .ai-chat {
      /* A skin whose page isn't on its dark surface overrides these. */
      --ai-panel: var(--app-panel);
      --ai-panel-2: var(--app-panel-2);
      --ai-border: var(--app-border);
      --ai-accent: var(--p-primary-color);
      --ai-on-accent: var(--p-primary-contrast-color);
      --ai-danger: var(--app-danger, #ef4444);

      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      height: calc(100dvh - var(--app-bar-h) - 9.5rem);
      min-height: 26rem;

      /* The shell's nav breakpoint: below it the top bar gives way to the tab bar. */
      @media (max-width: 959.98px) {
        height: calc(100dvh - var(--app-tabbar-h) - 7.5rem);
      }

      a { color: var(--ai-accent); }
    }

    %ai-control {
      font: inherit;
      color: inherit;
      background: var(--ai-panel-2);
      border: 1px solid var(--ai-border);
      border-radius: 4px;
    }

    .ai-chat__connection {
      flex: none;
      padding: 0.5rem 0.75rem;
      background: var(--ai-panel);
      border: 1px solid var(--ai-border);
      summary { cursor: pointer; font-size: 0.9rem; }
    }

    .ai-chat__fields {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 0.75rem;
      margin-top: 0.75rem;
      label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; }
      select, input { @extend %ai-control; padding: 0.4rem 0.5rem; }
    }

    .ai-chat__key { flex: 1 1 16rem; }

    .ai-chat__fine { margin: 0.6rem 0 0.15rem; font-size: 0.8rem; opacity: 0.8; }

    .ai-chat__log {
      flex: 1 1 0;
      min-height: 8rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 0.25rem;
    }

    .ai-chat__empty { margin: auto; max-width: 36rem; text-align: center; }

    .ai-chat__suggestions { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; }

    .ai-msg {
      max-width: min(46rem, 92%);
      padding: 0.6rem 0.85rem;
      overflow-wrap: anywhere;
    }

    .ai-msg--user {
      align-self: flex-end;
      white-space: pre-wrap;
      color: var(--ai-on-accent);
      background: var(--ai-accent);
    }

    .ai-msg--assistant {
      align-self: flex-start;
      background: var(--ai-panel);
      border: 1px solid var(--ai-border);
    }

    .ai-msg--notice { align-self: center; margin: 0; font-size: 0.85rem; opacity: 0.8; }

    .ai-msg__lookups {
      margin: 0 0 0.4rem;
      padding: 0;
      list-style: none;
      font-size: 0.8rem;
      opacity: 0.75;
      i { font-size: 0.7rem; }
    }

    .ai-msg__thinking { margin: 0; opacity: 0.7; }
    .ai-msg__error { margin: 0.4rem 0; color: var(--ai-danger); }

    .ai-msg__body {
      > :first-child { margin-top: 0; }
      > :last-child { margin-bottom: 0; }
      p, ul, ol, pre { margin: 0.5rem 0; }
      ul, ol { padding-left: 1.25rem; }
      h4 { margin: 0.75rem 0 0.25rem; font-size: 1em; }
      code { font-family: var(--app-font-data, monospace); font-size: 0.9em; }
      pre { overflow-x: auto; padding: 0.5rem; background: var(--ai-panel-2); }
      .ai-table { overflow-x: auto; margin: 0.5rem 0; }
      table { border-collapse: collapse; font-size: 0.9em; }
      th, td { padding: 0.25rem 0.5rem; border: 1px solid var(--ai-border); text-align: left; }
    }

    .ai-chat__composer {
      flex: none;
      display: flex;
      align-items: flex-end;
      gap: 0.5rem;
      textarea { @extend %ai-control; flex: 1; min-width: 0; padding: 0.5rem; resize: vertical; }
    }

    .ai-chat__actions { display: flex; flex-direction: column; gap: 0.35rem; }

    .ai-chat__btn {
      @extend %ai-control;
      padding: 0.4rem 0.7rem;
      cursor: pointer;
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    .ai-chat__btn--primary {
      color: var(--ai-on-accent);
      background: var(--ai-accent);
      border-color: var(--ai-accent);
    }
  `,
})
export class AiChat {
  protected readonly game = inject(GAME_AI);
  protected readonly store = inject(AiChatStore);
  protected readonly settings = inject(AiSettingsStore);

  protected readonly providers = Object.values(AI_PROVIDERS) as readonly { id: AiProviderId; label: string }[];
  protected readonly messages = this.store.messages(this.game.gameId);
  protected readonly busy = this.store.busy(this.game.gameId);
  protected readonly draft = signal('');
  protected readonly canSend = computed(() => this.settings.connected() && this.draft().trim() !== '');
  protected readonly model = computed(
    () => this.settings.providerInfo().models.find((m) => m.id === this.settings.model())?.label ?? this.settings.model(),
  );

  private readonly log = viewChild<ElementRef<HTMLElement>>('log');

  constructor() {
    // Follow a growing reply, unless the player has scrolled up to read.
    let lastHeight = 0;
    afterRenderEffect(() => {
      this.messages();
      const el = this.log()?.nativeElement;
      if (!el) return;
      const wasNearBottom = lastHeight - el.scrollTop - el.clientHeight < 80;
      if (wasNearBottom) el.scrollTop = el.scrollHeight;
      lastHeight = el.scrollHeight;
    });
  }

  protected send(text: string): void {
    void this.store.send(this.game, text);
  }

  protected sendDraft(): void {
    if (!this.canSend() || this.busy()) return;
    this.send(this.draft());
    this.draft.set('');
  }

  protected retry(): void {
    void this.store.retry(this.game);
  }

  protected onEnter(event: KeyboardEvent): void {
    if (event.shiftKey || event.isComposing) return;
    event.preventDefault();
    this.sendDraft();
  }
}
