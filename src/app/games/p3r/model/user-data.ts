import type { PersonaId, SkillId } from './ids';

/** One registered persona. Persisted through the storage layer, never fetched. */
export interface CompendiumEntry {
  readonly personaId: PersonaId;
  /** May exceed the persona's base level. */
  readonly level: number;
  readonly skillIds: readonly SkillId[];
}

/** The export/import interchange shape. */
export interface Profile {
  readonly id: string;
  readonly name: string;
  readonly gameId: 'p3r';
  readonly protagonistLevel: number;
  readonly entries: readonly CompendiumEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
