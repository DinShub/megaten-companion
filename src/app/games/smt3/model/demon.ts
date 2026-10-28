import type {
  Affinity,
  AilmentId,
  CoreStats,
  DemonId,
  ElementId,
  InheritCategoryId,
  RaceId,
  SkillId,
  Stats,
  UnlockGroup,
} from './ids';

/** Innate skills keep their upstream order; the rest are learned at a level. */
export type Acquisition =
  | { readonly kind: 'innate'; readonly order: number }
  | { readonly kind: 'level'; readonly level: number };

export type LearnedSkill = { readonly skillId: SkillId } & Acquisition;

/**
 * How a demon is obtained, decoded from upstream's special-recipe and evolution
 * data (there is no explicit flag upstream):
 *  - `normal`    — the race chart can produce it;
 *  - `element`   — same-race fusion yields it;
 *  - `mitama`    — two elements fused together;
 *  - `special`   — one or more fixed two-demon recipes;
 *  - `fiend`     — a Deathstone fusion during a Kagutsuchi phase;
 *  - `evolution` — only by evolving another demon;
 *  - `recruit`   — never fused (Dante/Raidou, the Shady Broker variants…).
 */
export type DemonKind = 'normal' | 'element' | 'mitama' | 'special' | 'fiend' | 'evolution' | 'recruit';

export interface DemonUnlock {
  readonly group: UnlockGroup;
  readonly condition: string;
}

export interface EvolutionLink {
  readonly demonId: DemonId;
  /** The level the source demon evolves at. */
  readonly level: number;
}

/** Field encounter data (upstream `demon-extras.json`). */
export interface EnemyData {
  readonly hp: number | null;
  readonly mp: number | null;
  readonly exp: number | null;
  readonly macca: number | null;
  readonly drops: readonly string[];
  readonly skillIds: readonly SkillId[];
  readonly locations: readonly string[];
}

export interface Demon {
  readonly id: DemonId;
  readonly name: string;
  readonly race: RaceId;
  /** Base level. Compendium entries may register a higher one. */
  readonly level: number;
  readonly stats: Stats;
  readonly affinities: Readonly<Record<ElementId, Affinity>>;
  /** Only the non-neutral ailment resistances; most demons have none. */
  readonly ailments: Readonly<Partial<Record<AilmentId, Affinity>>>;
  /** Body-type categories this demon can inherit (§ inheritance). */
  readonly inherits: readonly InheritCategoryId[];
  readonly learnedSkills: readonly LearnedSkill[];
  readonly kind: DemonKind;
  readonly unlock: DemonUnlock | null;
  /** Extra fusion condition upstream records (e.g. "Sacrifice Ame-no-Uzume"). */
  readonly prereq: string | null;
  readonly evolvesTo: EvolutionLink | null;
  readonly evolvesFrom: EvolutionLink | null;
  readonly enemy: EnemyData | null;
  /** Negotiation personality (`gentle`, `hee-ho`, …). */
  readonly personality: string | null;
  readonly age: 'adult' | 'youth' | 'child' | null;
  readonly gender: 'male' | 'female' | null;
}

export interface Magatama {
  readonly id: string;
  readonly name: string;
  /** Upstream's level for the magatama — the level of its first skill. */
  readonly level: number;
  /** Stat bonuses while equipped. */
  readonly stats: CoreStats;
  readonly affinities: Readonly<Record<ElementId, Affinity>>;
  /**
   * Learned by the Demi-fiend at these levels while the magatama is equipped.
   * `null` is a special unlock upstream encodes but does not explain (Pierce).
   */
  readonly learnedSkills: readonly { readonly skillId: SkillId; readonly level: number | null }[];
  /** Where it is obtained. */
  readonly obtain: string;
}
