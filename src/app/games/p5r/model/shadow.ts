import type {
  Affinity,
  AilmentId,
  ArcanaId,
  ElementId,
  PersonaId,
  ShadowId,
  SkillId,
  Stats,
} from './ids';

export interface ShadowDrops {
  readonly material: string | null;
  readonly armor: string | null;
  /** The skill this shadow will hand over in negotiation, as a card. */
  readonly cardSkillId: SkillId | null;
  /** Upstream's separate `drops` array — consumables and unique gear. */
  readonly items: readonly string[];
}

/** A Mementos request, on sub-bosses only. */
export interface MementosRequest {
  readonly name: string;
  readonly date: string;
  readonly rank: string;
}

export interface Shadow {
  readonly id: ShadowId;
  readonly name: string;
  readonly arcana: ArcanaId;
  readonly level: number;
  readonly hp: number;
  readonly sp: number;
  readonly stats: Stats;
  readonly exp: number;
  readonly yen: number;
  readonly affinities: Readonly<Record<ElementId, Affinity>>;
  readonly ailmentResists: Readonly<Record<AilmentId, boolean>>;
  readonly skillIds: readonly SkillId[];
  readonly drops: ShadowDrops;
  readonly areas: readonly string[];
  readonly kind: 'shadow' | 'subboss';
  /** Present iff `kind === 'subboss'`. */
  readonly request?: MementosRequest;
  /**
   * The persona this shadow registers as. Null when upstream's (unmaintained)
   * `subboss-data.json` names a persona outside the P5R roster.
   */
  readonly personaId: PersonaId | null;
}
