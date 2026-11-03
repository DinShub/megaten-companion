import { computed, inject, Injectable, signal } from '@angular/core';

import type { StorageSchema } from '../../../core/storage/storage-envelope';
import { StorageService } from '../../../core/storage/storage.service';
import type { CompendiumEntry, DemonId, Profile } from '../model';
import { Smt1SettingsStore } from '../settings/smt1-settings.store';
import { SMT1_COMPENDIUM } from '../smt1.storage';
import { normalizeEntry } from './smt1-entries';

/**
 * What the SMT1 compendium persists (under its own `smt1-compendium` key). SMT1
 * demons keep a fixed level and skills, so an entry is a tick plus a note
 * (§17.1 A3). The hero level lives in {@link Smt1SettingsStore} and is folded in
 * only at export.
 */
interface StoredCompendium {
  readonly id: string;
  readonly name: string;
  readonly entries: readonly CompendiumEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

const SCHEMA: StorageSchema<StoredCompendium> = {
  key: SMT1_COMPENDIUM.key,
  currentVersion: SMT1_COMPENDIUM.version,
  migrations: {},
};

function emptyCompendium(): StoredCompendium {
  const now = new Date().toISOString();
  return { id: 'default', name: 'My Compendium', entries: [], createdAt: now, updatedAt: now };
}

/** The user's owned demons. Signal-based, persisted through the debounced storage layer. */
@Injectable({ providedIn: 'root' })
export class Smt1CompendiumStore {
  private readonly storage = inject(StorageService);
  private readonly settings = inject(Smt1SettingsStore);
  private readonly state = signal<StoredCompendium>(this.load());

  readonly name = computed(() => this.state().name);
  readonly entries = computed(() => this.state().entries);
  readonly count = computed(() => this.state().entries.length);
  readonly updatedAt = computed(() => this.state().updatedAt);

  readonly entryMap = computed<ReadonlyMap<DemonId, CompendiumEntry>>(
    () => new Map(this.state().entries.map((e) => [e.demonId, e] as const)),
  );
  readonly ownedIds = computed<ReadonlySet<DemonId>>(() => new Set(this.state().entries.map((e) => e.demonId)));

  has(demonId: DemonId): boolean {
    return this.entryMap().has(demonId);
  }

  entryFor(demonId: DemonId): CompendiumEntry | undefined {
    return this.entryMap().get(demonId);
  }

  /** Tick or untick a demon. Unticking drops its note too. */
  setOwned(demonId: DemonId, owned: boolean): void {
    if (owned === this.has(demonId)) return;
    const entries = owned
      ? [...this.state().entries, { demonId, note: '', addedAt: new Date().toISOString() }]
      : this.state().entries.filter((e) => e.demonId !== demonId);
    this.commit({ entries });
  }

  setNote(demonId: DemonId, note: string): void {
    const entries = this.state().entries.map((e) => (e.demonId === demonId ? normalizeEntry({ ...e, note }) : e));
    this.commit({ entries });
  }

  rename(name: string): void {
    this.commit({ name: name.trim() || 'My Compendium' });
  }

  clear(): void {
    if (this.state().entries.length > 0) this.commit({ entries: [] });
  }

  buildProfile(): Profile {
    const s = this.state();
    return {
      id: s.id,
      name: s.name,
      gameId: 'smt1',
      heroLevel: this.settings.heroLevel(),
      entries: s.entries,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  /** Apply a validated import atomically: `replace` swaps the profile, `merge` overlays entries. */
  applyImport(profile: Profile, mode: 'replace' | 'merge'): void {
    if (mode === 'replace') {
      this.state.set({
        id: profile.id,
        name: profile.name,
        entries: profile.entries.map(normalizeEntry),
        createdAt: profile.createdAt,
        updatedAt: new Date().toISOString(),
      });
      this.settings.setHeroLevel(profile.heroLevel);
      this.persist();
      return;
    }
    const byId = new Map(this.state().entries.map((e) => [e.demonId, e] as const));
    for (const e of profile.entries) byId.set(e.demonId, normalizeEntry(e));
    this.commit({ entries: [...byId.values()] });
  }

  private commit(patch: Partial<StoredCompendium>): void {
    this.state.update((s) => ({ ...s, ...patch, updatedAt: new Date().toISOString() }));
    this.persist();
  }

  private persist(): void {
    this.storage.write(SCHEMA, this.state());
  }

  private load(): StoredCompendium {
    const read = this.storage.read(SCHEMA);
    if (read.status !== 'ok') return emptyCompendium();
    const entries = Array.isArray(read.data.entries) ? read.data.entries.map(normalizeEntry) : [];
    return { ...emptyCompendium(), ...read.data, entries };
  }
}
