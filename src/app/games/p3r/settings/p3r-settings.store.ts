import { computed, inject, Injectable, signal } from '@angular/core';

import type { StorageSchema } from '../../../core/storage/storage-envelope';
import { StorageService } from '../../../core/storage/storage.service';
import type { UnlockGroup } from '../model/ids';
import { P3R_SETTINGS } from '../p3r.storage';

/**
 * P3R game settings. Game-scoped,
 * persisted under their own key so they never collide with P5R's.
 */
export interface P3rSettings {
  /** The protagonist's level — P3R refuses a fusion whose result is above it. 1–99. */
  readonly protagonistLevel: number;
  /** When false, level-capped fusions are shown as available (theoretical). */
  readonly enforceLevelCap: boolean;
  /**
   * Upstream's four unlock categories. Story, Social Link and teammate link
   * default on; DLC defaults off, as upstream ships it (and as P5R does).
   */
  readonly unlockGroups: Readonly<Record<UnlockGroup, boolean>>;
}

export const DEFAULT_P3R_SETTINGS: P3rSettings = {
  protagonistLevel: 1,
  enforceLevelCap: true,
  unlockGroups: { story: true, 'social-link': true, 'teammate-link': true, dlc: false },
};

const SCHEMA: StorageSchema<P3rSettings> = { key: P3R_SETTINGS.key, currentVersion: P3R_SETTINGS.version, migrations: {} };

const MIN_LEVEL = 1;
const MAX_LEVEL = 99;

@Injectable({ providedIn: 'root' })
export class P3rSettingsStore {
  private readonly storage = inject(StorageService);
  private readonly state = signal<P3rSettings>(this.load());

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
    this.state.set(DEFAULT_P3R_SETTINGS);
  }

  private patch(partial: Partial<P3rSettings>): void {
    this.state.update((s) => ({ ...s, ...partial }));
    this.storage.write(SCHEMA, this.state());
  }

  private load(): P3rSettings {
    const read = this.storage.read(SCHEMA);
    if (read.status !== 'ok') return DEFAULT_P3R_SETTINGS;
    return {
      ...DEFAULT_P3R_SETTINGS,
      ...read.data,
      unlockGroups: { ...DEFAULT_P3R_SETTINGS.unlockGroups, ...read.data.unlockGroups },
    };
  }
}
