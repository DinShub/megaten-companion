import { computed, inject, Injectable, signal } from '@angular/core';

import type { StorageSchema } from '../storage/storage-envelope';
import { StorageService } from '../storage/storage.service';
import { AI_PROVIDERS, type AiProviderId } from './ai.model';

export interface AiSettings {
  readonly provider: AiProviderId;
  readonly keys: Readonly<Record<AiProviderId, string>>;
  readonly models: Readonly<Record<AiProviderId, string>>;
}

const DEFAULTS: AiSettings = {
  provider: 'anthropic',
  keys: { anthropic: '', gemini: '' },
  models: { anthropic: AI_PROVIDERS.anthropic.models[0].id, gemini: AI_PROVIDERS.gemini.models[0].id },
};

/**
 * Deliberately NOT declared in any game's `storedData`: that list is what backups
 * and Drive sync carry, and an API key must never leave this browser in a file.
 */
export const AI_SETTINGS_KEY = 'ai-settings';
const SCHEMA: StorageSchema<AiSettings> = { key: AI_SETTINGS_KEY, currentVersion: 1, migrations: {} };

/** The chat connection: which provider, its key and its model. Shared by every game. */
@Injectable({ providedIn: 'root' })
export class AiSettingsStore {
  private readonly storage = inject(StorageService);
  private readonly state = signal<AiSettings>(this.load());

  readonly provider = computed(() => this.state().provider);
  readonly providerInfo = computed(() => AI_PROVIDERS[this.state().provider]);
  readonly apiKey = computed(() => this.state().keys[this.state().provider]);
  readonly model = computed(() => this.state().models[this.state().provider]);
  readonly connected = computed(() => this.apiKey() !== '');

  setProvider(provider: AiProviderId): void {
    this.patch({ provider });
  }

  /** Set the current provider's key; pasted keys often bring stray whitespace. */
  setApiKey(key: string): void {
    const { keys, provider } = this.state();
    this.patch({ keys: { ...keys, [provider]: key.trim() } });
  }

  setModel(model: string): void {
    const { models, provider } = this.state();
    this.patch({ models: { ...models, [provider]: model } });
  }

  private patch(partial: Partial<AiSettings>): void {
    this.state.update((s) => ({ ...s, ...partial }));
    this.storage.write(SCHEMA, this.state());
  }

  private load(): AiSettings {
    const read = this.storage.read(SCHEMA);
    if (read.status !== 'ok') return DEFAULTS;
    const stored = read.data;
    const provider = stored.provider in AI_PROVIDERS ? stored.provider : DEFAULTS.provider;
    // A saved model that has since left the list falls back to the default.
    const known = (id: AiProviderId): string =>
      AI_PROVIDERS[id].models.some((m) => m.id === stored.models?.[id]) ? stored.models[id] : DEFAULTS.models[id];
    return {
      provider,
      keys: { ...DEFAULTS.keys, ...stored.keys },
      models: { anthropic: known('anthropic'), gemini: known('gemini') },
    };
  }
}
