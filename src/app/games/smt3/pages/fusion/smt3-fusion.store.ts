import { computed, inject, Injectable } from '@angular/core';

import type { PickerOption } from '../../../../shared/persona-picker/persona-picker';
import { Smt3CompendiumStore } from '../../compendium/smt3-compendium.store';
import { Smt3DataService } from '../../data/smt3-data.service';
import { FusionEngine, type FusionContext, type Recipe } from '../../fusion';
import type { Demon, DemonId, Skill } from '../../model';
import { Smt3SettingsStore } from '../../settings/smt3-settings.store';
import { raceLabel } from '../../ui/smt3-format';

/**
 * The thin Angular seam over the pure Nocturne engine. The engine is rebuilt
 * only when the datasets (re)load, so its memoised recipe listings survive
 * settings changes and tab switches; the context is a computed over the
 * settings and compendium stores. Referenced only from lazy pages, so the
 * engine stays out of the eager bundle.
 */
@Injectable({ providedIn: 'root' })
export class Smt3FusionStore {
  private readonly gameData = inject(Smt3DataService);
  private readonly settings = inject(Smt3SettingsStore);
  private readonly compendium = inject(Smt3CompendiumStore);

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
  readonly demonsById = this.gameData.demonsById;
  readonly skillsById = this.gameData.skillsById;

  /** The whole roster as picker options, badged by ownership. */
  readonly pickerOptions = computed<PickerOption[]>(() => {
    const owned = this.compendium.entryMap();
    return (this.gameData.data()?.demons ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      arcana: `${raceLabel(d.race)} · Lv ${d.level}`,
      owned: owned.has(d.id),
      level: owned.get(d.id)?.level ?? null,
    }));
  });

  demon(id: DemonId): Demon | undefined {
    return this.demonsById().get(id);
  }

  demonName(id: DemonId): string {
    return this.demonsById().get(id)?.name ?? id;
  }

  skill(id: string): Skill | undefined {
    return this.skillsById().get(id);
  }

  isOwned(id: DemonId): boolean {
    return this.compendium.entryMap().has(id);
  }

  ownedLevel(id: DemonId): number | null {
    return this.compendium.entryMap().get(id)?.level ?? null;
  }

  /** Reverse listing for a target under the current context. */
  recipesFor(id: DemonId): readonly Recipe[] {
    return this.engine()?.recipesFor(id, this.ctx()) ?? [];
  }

  /** Forward listing for a parent under the current context. */
  fusionsFrom(id: DemonId): readonly Recipe[] {
    return this.engine()?.fusionsFrom(id, this.ctx()) ?? [];
  }

  /**
   * Sort recipes so the most practical come first: pairs you own outright,
   * then one owned, then by the higher ingredient level (lower is easier).
   */
  rankRecipes(recipes: readonly Recipe[]): Recipe[] {
    const owned = this.compendium.entryMap();
    const score = (r: Recipe): number => {
      const ownedCount = r.ingredientIds.filter((id) => owned.has(id)).length;
      const maxLevel = Math.max(...r.ingredientIds.map((id) => this.demon(id)?.level ?? 99));
      return (2 - ownedCount) * 1000 + maxLevel;
    };
    return [...recipes].sort((a, b) => score(a) - score(b));
  }
}
