import type { Affinity, Alignment, Combat, DemonId, ElementId, LawAxis, LightAxis, RaceId, SkillElementId, SkillId, SpeciesId, Stats } from './ids';

/**
 * How a demon is obtained. Upstream's SMT1 module marks Messian and Gaean
 * demons recruit-only and Machines enemy-only; every other demon is a fusion
 * result (special recipes add a way, they don't take the chart's away).
 */
export type DemonKind = 'normal' | 'recruit' | 'enemy';

export interface Demon {
  readonly id: DemonId;
  readonly name: string;
  /** Katakana name, from upstream's `jap-demons.json`. */
  readonly jp: string | null;
  readonly race: RaceId;
  /**
   * Upstream's level, which keeps a decimal tie-break where two demons of one
   * race would otherwise share a level (Lakshmi 64.1). Fusion maths uses it as
   * is; pages print {@link displayLevel}.
   */
  readonly level: number;
  readonly alignment: Alignment;
  readonly affinities: Readonly<Record<ElementId, Affinity>>;
  /** SMT1 demons know a fixed set of up to three skills; nothing is learned or inherited. */
  readonly skillIds: readonly SkillId[];
  readonly stats: Stats;
  readonly combat: Combat;
  readonly drop: string | null;
  readonly kind: DemonKind;
  /** A fusion condition upstream records as text ("Undead x Undead x Undead"). */
  readonly prereq: string | null;
}

/** The level a page prints: upstream's tie-break decimals dropped. */
export const displayLevel = (demon: Pick<Demon, 'level'>): number => Math.floor(demon.level);

export interface Skill {
  readonly id: SkillId;
  readonly name: string;
  readonly jp: string | null;
  readonly element: SkillElementId;
  /** MP cost; null for a free ability (breaths, physical attacks). */
  readonly mp: number | null;
  readonly power: number | null;
  /** "1 Foe", "1 Row of Foes", "All Allies"…; null for field skills. */
  readonly target: string | null;
  readonly effect: string | null;
  /** Upstream's `enemy` flag: only enemies use it. */
  readonly enemyOnly: boolean;
}

export interface SpeciesInfo {
  readonly id: SpeciesId;
  readonly name: string;
  readonly raceIds: readonly RaceId[];
}

/** A race, with its species and the race's own alignment (dark races fuse by their own rule). */
export interface RaceInfo {
  readonly id: RaceId;
  readonly name: string;
  readonly species: SpeciesId;
  readonly light: LightAxis;
  readonly law: LawAxis;
}

export interface Races {
  readonly species: readonly SpeciesInfo[];
  readonly races: readonly RaceInfo[];
}
