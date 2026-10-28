import type { PersonaId, SkillElementId, SkillId } from './ids';

/** Physical skills cost a percentage of max HP; everything else costs SP. */
export interface SkillCost {
  readonly type: 'sp' | 'hp-percent';
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
  /** The persona whose Golden skill card carries this skill; null when none. */
  readonly cardPersonaId: PersonaId | null;
}
