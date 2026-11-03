import { computed, inject, Injectable } from '@angular/core';

import type { PickerOption } from '../../../../shared/persona-picker/persona-picker';
import { Smt1CompendiumStore } from '../../compendium/smt1-compendium.store';
import { Smt1DataService } from '../../data/smt1-data.service';
import { FusionEngine, type FusionContext, type Recipe } from '../../fusion';
import type { Demon, DemonId } from '../../model';
import { displayLevel } from '../../model';
import { Smt1SettingsStore } from '../../settings/smt1-settings.store';
import { raceLabel } from '../../ui/smt1-format';

/**
 * The thin Angular seam over the pure SMT1 engine. The engine is rebuilt only
 * when the datasets (re)load, so its memoised pair table survives settings
 * changes and tab switches; the context is a computed over the settings store.
 * Referenced only from lazy pages, so the engine stays out of the eager bundle.
 */
@Injectable({ providedIn: 'root' })
export class Smt1FusionStore {
  private readonly gameData = inject(Smt1DataService);
  private readonly settings = inject(Smt1SettingsStore);
  private readonly compendium = inject(Smt1CompendiumStore);

  readonly engine = computed<FusionEngine | null>(() => {
    const data = this.gameData.data();
    return data ? new FusionEngine(data) : null;
  });

  readonly ctx = computed<FusionContext>(() => ({
    heroLevel: this.settings.heroLevel(),
    enforceLevelCap: this.settings.enforceLevelCap(),
  }));

  readonly heroLevel = this.settings.heroLevel;
  readonly owned = this.compendium.ownedIds;
  readonly demonsById = this.gameData.demonsById;

  /** The whole roster as picker options, badged by ownership. */
  readonly pickerOptions = computed<PickerOption[]>(() => {
    const owned = this.compendium.ownedIds();
    return (this.gameData.data()?.demons ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      arcana: `${raceLabel(d.race)} · Lv ${displayLevel(d)}`,
      owned: owned.has(d.id),
    }));
  });

  demon(id: DemonId): Demon | undefined {
    return this.demonsById().get(id);
  }

  demonName(id: DemonId): string {
    return this.demonsById().get(id)?.name ?? id;
  }

  isOwned(id: DemonId): boolean {
    return this.compendium.ownedIds().has(id);
  }

  pairRecipesFor(id: DemonId): readonly Recipe[] {
    return this.engine()?.pairRecipesFor(id) ?? [];
  }

  tripleRecipesFor(id: DemonId): readonly Recipe[] {
    return this.engine()?.tripleRecipesFor(id, this.ctx()) ?? [];
  }

  /**
   * Most practical first: special recipes, then recipes you own outright, then
   * fewer unowned demons, then the lower top ingredient level.
   */
  rankRecipes(recipes: readonly Recipe[]): Recipe[] {
    const owned = this.compendium.ownedIds();
    const score = (r: Recipe): number => {
      const unowned = r.ingredientIds.filter((id) => !owned.has(id)).length;
      const maxLevel = Math.max(...r.ingredientIds.map((id) => this.demon(id)?.level ?? 99));
      return (r.path === 'special' ? 0 : 1) * 1e6 + unowned * 1000 + maxLevel;
    };
    return [...recipes].sort((a, b) => score(a) - score(b));
  }
}
