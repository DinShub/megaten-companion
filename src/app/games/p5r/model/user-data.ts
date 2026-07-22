import type { PersonaId, SkillId, TraitId } from './ids';

/** §5.1 — the user's own data. Persisted through the storage layer, never fetched. */
export interface CompendiumEntry {
  readonly personaId: PersonaId;
  /** May exceed the persona's base level. */
  readonly level: number;
  readonly skillIds: readonly SkillId[];
  readonly traitId: TraitId | null;
}

export interface Profile {
  readonly id: string;
  readonly name: string;
  readonly gameId: 'p5r';
  readonly protagonistLevel: number;
  readonly entries: readonly CompendiumEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
