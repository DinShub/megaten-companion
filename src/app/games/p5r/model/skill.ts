import type { InheritElementId, PersonaId, ShadowId, SkillElementId, SkillId } from './ids';

/**
 * Upstream packs skill cost as a bare number and unpacks it as
 * `type = v >> 10`, `amount = v & 0x3FF`. Only three types occur in P5R.
 */
export type SkillCostType = 'sp' | 'hp-percent' | 'gauge';

export interface SkillCost {
  readonly type: SkillCostType;
  /** Zero for `gauge`, which is a flat cost with no amount. */
  readonly value: number;
}

/** Where a skill card comes from (§6.6). All three origins exist in the data. */
export interface CardSource {
  readonly kind: 'itemization' | 'itemization-alarm' | 'negotiation';
  /** Persona id for the itemization kinds, shadow id for negotiation. */
  readonly from: PersonaId | ShadowId;
}

export interface Skill {
  readonly id: SkillId;
  readonly name: string;
  readonly element: SkillElementId;
  /** Null ⇒ not element-gated (almighty, support, passive); only `unique` blocks it. */
  readonly inheritElement: InheritElementId | null;
  readonly cost: SkillCost | null;
  /** '1 foe', 'All allies', 'Self', … */
  readonly target: string;
  /** Effect template already interpolated at import. */
  readonly description: string;
  readonly rank: number;
  /** Upstream rank > 89 ⇒ never inheritable. */
  readonly unique: boolean;
  /**
   * Where the physical skill card is found in the world — chests, Jazz Jin
   * dates, Trial of the Dread, fusion accidents. Upstream's `c[2]`. These are
   * places, not the §6.6 card *origins*, which live on `cardSources`.
   */
  readonly cardLocations: readonly string[];
  readonly cardSources: readonly CardSource[];
}

/**
 * Traits share upstream's skill file under element code `tra` and are injected
 * into learn-sets at level 0 there (§8.2 note 5). Here they are a dataset of
 * their own, referenced by `Persona.traitId`. Upstream has no trait *effect*
 * data beyond the rendered description, so traits are displayed, not modelled.
 */
export interface Trait {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly rank: number;
}

/**
 * `roy-accessories.json` — an accessory grants its skill while equipped.
 * Orphaned upstream and unvalidated against the game (§14 Q4); imported because
 * all 125 mappings resolve to real skills.
 */
export interface Accessory {
  readonly id: string;
  readonly name: string;
  readonly skillId: SkillId;
}
