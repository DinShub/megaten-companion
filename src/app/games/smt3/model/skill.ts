import type { InheritCategoryId, SkillElementId, SkillId } from './ids';

/** Physical skills cost a percentage of max HP; everything else costs MP. */
export interface SkillCost {
  readonly type: 'mp' | 'hp-percent';
  readonly value: number;
}

export interface Skill {
  readonly id: SkillId;
  readonly name: string;
  readonly element: SkillElementId;
  /** Null ⇒ any demon may inherit it (unless `unique`). */
  readonly inheritCategory: InheritCategoryId | null;
  readonly cost: SkillCost | null;
  /** '1 foe', 'All allies', 'Self', … */
  readonly target: string;
  /** Effect text, rendered at import exactly as upstream renders it. */
  readonly description: string;
  readonly rank: number;
  /** Upstream rank > 89 ⇒ never inheritable. */
  readonly unique: boolean;
  /** Null for non-damaging skills. */
  readonly power: number | null;
  readonly hits: { readonly min: number; readonly max: number } | null;
}
