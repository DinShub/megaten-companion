import { computed, inject, Injectable, signal } from '@angular/core';

import type { StorageSchema } from '../../../core/storage/storage-envelope';
import { StorageService } from '../../../core/storage/storage.service';
import type { UnlockGroup } from '../model/ids';

/**
 * Nocturne game settings. Game-scoped (the theme stays global in `core/theme`),
 * persisted under their own key so they never collide with P5R's.
 */
export interface Smt3Settings {
  /** The Demi-fiend's level — Nocturne refuses a fusion whose result is above it. 1–99. */
  readonly protagonistLevel: number;
  /** When false, level-capped fusions are shown as available (theoretical). */
  readonly enforceLevelCap: boolean;
  /** Upstream's three unlock categories; all default on, as upstream ships them. */
  readonly unlockGroups: Readonly<Record<UnlockGroup, boolean>>;
}

export const DEFAULT_SMT3_SETTINGS: Smt3Settings = {
  protagonistLevel: 1,
  enforceLevelCap: true,
  unlockGroups: { story: true, fiend: true, amala: true },
};

const SCHEMA: StorageSchema<Smt3Settings> = { key: 'smt3-settings', currentVersion: 1, migrations: {} };

const MIN_LEVEL = 1;
const MAX_LEVEL = 99;

@Injectable({ providedIn: 'root' })
export class Smt3SettingsStore {
  private readonly storage = inject(StorageService);
  private readonly state = signal<Smt3Settings>(this.load());

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
    this.state.set(DEFAULT_SMT3_SETTINGS);
  }

  private patch(partial: Partial<Smt3Settings>): void {
    this.state.update((s) => ({ ...s, ...partial }));
    this.storage.write(SCHEMA, this.state());
  }

  private load(): Smt3Settings {
    const read = this.storage.read(SCHEMA);
    if (read.status !== 'ok') return DEFAULT_SMT3_SETTINGS;
    return {
      ...DEFAULT_SMT3_SETTINGS,
      ...read.data,
      unlockGroups: { ...DEFAULT_SMT3_SETTINGS.unlockGroups, ...read.data.unlockGroups },
    };
  }
}
