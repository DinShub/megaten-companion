import { ARCANA_ORDER } from '../model/ids';
import type {
  Acquisition,
  AdvancedRecipes,
  ArcanaId,
  Persona,
  PersonaId,
  Shadow,
  ShadowId,
  SkillId,
  UnlockGroup,
} from '../model';

/**
 * Derived indexes (§5.2). Built once on data load and held in memory, never
 * persisted. The arcana indexes additionally depend on the unlock toggles, so
 * they are rebuilt whenever a toggle flips (task 13).
 */

/** One persona that learns a skill, with how it comes by it. */
export type SkillLearner = { readonly personaId: PersonaId } & Acquisition;

type UnlockState = Readonly<Record<UnlockGroup, boolean>>;

/** A persona is available unless it belongs to a switched-off unlock group. */
export function unlockAllowed(persona: Persona, unlockGroups: UnlockState): boolean {
  return persona.unlock === null || unlockGroups[persona.unlock.group] !== false;
}

function emptyArcanaMap(): Map<ArcanaId, Persona[]> {
  const map = new Map<ArcanaId, Persona[]>();
  for (const arcana of ARCANA_ORDER) map.set(arcana, []);
  return map;
}

/** Level-ascending, name as the deterministic tie-break. */
function byLevelThenName(a: Persona, b: Persona): number {
  return a.level - b.level || a.name.localeCompare(b.name);
}

/**
 * `resultsByArcana` (§5.2): the personas normal fusion can *produce*, per
 * arcana, level-ascending. Excludes `special`, `treasure` and `party` (all
 * non-`normal` kinds) and anything in a disabled unlock group. This is what the
 * fusion level rules index into, so it must rebuild on an unlock toggle.
 */
export function buildResultsByArcana(
  personas: readonly Persona[],
  unlockGroups: UnlockState,
): Map<ArcanaId, Persona[]> {
  const map = emptyArcanaMap();
  for (const persona of personas) {
    if (persona.kind !== 'normal') continue;
    if (!unlockAllowed(persona, unlockGroups)) continue;
    map.get(persona.arcana)?.push(persona);
  }
  for (const list of map.values()) list.sort(byLevelThenName);
  return map;
}

/**
 * `ingredientsByArcana` (§5.2): the raw-material pool per arcana. Treasure
 * demons are excluded from the general ingredient pool (§6.1), as are `special`
 * and `party` — leaving the same `normal` + unlock-allowed set as the results
 * index today. Kept a distinct builder because the fusion pool rules (§6.4,
 * Phase 5) refine the ingredient side independently of the result side.
 */
export function buildIngredientsByArcana(
  personas: readonly Persona[],
  unlockGroups: UnlockState,
): Map<ArcanaId, Persona[]> {
  const map = emptyArcanaMap();
  for (const persona of personas) {
    if (persona.kind !== 'normal') continue;
    if (!unlockAllowed(persona, unlockGroups)) continue;
    map.get(persona.arcana)?.push(persona);
  }
  for (const list of map.values()) list.sort(byLevelThenName);
  return map;
}

/** `skillLearnedBy` (§5.2): inverts `Persona.learnedSkills`. */
export function buildSkillLearnedBy(
  personas: readonly Persona[],
): Map<SkillId, SkillLearner[]> {
  const map = new Map<SkillId, SkillLearner[]>();
  for (const persona of personas) {
    for (const learned of persona.learnedSkills) {
      const { skillId, ...acquisition } = learned;
      const learner = { personaId: persona.id, ...acquisition } as SkillLearner;
      const list = map.get(skillId);
      if (list) list.push(learner);
      else map.set(skillId, [learner]);
    }
  }
  return map;
}

/**
 * `dropSources` (§5.2, §4.4): inverts shadow drops into
 * `dropName → shadows that drop it`, over both material and armour strings.
 */
export function buildDropSources(shadows: readonly Shadow[]): Map<string, ShadowId[]> {
  const map = new Map<string, ShadowId[]>();
  const add = (name: string | null, shadowId: ShadowId): void => {
    if (!name) return;
    const list = map.get(name);
    if (list) {
      if (!list.includes(shadowId)) list.push(shadowId);
    } else {
      map.set(name, [shadowId]);
    }
  };
  for (const shadow of shadows) {
    add(shadow.drops.material, shadow.id);
    add(shadow.drops.armor, shadow.id);
  }
  return map;
}

/**
 * `invertedSpecials` (§5.2): `ingredientPersonaId → resultIds of advanced
 * recipes that use it`. Recipes have no id of their own; the result persona id
 * identifies each (§6.2).
 */
export function buildInvertedSpecials(
  advancedRecipes: AdvancedRecipes,
): Map<PersonaId, PersonaId[]> {
  const map = new Map<PersonaId, PersonaId[]>();
  for (const recipe of advancedRecipes.recipes) {
    for (const ingredientId of recipe.ingredientIds) {
      const list = map.get(ingredientId);
      if (list) {
        if (!list.includes(recipe.resultId)) list.push(recipe.resultId);
      } else {
        map.set(ingredientId, [recipe.resultId]);
      }
    }
  }
  return map;
}
