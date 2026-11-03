import { computed, inject, Injectable, signal } from '@angular/core';

import type { StorageSchema } from '../../../core/storage/storage-envelope';
import { StorageService } from '../../../core/storage/storage.service';
import { SMT1_SETTINGS } from '../smt1.storage';

/** SMT1 game settings. Game-scoped, persisted under their own key. */
export interface Smt1Settings {
  /** The hero's level — a fusion result above it is flagged, and the route finder skips it. 1–99. */
  readonly heroLevel: number;
  /** When false, level-capped fusions are shown as available (planning ahead). */
  readonly enforceLevelCap: boolean;
}

export const DEFAULT_SMT1_SETTINGS: Smt1Settings = { heroLevel: 1, enforceLevelCap: true };

const SCHEMA: StorageSchema<Smt1Settings> = { key: SMT1_SETTINGS.key, currentVersion: SMT1_SETTINGS.version, migrations: {} };

const MIN_LEVEL = 1;
const MAX_LEVEL = 99;

@Injectable({ providedIn: 'root' })
export class Smt1SettingsStore {
  private readonly storage = inject(StorageService);
  private readonly state = signal<Smt1Settings>(this.load());

  readonly settings = this.state.asReadonly();
  readonly heroLevel = computed(() => this.state().heroLevel);
  readonly enforceLevelCap = computed(() => this.state().enforceLevelCap);

  setHeroLevel(level: number): void {
    const clamped = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.floor(level) || MIN_LEVEL));
    this.patch({ heroLevel: clamped });
  }

  setEnforceLevelCap(enforce: boolean): void {
    this.patch({ enforceLevelCap: enforce });
  }

  reset(): void {
    this.storage.remove(SCHEMA.key);
    this.state.set(DEFAULT_SMT1_SETTINGS);
  }

  private patch(partial: Partial<Smt1Settings>): void {
    this.state.update((s) => ({ ...s, ...partial }));
    this.storage.write(SCHEMA, this.state());
  }

  private load(): Smt1Settings {
    const read = this.storage.read(SCHEMA);
    return read.status === 'ok' ? { ...DEFAULT_SMT1_SETTINGS, ...read.data } : DEFAULT_SMT1_SETTINGS;
  }
}
