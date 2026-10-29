import { computed, inject, Injectable, signal } from '@angular/core';

import type { StorageSchema } from '../../../core/storage/storage-envelope';
import { StorageService } from '../../../core/storage/storage.service';
import type { CompendiumEntry, PersonaId, Profile } from '../model';
import { P3rSettingsStore } from '../settings/p3r-settings.store';
import { P3R_COMPENDIUM } from '../p3r.storage';

/**
 * What the P3R compendium persists (under its own `p3r-compendium` key).
 * As for P5R, the protagonist level lives in {@link P3rSettingsStore} — the one
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
  key: P3R_COMPENDIUM.key,
  currentVersion: P3R_COMPENDIUM.version,
  migrations: {},
};

/** P3R personas carry at most eight skills. */
export const MAX_SKILLS = 8;

function emptyCompendium(): StoredCompendium {
  const now = new Date().toISOString();
  return { id: 'default', name: 'My Compendium', entries: [], createdAt: now, updatedAt: now };
}

/** The user's registered personas. Signal-based, persisted through the debounced storage layer. */
@Injectable({ providedIn: 'root' })
export class P3rCompendiumStore {
  private readonly storage = inject(StorageService);
  private readonly settings = inject(P3rSettingsStore);
  private readonly state = signal<StoredCompendium>(this.load());

  readonly name = computed(() => this.state().name);
  readonly entries = computed(() => this.state().entries);
  readonly count = computed(() => this.state().entries.length);
  readonly updatedAt = computed(() => this.state().updatedAt);

  readonly entryMap = computed<ReadonlyMap<PersonaId, CompendiumEntry>>(
    () => new Map(this.state().entries.map((e) => [e.personaId, e] as const)),
  );

  has(personaId: PersonaId): boolean {
    return this.entryMap().has(personaId);
  }

  entryFor(personaId: PersonaId): CompendiumEntry | undefined {
    return this.entryMap().get(personaId);
  }

  upsert(entry: CompendiumEntry): void {
    const clean = normalizeEntry(entry);
    const rest = this.state().entries.filter((e) => e.personaId !== clean.personaId);
    this.commit({ entries: [...rest, clean] });
  }

  setLevel(personaId: PersonaId, level: number): void {
    const entries = this.state().entries.map((e) => (e.personaId === personaId ? normalizeEntry({ ...e, level }) : e));
    this.commit({ entries });
  }

  remove(personaId: PersonaId): void {
    const entries = this.state().entries.filter((e) => e.personaId !== personaId);
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
      gameId: 'p3r',
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
    const byId = new Map(this.state().entries.map((e) => [e.personaId, e] as const));
    for (const e of profile.entries) byId.set(e.personaId, normalizeEntry(e));
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
    personaId: entry.personaId,
    level: Math.min(99, Math.max(1, Math.floor(entry.level) || 1)),
    skillIds: [...new Set(entry.skillIds)].slice(0, MAX_SKILLS),
  };
}
