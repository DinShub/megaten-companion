import type {
  Accessory,
  AdvancedRecipes,
  ElementChart,
  FusionChart,
  GameDataMeta,
  InheritMatrix,
  Persona,
  Shadow,
  Skill,
  Trait,
} from '../model';

/**
 * Every P5R dataset, in memory, after a successful load (task 12). The shapes
 * are the §5 model exactly — the importer already decoded every packed
 * representation, so the app does no transformation on load beyond building the
 * §5.2 indexes.
 */
export interface LoadedGameData {
  readonly personas: readonly Persona[];
  readonly skills: readonly Skill[];
  readonly traits: readonly Trait[];
  readonly shadows: readonly Shadow[];
  readonly accessories: readonly Accessory[];
  readonly fusionChart: FusionChart;
  readonly advancedRecipes: AdvancedRecipes;
  readonly elementChart: ElementChart;
  readonly inheritMatrix: InheritMatrix;
  readonly meta: GameDataMeta;
}

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
