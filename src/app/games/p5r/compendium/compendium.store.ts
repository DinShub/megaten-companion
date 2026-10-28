import { computed, inject, Injectable, signal } from '@angular/core';

import type { StorageSchema } from '../../../core/storage/storage-envelope';
import { StorageService } from '../../../core/storage/storage.service';
import type { CompendiumEntry, PersonaId, Profile } from '../model';
import { P5R_COMPENDIUM } from '../p5r.storage';
import { SettingsStore } from '../settings/settings.store';

/**
 * What the compendium persists under `megaten-companion:v1:compendium`. This is
 * the §5.1 {@link Profile} *minus* `protagonistLevel` and `gameId`:
 *
 *  - `gameId` is implied — this store only ever holds P5R data.
 *  - `protagonistLevel` deliberately lives in {@link SettingsStore}, which is the
 *    single source of truth the fusion engine reads (task 13/17). Duplicating it
 *    here would risk two writers drifting apart. The full {@link Profile} — with
 *    the protagonist level folded back in from settings — is materialised only at
 *    the export/import boundary, where §9.4 requires the complete interchange
 *    shape.
 */
interface StoredCompendium {
  readonly id: string;
  readonly name: string;
  readonly entries: readonly CompendiumEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

const SCHEMA: StorageSchema<StoredCompendium> = {
  key: P5R_COMPENDIUM.key,
  currentVersion: P5R_COMPENDIUM.version,
  migrations: {},
};

const MIN_LEVEL = 1;
const MAX_LEVEL = 99;

function emptyCompendium(): StoredCompendium {
  const now = new Date().toISOString();
  return { id: 'default', name: 'My Compendium', entries: [], createdAt: now, updatedAt: now };
}

/**
 * The user's compendium (§4.6, task 25). Signal-based, single active profile,
 * persisted through the debounced storage layer (task 16) — so a hand-typed
 * roster survives a reload, and a write failure surfaces the storage banner
 * rather than vanishing.
 *
 * Every mutation goes through {@link commit}, which stamps `updatedAt` and
 * schedules a write. Reads expose {@link entryMap} for the O(1) ownership checks
 * that badge every persona across the app (task 30).
 */
@Injectable({ providedIn: 'root' })
export class CompendiumStore {
  private readonly storage = inject(StorageService);
  private readonly settings = inject(SettingsStore);

  private readonly state = signal<StoredCompendium>(this.load());

  readonly name = computed(() => this.state().name);
  readonly entries = computed(() => this.state().entries);
  readonly count = computed(() => this.state().entries.length);
  readonly createdAt = computed(() => this.state().createdAt);
  readonly updatedAt = computed(() => this.state().updatedAt);

  /** persona id → entry, rebuilt on every change. Backs ownership badges/filters. */
  readonly entryMap = computed<ReadonlyMap<PersonaId, CompendiumEntry>>(() => {
    const map = new Map<PersonaId, CompendiumEntry>();
    for (const e of this.state().entries) map.set(e.personaId, e);
    return map;
  });

  /** True when the persona is registered. Reactive via {@link entryMap}. */
  has(personaId: PersonaId): boolean {
    return this.entryMap().has(personaId);
  }

  /** The registered entry for a persona, or undefined. Reactive via {@link entryMap}. */
  entryFor(personaId: PersonaId): CompendiumEntry | undefined {
    return this.entryMap().get(personaId);
  }

  // ---- Mutations --------------------------------------------------------

  /** Insert a new entry or replace the existing one for its persona. */
  upsert(entry: CompendiumEntry): void {
    const clean = normalizeEntry(entry);
    const rest = this.state().entries.filter((e) => e.personaId !== clean.personaId);
    this.commit({ entries: [...rest, clean] });
  }

  /** Patch fields of an existing entry. No-op if the persona isn't registered. */
  update(personaId: PersonaId, patch: Partial<Omit<CompendiumEntry, 'personaId'>>): void {
    let changed = false;
    const entries = this.state().entries.map((e) => {
      if (e.personaId !== personaId) return e;
      changed = true;
      return normalizeEntry({ ...e, ...patch });
    });
    if (changed) this.commit({ entries });
  }

  /** Set an entry's level directly — the management list's inline edit (§4.6). */
  setLevel(personaId: PersonaId, level: number): void {
    this.update(personaId, { level });
  }

  remove(personaId: PersonaId): void {
    const entries = this.state().entries.filter((e) => e.personaId !== personaId);
    if (entries.length !== this.state().entries.length) this.commit({ entries });
  }

  /** Bulk delete for the management list's multi-select (§4.6). */
  removeMany(personaIds: Iterable<PersonaId>): void {
    const drop = new Set(personaIds);
    if (drop.size === 0) return;
    const entries = this.state().entries.filter((e) => !drop.has(e.personaId));
    if (entries.length !== this.state().entries.length) this.commit({ entries });
  }

  rename(name: string): void {
    const trimmed = name.trim();
    this.commit({ name: trimmed || 'My Compendium' });
  }

  /** Remove every entry, keeping the profile identity. */
  clear(): void {
    if (this.state().entries.length > 0) this.commit({ entries: [] });
  }

  // ---- Export / import (§4.6, §9.4) -------------------------------------

  /** The full §5.1 profile, with the protagonist level read from settings. */
  buildProfile(): Profile {
    const s = this.state();
    return {
      id: s.id,
      name: s.name,
      gameId: 'p5r',
      protagonistLevel: this.settings.protagonistLevel(),
      entries: s.entries,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  /**
   * Apply an imported profile (already validated by `parseImport`). `replace`
   * swaps the whole profile and adopts its protagonist level; `merge` keeps the
   * current identity and protagonist level, overlaying imported entries by
   * persona id (imported wins). Applied atomically — the store never lands in a
   * half-imported state.
   */
  applyImport(profile: Profile, mode: 'replace' | 'merge'): void {
    if (mode === 'replace') {
      const entries = profile.entries.map(normalizeEntry);
      this.state.set({
        id: profile.id,
        name: profile.name,
        entries,
        createdAt: profile.createdAt,
        updatedAt: new Date().toISOString(),
      });
      this.settings.setProtagonistLevel(profile.protagonistLevel);
      this.persist();
      return;
    }
    // merge
    const byId = new Map<PersonaId, CompendiumEntry>();
    for (const e of this.state().entries) byId.set(e.personaId, e);
    for (const e of profile.entries) byId.set(e.personaId, normalizeEntry(e));
    this.commit({ entries: [...byId.values()] });
  }

  // ---- Internals --------------------------------------------------------

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
    const base = emptyCompendium();
    const entries = Array.isArray(read.data.entries)
      ? read.data.entries.map(normalizeEntry)
      : base.entries;
    return { ...base, ...read.data, entries };
  }
}

/** Clamp the level and defensively copy the skill list so stored entries are safe. */
function normalizeEntry(entry: CompendiumEntry): CompendiumEntry {
  return {
    personaId: entry.personaId,
    level: Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.floor(entry.level) || MIN_LEVEL)),
    skillIds: [...entry.skillIds],
    traitId: entry.traitId ?? null,
  };
}
