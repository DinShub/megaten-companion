import { computed, inject, Injectable, signal } from '@angular/core';

import type { StorageSchema } from '../../../core/storage/storage-envelope';
import { StorageService } from '../../../core/storage/storage.service';
import type { UnlockGroup } from '../model/ids';
import { P4G_SETTINGS } from '../p4g.storage';

/**
 * P4G game settings. Game-scoped,
 * persisted under their own key so they never collide with P5R's.
 */
export interface P4gSettings {
  /** The protagonist's level — P4G refuses a fusion whose result is above it. 1–99. */
  readonly protagonistLevel: number;
  /** When false, level-capped fusions are shown as available (theoretical). */
  readonly enforceLevelCap: boolean;
  /** Upstream's three unlock categories; all default on, as upstream ships them. */
  readonly unlockGroups: Readonly<Record<UnlockGroup, boolean>>;
}

export const DEFAULT_P4G_SETTINGS: P4gSettings = {
  protagonistLevel: 1,
  enforceLevelCap: true,
  unlockGroups: { story: true, 'social-link': true },
};

const SCHEMA: StorageSchema<P4gSettings> = { key: P4G_SETTINGS.key, currentVersion: P4G_SETTINGS.version, migrations: {} };

const MIN_LEVEL = 1;
const MAX_LEVEL = 99;

@Injectable({ providedIn: 'root' })
export class P4gSettingsStore {
  private readonly storage = inject(StorageService);
  private readonly state = signal<P4gSettings>(this.load());

  readonly settings = this.state.asReadonly();
  readonly protagonistLevel = computed(() => this.state().protagonistLevel);
  readonly enforceLevelCap = computed(() => this.state().enforceLevelCap);
  readonly unlockGroups = computed(() => this.state().unlockGroups);

  setProtagonistLevel(level: number): void {
    const clamped = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.floor(level) || MIN_LEVEL));
    this.patch({ protagonistLevel: clamped });
  }

  setEnforceLevelCap(enforce: boolean): void {
    this.patch({ enforceLevelCap: enforce });
  }

  setUnlockGroup(group: UnlockGroup, enabled: boolean): void {
    this.patch({ unlockGroups: { ...this.state().unlockGroups, [group]: enabled } });
  }

  reset(): void {
    this.storage.remove(SCHEMA.key);
    this.state.set(DEFAULT_P4G_SETTINGS);
  }

  private patch(partial: Partial<P4gSettings>): void {
    this.state.update((s) => ({ ...s, ...partial }));
    this.storage.write(SCHEMA, this.state());
  }

  private load(): P4gSettings {
    const read = this.storage.read(SCHEMA);
    if (read.status !== 'ok') return DEFAULT_P4G_SETTINGS;
    return {
      ...DEFAULT_P4G_SETTINGS,
      ...read.data,
      unlockGroups: { ...DEFAULT_P4G_SETTINGS.unlockGroups, ...read.data.unlockGroups },
    };
  }
}
