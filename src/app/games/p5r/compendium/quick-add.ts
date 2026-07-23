import type { CompendiumEntry, Persona, SkillId } from '../model';
import { acquisitionOrder } from '../ui/format';

/**
 * Pure helpers behind the quick-add flow (§4.6, task 26) and the entry editor's
 * level-raise suggestions (task 27). No Angular, no store — so the "auto-fill
 * matches the native learn-set" and "a level change never silently mutates the
 * skill list" guarantees are properties of tested functions, not template wiring.
 *
 * "Native" here means skills the persona learns on its own: its innate skills
 * plus every level-up skill at or below a level. The non-level acquisitions
 * upstream tags `Fa`/`Tk`/`C1…Cy` (Fusion Alarm itemization, negotiation,
 * Confidant ranks) are *not* native learns and never auto-fill — you get those
 * by other means, so the user adds them deliberately.
 */

/** Skill ids the persona natively knows at `level`, in learn order, de-duplicated. */
export function nativeSkillsUpTo(persona: Persona, level: number): SkillId[] {
  const learned = persona.learnedSkills
    .filter((ls) => ls.kind === 'innate' || (ls.kind === 'level' && ls.level <= level))
    .sort((a, b) => acquisitionOrder(a) - acquisitionOrder(b));
  const seen = new Set<SkillId>();
  const ids: SkillId[] = [];
  for (const ls of learned) {
    if (!seen.has(ls.skillId)) {
      seen.add(ls.skillId);
      ids.push(ls.skillId);
    }
  }
  return ids;
}

/**
 * The entry the quick-add flow proposes for a freshly registered persona: base
 * level, the native learn-set up to that level, and the innate trait (§4.6 steps
 * 2–4). Everything is then editable.
 */
export function defaultEntryFor(persona: Persona): CompendiumEntry {
  return {
    personaId: persona.id,
    level: persona.level,
    skillIds: nativeSkillsUpTo(persona, persona.level),
    traitId: persona.traitId,
  };
}

/** A native level-up skill the persona has reached but the entry doesn't list yet. */
export interface SkillSuggestion {
  readonly skillId: SkillId;
  readonly level: number;
}

/**
 * Native level-up skills available at `level` that the entry does not already
 * carry (task 27). The editor offers these as *suggestions* when the level rises;
 * it never inserts them, so manual edits — a ticked-off native skill, an
 * inherited one — are preserved. Innate skills are excluded: they are available
 * from the start and were never "newly" reached.
 */
export function newlyAvailableNativeSkills(
  persona: Persona,
  level: number,
  currentSkillIds: readonly SkillId[],
): SkillSuggestion[] {
  const have = new Set(currentSkillIds);
  const suggestions: SkillSuggestion[] = [];
  const seen = new Set<SkillId>();
  for (const ls of persona.learnedSkills) {
    if (ls.kind !== 'level' || ls.level > level) continue;
    if (have.has(ls.skillId) || seen.has(ls.skillId)) continue;
    seen.add(ls.skillId);
    suggestions.push({ skillId: ls.skillId, level: ls.level });
  }
  return suggestions.sort((a, b) => a.level - b.level);
}
