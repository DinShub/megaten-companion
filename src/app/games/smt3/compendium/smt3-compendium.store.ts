import { computed, inject, Injectable, signal } from '@angular/core';

import type { StorageSchema } from '../../../core/storage/storage-envelope';
import { StorageService } from '../../../core/storage/storage.service';
import type { CompendiumEntry, DemonId, Profile } from '../model';
import { Smt3SettingsStore } from '../settings/smt3-settings.store';
import { SMT3_COMPENDIUM } from '../smt3.storage';

/**
 * What the Nocturne compendium persists (under its own `smt3-compendium` key).
 * As for P5R, the Demi-fiend level lives in {@link Smt3SettingsStore} — the one
 * source the fusion engine reads — and is folded in only at export.
 */
interface StoredCompendium {
  readonly id: string;
  readonly name: string;
  readonly entries: readonly CompendiumEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

const SCHEMA: StorageSchema<StoredCompendium> = {
  key: SMT3_COMPENDIUM.key,
  currentVersion: SMT3_COMPENDIUM.version,
  migrations: {},
};

/** Nocturne demons carry at most eight skills. */
export const MAX_SKILLS = 8;

function emptyCompendium(): StoredCompendium {
  const now = new Date().toISOString();
  return { id: 'default', name: 'My Compendium', entries: [], createdAt: now, updatedAt: now };
}

/** The user's registered demons. Signal-based, persisted through the debounced storage layer. */
@Injectable({ providedIn: 'root' })
export class Smt3CompendiumStore {
  private readonly storage = inject(StorageService);
  private readonly settings = inject(Smt3SettingsStore);
  private readonly state = signal<StoredCompendium>(this.load());

  readonly name = computed(() => this.state().name);
  readonly entries = computed(() => this.state().entries);
  readonly count = computed(() => this.state().entries.length);
  readonly updatedAt = computed(() => this.state().updatedAt);

  readonly entryMap = computed<ReadonlyMap<DemonId, CompendiumEntry>>(
    () => new Map(this.state().entries.map((e) => [e.demonId, e] as const)),
  );

  has(demonId: DemonId): boolean {
    return this.entryMap().has(demonId);
  }

  entryFor(demonId: DemonId): CompendiumEntry | undefined {
    return this.entryMap().get(demonId);
  }

  upsert(entry: CompendiumEntry): void {
    const clean = normalizeEntry(entry);
    const rest = this.state().entries.filter((e) => e.demonId !== clean.demonId);
    this.commit({ entries: [...rest, clean] });
  }

  setLevel(demonId: DemonId, level: number): void {
    const entries = this.state().entries.map((e) => (e.demonId === demonId ? normalizeEntry({ ...e, level }) : e));
    this.commit({ entries });
  }

  remove(demonId: DemonId): void {
    const entries = this.state().entries.filter((e) => e.demonId !== demonId);
    if (entries.length !== this.state().entries.length) this.commit({ entries });
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
      gameId: 'smt3',
      protagonistLevel: this.settings.protagonistLevel(),
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
      this.settings.setProtagonistLevel(profile.protagonistLevel);
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

function normalizeEntry(entry: CompendiumEntry): CompendiumEntry {
  return {
    demonId: entry.demonId,
    level: Math.min(99, Math.max(1, Math.floor(entry.level) || 1)),
    skillIds: [...new Set(entry.skillIds)].slice(0, MAX_SKILLS),
  };
}
