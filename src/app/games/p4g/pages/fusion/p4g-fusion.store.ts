import { computed, inject, Injectable } from '@angular/core';

import type { PickerOption } from '../../../../shared/persona-picker/persona-picker';
import { P4gCompendiumStore } from '../../compendium/p4g-compendium.store';
import { P4gDataService } from '../../data/p4g-data.service';
import { FusionEngine, type FusionContext, type Recipe } from '../../fusion';
import type { InheritMatrix, Persona, PersonaId, Skill } from '../../model';
import { P4gSettingsStore } from '../../settings/p4g-settings.store';
import { arcanaLabel } from '../../ui/p4g-format';

/**
 * The thin Angular seam over the pure P4G engine. The engine is rebuilt
 * only when the datasets (re)load, so its memoised recipe listings survive
 * settings changes and tab switches; the context is a computed over the
 * settings and compendium stores. Referenced only from lazy pages, so the
 * engine stays out of the eager bundle.
 */
@Injectable({ providedIn: 'root' })
export class P4gFusionStore {
  private readonly gameData = inject(P4gDataService);
  private readonly settings = inject(P4gSettingsStore);
  private readonly compendium = inject(P4gCompendiumStore);

  readonly engine = computed<FusionEngine | null>(() => {
    const data = this.gameData.data();
    return data ? new FusionEngine(data) : null;
  });

  readonly ctx = computed<FusionContext>(() => ({
    protagonistLevel: this.settings.protagonistLevel(),
    enforceLevelCap: this.settings.enforceLevelCap(),
    unlockGroups: this.settings.unlockGroups(),
    compendium: this.compendium.entryMap(),
  }));

  readonly protagonistLevel = this.settings.protagonistLevel;
  readonly ownedEntries = this.compendium.entryMap;
  readonly personasById = this.gameData.personasById;
  readonly skillsById = this.gameData.skillsById;
  readonly inheritMatrix = computed<InheritMatrix>(() => this.gameData.data()?.inheritMatrix ?? ({} as InheritMatrix));

  /** The whole roster as picker options, badged by ownership. */
  readonly pickerOptions = computed<PickerOption[]>(() => {
    const owned = this.compendium.entryMap();
    return (this.gameData.data()?.personas ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      arcana: `${arcanaLabel(d.arcana)} · Lv ${d.level}`,
      owned: owned.has(d.id),
      level: owned.get(d.id)?.level ?? null,
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

  isOwned(id: PersonaId): boolean {
    return this.compendium.entryMap().has(id);
  }

  ownedLevel(id: PersonaId): number | null {
    return this.compendium.entryMap().get(id)?.level ?? null;
  }

  /** Reverse listing for a target under the current context. */
  recipesFor(id: PersonaId): readonly Recipe[] {
    return this.engine()?.recipesFor(id, this.ctx()) ?? [];
  }

  /** Three-persona triangles for a target — computed on demand, so only call it when shown. */
  trianglesFor(id: PersonaId): readonly Recipe[] {
    return this.engine()?.trianglesFor(id, this.ctx()) ?? [];
  }

  /** The special recipe for a target, if it has one. */
  specialFor(id: PersonaId): Recipe | null {
    return this.engine()?.specialFor(id) ?? null;
  }

  /** Forward listing for a parent under the current context. */
  fusionsFrom(id: PersonaId): readonly Recipe[] {
    return this.engine()?.fusionsFrom(id, this.ctx()) ?? [];
  }

  /**
   * Sort recipes so the most practical come first: fewest unowned
   * ingredients, then by the highest ingredient level (lower is easier).
   */
  rankRecipes(recipes: readonly Recipe[]): Recipe[] {
    const owned = this.compendium.entryMap();
    const score = (r: Recipe): number => {
      const ownedCount = r.ingredientIds.filter((id) => owned.has(id)).length;
      const maxLevel = Math.max(...r.ingredientIds.map((id) => this.persona(id)?.level ?? 99));
      return (r.ingredientIds.length - ownedCount) * 1000 + maxLevel;
    };
    return [...recipes].sort((a, b) => score(a) - score(b));
  }
}
