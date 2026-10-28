import { computed, inject, Injectable, signal } from '@angular/core';

import type { StorageSchema } from '../../../core/storage/storage-envelope';
import { StorageService } from '../../../core/storage/storage.service';
import type { UnlockGroup } from '../model/ids';

/**
 * P5R game settings (§4.8). The look is not a setting — it is fixed by the game
 * definition (`theme.skin`). Everything below is game-scoped, which is why the
 * store sits under `games/p5r/`: the unlock groups, the level cap and the
 * Fusion Alarm are all Persona-5-Royal concepts.
 */
export interface GameSettings {
  /** Gates fusion results (§6.3). 1–99. */
  readonly protagonistLevel: number;
  /** When false, level-capped fusions are shown as available (theoretical). */
  readonly enforceLevelCap: boolean;
  /** Story and Confidant default on, DLC off (§4.8 / §15). */
  readonly unlockGroups: Readonly<Record<UnlockGroup, boolean>>;
  /** Threaded through fusion and itemization (§6.7). */
  readonly alarm: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  protagonistLevel: 1,
  enforceLevelCap: true,
  unlockGroups: { story: true, confidant: true, dlc: false },
  alarm: false,
};

const SCHEMA: StorageSchema<GameSettings> = { key: 'settings', currentVersion: 1, migrations: {} };

const MIN_LEVEL = 1;
const MAX_LEVEL = 99;

/**
 * Signal-based settings store (task 17). Reads once on construction and writes
 * back through the debounced storage layer on every change, so settings survive
 * a reload. Downstream indexes (task 13) read {@link unlockGroups} directly, so
 * flipping a toggle here rebuilds `resultsByArcana`.
 */
@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly storage = inject(StorageService);
  private readonly state = signal<GameSettings>(this.load());

  readonly settings = this.state.asReadonly();
  readonly protagonistLevel = computed(() => this.state().protagonistLevel);
  readonly enforceLevelCap = computed(() => this.state().enforceLevelCap);
  readonly unlockGroups = computed(() => this.state().unlockGroups);
  readonly alarm = computed(() => this.state().alarm);

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

  setAlarm(alarm: boolean): void {
    this.patch({ alarm });
  }

  /** Reset all game settings to defaults (§4.8 "reset all local data"). */
  reset(): void {
    this.storage.remove(SCHEMA.key);
    this.state.set(DEFAULT_SETTINGS);
  }

  private patch(partial: Partial<GameSettings>): void {
    this.state.update((s) => ({ ...s, ...partial }));
    this.storage.write(SCHEMA, this.state());
  }

  private load(): GameSettings {
    const read = this.storage.read(SCHEMA);
    if (read.status !== 'ok') return DEFAULT_SETTINGS;
    // Defensive merge: a partial payload keeps its stored fields, defaults fill gaps.
    return {
      ...DEFAULT_SETTINGS,
      ...read.data,
      unlockGroups: { ...DEFAULT_SETTINGS.unlockGroups, ...read.data.unlockGroups },
    };
  }
}
