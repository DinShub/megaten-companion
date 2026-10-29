import type { SkillElementId, SkillId } from './ids';

/**
 * Physical skills cost a percentage of max HP, most others SP, and the
 * Theurgies spend the Theurgy gauge.
 */
export interface SkillCost {
  readonly type: 'sp' | 'hp-percent' | 'gauge';
  readonly value: number;
}

export interface Skill {
  readonly id: SkillId;
  readonly name: string;
  readonly element: SkillElementId;
  readonly cost: SkillCost | null;
  /** '1 foe', 'All allies', 'Self', … */
  readonly target: string;
  /** Effect text, rendered at import exactly as upstream renders it. */
  readonly description: string;
  readonly rank: number;
  /** Upstream rank > 89 ⇒ never inheritable. */
  readonly unique: boolean;
  /** Where the skill's card is found: a Shuffle Time card ("Sword 8") or "Skill Mutation". */
  readonly cardSources: readonly string[];
}
