import type { DemonId } from './ids';

/**
 * One owned demon. SMT1 demons keep a fixed level and skills, so an entry is a
 * tick plus the player's own note (§17.1 A3). Persisted, never fetched.
 */
export interface CompendiumEntry {
  readonly demonId: DemonId;
  /** Free text: where it was recruited, what it's for. Empty when none. */
  readonly note: string;
  /** ISO timestamp of the tick. */
  readonly addedAt: string;
}

/** The export/import interchange shape. */
export interface Profile {
  readonly id: string;
  readonly name: string;
  readonly gameId: 'smt1';
  readonly heroLevel: number;
  readonly entries: readonly CompendiumEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
