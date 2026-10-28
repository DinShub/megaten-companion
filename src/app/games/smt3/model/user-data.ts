import type { DemonId, SkillId } from './ids';

/** One registered demon. Persisted through the storage layer, never fetched. */
export interface CompendiumEntry {
  readonly demonId: DemonId;
  /** May exceed the demon's base level. */
  readonly level: number;
  readonly skillIds: readonly SkillId[];
}

/** The export/import interchange shape. */
export interface Profile {
  readonly id: string;
  readonly name: string;
  readonly gameId: 'smt3';
  readonly protagonistLevel: number;
  readonly entries: readonly CompendiumEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
