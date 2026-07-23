/**
 * Gallows / skill transfer (§6.6, task 54).
 *
 * The Gallows (the guillotine in the Velvet Room) is a **separate operation from
 * fusion**: sacrifice persona *S* to strengthen *T*, granting EXP and optionally
 * transferring **one** of *S*'s skills onto *T*. This module answers the only
 * mechanically precise question — *which of S's skills could transfer* — through
 * §6.6's two-part eligibility check:
 *
 *  1. the skill must be **inheritable** by *T*'s inherit type (the same §6.5
 *     matrix the fusion calculator uses, reused verbatim via {@link skillEligibility});
 *  2. *T* must have a **free skill slot**.
 *
 * A skill *T* already carries is a no-op transfer, reported as `already-known`.
 *
 * The EXP half of §6.6 is intentionally absent: no gallows-EXP formula exists in
 * upstream (our single source of truth), so per principle 5 we do not invent one,
 * and nothing here computes on Fusion Alarm. The alarm's one sourced effect —
 * substantially increasing the yield — is a qualitative UI note, not an input to
 * this pure result, so it is not threaded through.
 *
 * Pure like the rest of `fusion/`: zero Angular, zero I/O. The engine resolves a
 * persona's current skills (registered or native) and hands the plain data here.
 */
import type { InheritMatrix, Persona, Skill } from '../model';
import type { SkillId } from '../model/ids';
import { skillEligibility } from './inherit';
import { SKILL_SLOT_CAPACITY } from './types';
import type { GallowsPlan, GallowsSkillOption } from './types';

/**
 * Plan a Gallows sacrifice of `sacrifice`'s skills onto `target` (§6.6).
 *
 * @param matrix          the §6.5 inherit permission matrix
 * @param target          the persona being strengthened — supplies the inherit type
 * @param sacrificeId     the persona being sacrificed (echoed onto the plan)
 * @param sacrificeSkills the sacrifice's current skills (registered or native)
 * @param targetSkillIds  the target's current skills — the free-slot count and
 *                        the `already-known` check both read this set
 */
export function planGallows(
  matrix: InheritMatrix,
  target: Persona,
  sacrificeId: Persona['id'],
  sacrificeSkills: readonly Skill[],
  targetSkillIds: ReadonlySet<SkillId>,
): GallowsPlan {
  const freeSlots = Math.max(0, SKILL_SLOT_CAPACITY - targetSkillIds.size);

  const skills: GallowsSkillOption[] = sacrificeSkills.map((skill): GallowsSkillOption => {
    // A skill the target already has cannot be usefully transferred — report it
    // as such rather than as (in)eligible, whatever its element or uniqueness.
    // Otherwise the §6.5 verdict is exactly the gallows verdict, returned as-is.
    if (targetSkillIds.has(skill.id)) {
      return { skillId: skill.id, eligible: false, reason: 'already-known' };
    }
    return skillEligibility(matrix, target.inheritType, skill);
  });

  return { sacrificeId, targetId: target.id, freeSlots, skills };
}
