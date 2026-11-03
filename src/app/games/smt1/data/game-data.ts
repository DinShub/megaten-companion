import type { Demon, ElementChart, FusionChart, GameDataMeta, Races, Skill, SpecialRecipes, TripleChart } from '../model';

/**
 * Every SMT1 dataset, in memory, after a successful load. The shapes are the
 * model exactly — the importer already decoded every packed upstream
 * representation, so the app does no transformation on load.
 */
export interface LoadedSmt1Data {
  readonly demons: readonly Demon[];
  readonly skills: readonly Skill[];
  readonly races: Races;
  readonly fusionChart: FusionChart;
  readonly tripleChart: TripleChart;
  readonly elementChart: ElementChart;
  readonly specialRecipes: SpecialRecipes;
  readonly meta: GameDataMeta;
}

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
