import type { FusionChart, GameDataMeta, InheritMatrix, Persona, Shadow, Skill, SpecialRecipe } from '../model';

/**
 * Every P3R dataset, in memory, after a successful load. The shapes are the
 * model exactly — the importer already decoded every packed upstream
 * representation, so the app does no transformation on load.
 */
export interface LoadedP3rData {
  readonly personas: readonly Persona[];
  readonly skills: readonly Skill[];
  readonly shadows: readonly Shadow[];
  readonly fusionChart: FusionChart;
  readonly specialRecipes: readonly SpecialRecipe[];
  readonly inheritMatrix: InheritMatrix;
  readonly meta: GameDataMeta;
}

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
