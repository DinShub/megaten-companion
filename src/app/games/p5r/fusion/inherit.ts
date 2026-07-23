/**
 * Skill inheritance eligibility (§6.5, task 37).
 *
 * The rule that makes the route finder non-trivial. A persona can *receive* a
 * skill iff its 14-way inherit type permits the skill's element **and** the skill
 * is not `unique`. Skills with `inheritElement: null` (passives, almighty,
 * support) are not element-gated — only `unique` blocks them, matching upstream's
 * "no inherit bit ⇒ always inheritable" branch.
 *
 * ⚠️ The §6.5 *prose* ("a fire persona cannot inherit fire skills") is wrong; the
 * §6.5 *table* and upstream `comp-config.json` show an elemental type blocks the
 * **opposing** element — `fire` inherits fire but not ice, `ice` inherits ice but
 * not fire. Per "upstream wins", the committed `inherit-matrix.json` transcribes
 * the table, and this module reads that matrix. Never re-derive from the prose.
 */
import type { InheritMatrix, Skill } from '../model';
import type { InheritTypeId } from '../model/ids';
import type { SkillEligibility } from './types';

/**
 * Can a persona of `inheritType` receive `skill`? The pure §6.5 predicate.
 *
 * `unique` blocks unconditionally. A null `inheritElement` is not element-gated.
 * Otherwise the answer is the matrix cell `matrix[inheritType][inheritElement]`.
 */
export function canInherit(
  matrix: InheritMatrix,
  inheritType: InheritTypeId,
  skill: Skill,
): boolean {
  if (skill.unique) return false;
  if (skill.inheritElement === null) return true;
  return matrix[inheritType][skill.inheritElement] === true;
}

/** {@link canInherit} with the blocking reason attached, for the greyed-out UI (§4.7.1). */
export function skillEligibility(
  matrix: InheritMatrix,
  inheritType: InheritTypeId,
  skill: Skill,
): SkillEligibility {
  if (skill.unique) {
    return { skillId: skill.id, eligible: false, reason: 'unique' };
  }
  if (skill.inheritElement === null) {
    return { skillId: skill.id, eligible: true };
  }
  if (matrix[inheritType][skill.inheritElement] === true) {
    return { skillId: skill.id, eligible: true };
  }
  return {
    skillId: skill.id,
    eligible: false,
    reason: 'blocked-element',
    blockingElement: skill.inheritElement,
  };
}
