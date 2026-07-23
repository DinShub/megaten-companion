import { computed, inject, Injectable } from '@angular/core';

import type { PickerOption } from '../../../../shared/persona-picker/persona-picker';
import { CompendiumStore } from '../../compendium/compendium.store';
import { GameDataService } from '../../data/game-data.service';
import { FusionEngine } from '../../fusion';
import type { FusionContext } from '../../fusion';
import type { CompendiumEntry, InheritTypeId, Persona, PersonaId, Shadow, Skill, Trait } from '../../model';
import { SettingsStore } from '../../settings/settings.store';
import { inheritRow, titleCase } from '../../ui/format';

/**
 * The thin Angular seam over the pure §6 fusion engine (Phase 6). The engine
 * itself is framework-free (`games/p5r/fusion/`); this store is the only place
 * that couples it to Angular — it constructs a {@link FusionEngine} from the
 * loaded datasets and threads a reactive {@link FusionContext} built from the
 * settings and compendium stores (§6.9). The three calculator pages read from
 * here rather than touching the engine or the data service directly.
 *
 * `providedIn: 'root'` but referenced only from the lazy `pages/fusion/`
 * components, so it (and the engine it pulls in) stays out of the eager `main`
 * chunk — the fusion engine finally leaves the tree-shake shadow it sat in
 * through Phase 5, landing in the lazy fusion chunk, not the initial bundle.
 *
 * The singleton lifetime matters: the engine is rebuilt only when the datasets
 * (re)load, so its per-unlock arcana caches and the memoised `recipesFor`
 * results survive both a settings change *and* a switch between the calculator,
 * reverse and itemization tabs.
 */
@Injectable({ providedIn: 'root' })
export class FusionStore {
  private readonly gameData = inject(GameDataService);
  private readonly settings = inject(SettingsStore);
  private readonly compendium = inject(CompendiumStore);

  /**
   * The pure engine, rebuilt only when the datasets change (which happens once
   * per session). Deliberately independent of settings/compendium so the
   * engine's internal caches persist across every context change.
   */
  readonly engine = computed<FusionEngine | null>(() => {
    const data = this.gameData.data();
    return data ? new FusionEngine(data) : null;
  });

  /** The per-search context (§6.9), rebuilt from settings + the compendium. */
  readonly ctx = computed<FusionContext>(() => ({
    pool: 'compendium',
    protagonistLevel: this.settings.protagonistLevel(),
    enforceLevelCap: this.settings.enforceLevelCap(),
    unlockGroups: this.settings.unlockGroups(),
    alarm: this.settings.alarm(),
    compendium: this.compendium.entryMap(),
  }));

  /** Fusion Alarm toggle (§6.7) — drives the "alarm variant" panels. */
  readonly alarm = this.settings.alarm;
  readonly enforceLevelCap = this.settings.enforceLevelCap;
  readonly protagonistLevel = this.settings.protagonistLevel;

  /** persona id → entry, for the ownership badges every fusion surface carries. */
  readonly ownedEntries = this.compendium.entryMap;

  readonly personasById = computed<ReadonlyMap<PersonaId, Persona>>(() => {
    const m = new Map<PersonaId, Persona>();
    for (const p of this.gameData.data()?.personas ?? []) m.set(p.id, p);
    return m;
  });

  readonly skillsById = computed<ReadonlyMap<string, Skill>>(() => {
    const m = new Map<string, Skill>();
    for (const s of this.gameData.data()?.skills ?? []) m.set(s.id, s);
    return m;
  });

  readonly traitsById = computed<ReadonlyMap<string, Trait>>(() => {
    const m = new Map<string, Trait>();
    for (const t of this.gameData.data()?.traits ?? []) m.set(t.id, t);
    return m;
  });

  /** For the itemization reverse index's negotiation sources (§6.7, task 43). */
  readonly shadowsById = computed<ReadonlyMap<string, Shadow>>(() => {
    const m = new Map<string, Shadow>();
    for (const s of this.gameData.data()?.shadows ?? []) m.set(s.id, s);
    return m;
  });

  /** The nine treasure demons (§6.1) — so the UI can flag a downward shift. */
  readonly treasureIds = computed<ReadonlySet<PersonaId>>(
    () => new Set(this.gameData.data()?.advancedRecipes.treasureIds ?? []),
  );

  /** The whole roster as picker options, badged by ownership (§4.7 pickers). */
  readonly pickerOptions = computed<PickerOption[]>(() => {
    const owned = this.compendium.entryMap();
    return (this.gameData.data()?.personas ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      arcana: titleCase(p.arcana),
      owned: owned.has(p.id),
      level: owned.get(p.id)?.level ?? null,
    }));
  });

  persona(id: PersonaId): Persona | undefined {
    return this.personasById().get(id);
  }

  personaName(id: PersonaId): string {
    return this.personasById().get(id)?.name ?? id;
  }

  skill(id: string): Skill | undefined {
    return this.skillsById().get(id);
  }

  traitName(id: string | null): string | null {
    if (!id) return null;
    return this.traitsById().get(id)?.name ?? id;
  }

  /** The resolved 12-axis inherit permission row for a type (§6.5), for the mask. */
  inheritMask(type: InheritTypeId): Readonly<Record<string, boolean>> {
    const matrix = this.gameData.data()?.inheritMatrix;
    return matrix ? inheritRow(matrix, type) : {};
  }

  entryFor(id: PersonaId): CompendiumEntry | undefined {
    return this.compendium.entryMap().get(id);
  }
}
