import type {
  Demon,
  ElementChart,
  FusionChart,
  GameDataMeta,
  Magatama,
  Skill,
  SpecialRecipes,
} from '../model';

/**
 * Every Nocturne dataset, in memory, after a successful load. The shapes are
 * the model exactly — the importer already decoded every packed upstream
 * representation, so the app does no transformation on load.
 */
export interface LoadedSmt3Data {
  readonly demons: readonly Demon[];
  readonly skills: readonly Skill[];
  readonly magatama: readonly Magatama[];
  readonly fusionChart: FusionChart;
  readonly elementChart: ElementChart;
  readonly specialRecipes: SpecialRecipes;
  readonly meta: GameDataMeta;
}

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
