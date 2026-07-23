/**
 * The P5R fusion rules engine (§6, Phase 5).
 *
 * Pure and deterministic: constructed from the §5 datasets, it answers "what do
 * these parents make", "what makes this target", "which skills can this result
 * inherit", "what does this persona itemise to", and "what does it cost to
 * re-summon". Everything is transcribed from upstream, which is battle-tested
 * against the game; where a reading disagrees with upstream, upstream wins.
 *
 * The four fusion paths (§6.1, §6.2):
 *  - **different arcana** — chart lookup, round the average level *up* to the
 *    lowest result at or above target, clamp to the arcana ceiling on overflow;
 *  - **same arcana** — a genuinely different rule: round *down* to the highest
 *    result at or below target, excluding both ingredients;
 *  - **treasure demon** — shift the non-treasure parent within its arcana by the
 *    element-chart offset (which may be negative);
 *  - **advanced** — an exact 2–6 ingredient recipe, checked *before* the normal
 *    path so a matching 2-ingredient pair overrides its arcana result.
 */
import { buildIngredientsByArcana, buildResultsByArcana } from '../data/indexes';
import type { AdvancedRecipe, CompendiumEntry, Persona, Skill } from '../model';
import type { ArcanaId, PersonaId, SkillId, UnlockGroup } from '../model/ids';
import { planGallows } from './gallows';
import { canInherit, skillEligibility } from './inherit';
import { resolvePool } from './pool';
import { summonCost } from './summon-cost';
import type {
  FusionContext,
  FusionData,
  FusionInvalid,
  FusionInvalidCode,
  FusionOutcome,
  FusionPath,
  FusionSuccess,
  GallowsPlan,
  Recipe,
  ResolvedPool,
  SkillEligibility,
} from './types';

type UnlockState = Readonly<Record<UnlockGroup, boolean>>;
type ArcanaLists = ReadonlyMap<ArcanaId, readonly Persona[]>;

export class FusionEngine {
  private readonly personaById: ReadonlyMap<PersonaId, Persona>;
  private readonly skillById: ReadonlyMap<SkillId, Skill>;
  private readonly treasureIds: ReadonlySet<PersonaId>;
  /** Sorted-ingredient-key → recipe, for the exact-set match (§6.2). */
  private readonly advancedByKey: ReadonlyMap<string, AdvancedRecipe>;
  /** Result persona id → its recipe. Each `special` has exactly one. */
  private readonly recipeByResult: ReadonlyMap<PersonaId, AdvancedRecipe>;

  // Per-unlock-signature caches. A single search fixes one unlock state, so the
  // first miss builds the arcana lists and every later call hits.
  private readonly resultsCache = new Map<string, ArcanaLists>();
  private readonly ingredientsCache = new Map<string, ArcanaLists>();
  private readonly recipesMemo = new Map<string, readonly Recipe[]>();

  constructor(private readonly data: FusionData) {
    this.personaById = new Map(data.personas.map((p) => [p.id, p] as const));
    this.skillById = new Map(data.skills.map((s) => [s.id, s] as const));
    this.treasureIds = new Set(data.advancedRecipes.treasureIds);

    const byKey = new Map<string, AdvancedRecipe>();
    const byResult = new Map<PersonaId, AdvancedRecipe>();
    for (const recipe of data.advancedRecipes.recipes) {
      byKey.set(recipeKey(recipe.ingredientIds), recipe);
      byResult.set(recipe.resultId, recipe);
    }
    this.advancedByKey = byKey;
    this.recipeByResult = byResult;
  }

  // ---- fuse (tasks 32–36) ----------------------------------------------

  /**
   * Fuse an ordered list of parents. Two ids take the normal / same-arcana /
   * treasure path; any count matches an advanced recipe. Returns a typed
   * failure rather than throwing, so the calculator can show *why* (§4.7.1).
   */
  fuse(parentIds: readonly PersonaId[], ctx: FusionContext): FusionOutcome {
    if (parentIds.length < 2) {
      return fail('too-few-parents', 'Fusion needs at least two personas.');
    }
    for (const id of parentIds) {
      if (!this.personaById.has(id)) return fail('unknown-persona', `Unknown persona: ${id}.`);
    }

    // Advanced recipes are checked first (§6.2): a matching 2-ingredient set
    // overrides what the arcana chart would otherwise give.
    const recipe = this.advancedByKey.get(recipeKey(parentIds));
    if (recipe) {
      return this.succeed(recipe.resultId, 'advanced', null, false, ctx);
    }

    if (parentIds.length !== 2) {
      return fail('no-advanced-recipe', 'These ingredients match no advanced recipe.');
    }

    const a = this.personaById.get(parentIds[0])!;
    const b = this.personaById.get(parentIds[1])!;

    if (a.id === b.id) {
      return fail('duplicate-parents', 'A persona cannot be fused with itself.');
    }
    if (a.kind === 'party' || b.kind === 'party') {
      return fail('party-ingredient', 'Party personas cannot be used as fusion material.');
    }

    const aTreasure = this.treasureIds.has(a.id);
    const bTreasure = this.treasureIds.has(b.id);
    if (aTreasure && bTreasure) {
      return fail('treasure-pair', 'Two treasure demons cannot be fused together.');
    }
    if (aTreasure) return this.fuseTreasure(a, b, ctx);
    if (bTreasure) return this.fuseTreasure(b, a, ctx);

    return a.arcana === b.arcana
      ? this.fuseSameArcana(a, b, ctx)
      : this.fuseDifferentArcana(a, b, ctx);
  }

  /** Different arcana (§6.1): round up, clamp to the ceiling on overflow. */
  private fuseDifferentArcana(a: Persona, b: Persona, ctx: FusionContext): FusionOutcome {
    const resultArcana = this.data.fusionChart.grid[a.arcana][b.arcana];
    if (resultArcana === null) {
      return fail('no-arcana-result', `${a.arcana} + ${b.arcana} has no fusion result.`);
    }
    const list = this.resultsByArcana(ctx.unlockGroups).get(resultArcana) ?? [];
    if (list.length === 0) {
      return fail('empty-arcana-pool', `No fusable ${resultArcana} persona is available.`);
    }
    const target = targetLevel(a, b);
    const atOrAbove = list.find((p) => p.level >= target);
    if (atOrAbove) {
      return this.succeed(atOrAbove.id, 'different-arcana', target, false, ctx);
    }
    // Target exceeds the arcana ceiling: clamp to the highest (§6.1 step 4).
    const highest = list[list.length - 1];
    return this.succeed(highest.id, 'different-arcana', target, true, ctx);
  }

  /** Same arcana (§6.1): round down, excluding both ingredients; clamp to floor. */
  private fuseSameArcana(a: Persona, b: Persona, ctx: FusionContext): FusionOutcome {
    const list = this.resultsByArcana(ctx.unlockGroups).get(a.arcana) ?? [];
    // Exclude both ingredients; personas with an advanced recipe are already
    // absent (they are `special`, so never in the result list).
    const eligible = list.filter((p) => p.id !== a.id && p.id !== b.id);
    if (eligible.length === 0) {
      return fail('empty-arcana-pool', `No other fusable ${a.arcana} persona is available.`);
    }
    const target = targetLevel(a, b);
    // Highest at or below target; if the target is below the floor, clamp up to
    // the lowest available (the "bottom of an arcana" edge, task 40).
    let pick = eligible[0];
    for (const p of eligible) {
      if (p.level <= target) pick = p; // list is level-ascending
      else break;
    }
    return this.succeed(pick.id, 'same-arcana', target, false, ctx);
  }

  /** Treasure demon (§6.1): shift the non-treasure parent by the element offset. */
  private fuseTreasure(treasure: Persona, other: Persona, ctx: FusionContext): FusionOutcome {
    const list = this.resultsByArcana(ctx.unlockGroups).get(other.arcana) ?? [];
    const index = list.findIndex((p) => p.id === other.id);
    if (index === -1) {
      return fail(
        'treasure-partner-unfusable',
        `${other.name} is not a fusable result in ${other.arcana}.`,
      );
    }
    const offsetRow = this.data.elementChart.offsets[other.arcana];
    const offset = offsetRow ? offsetRow[treasure.id] : undefined;
    if (offset === undefined) {
      return fail(
        'treasure-partner-unfusable',
        `No element-chart offset for ${treasure.name} in ${other.arcana}.`,
      );
    }
    const shifted = index + offset;
    if (shifted < 0 || shifted >= list.length) {
      return fail(
        'treasure-out-of-range',
        `Shifting ${other.name} by ${offset} falls outside ${other.arcana}.`,
      );
    }
    return this.succeed(list[shifted].id, 'treasure', null, false, ctx);
  }

  // ---- inheritance (task 37) -------------------------------------------

  /**
   * The inheritable-skill pool for a fusion: every skill either parent carries,
   * with the result persona's §6.5 eligibility verdict attached. Registered
   * parents contribute their recorded skills; unregistered ones contribute the
   * skills they know natively at base level.
   */
  inheritableSkills(
    parentIds: readonly PersonaId[],
    resultId: PersonaId,
    ctx: FusionContext,
  ): SkillEligibility[] {
    const result = this.personaById.get(resultId);
    if (!result) return [];
    const out: SkillEligibility[] = [];
    for (const skillId of this.parentSkillPool(parentIds, ctx.compendium)) {
      const skill = this.skillById.get(skillId);
      if (skill) out.push(skillEligibility(this.data.inheritMatrix, result.inheritType, skill));
    }
    return out;
  }

  /** The bare §6.5 predicate for one skill against one inherit type. */
  canInherit(inheritType: Persona['inheritType'], skillId: SkillId): boolean {
    const skill = this.skillById.get(skillId);
    return skill ? canInherit(this.data.inheritMatrix, inheritType, skill) : false;
  }

  // ---- gallows (§6.6, task 54) -----------------------------------------

  /**
   * Plan a Gallows sacrifice of `sacrificeId` onto `targetId` (§6.6): which of
   * the sacrifice's skills could transfer, and how many free slots the target
   * has. A separate operation from fusion, so it does not touch `fuse`. Takes
   * just the compendium — the only context it reads — mirroring `summonCost` /
   * `itemize` taking only what they need. Both personas' current skills are
   * resolved as parents contribute to fusion (registered skills when in the
   * compendium, else the native learn-set at base level). Returns null when an id
   * is unknown or when sacrifice and target are the same persona.
   */
  gallows(
    sacrificeId: PersonaId,
    targetId: PersonaId,
    compendium: ReadonlyMap<PersonaId, CompendiumEntry>,
  ): GallowsPlan | null {
    // Self-sacrifice is a domain invalid, like `fuse`'s duplicate-parents — own
    // it here so no caller can produce a meaningless all-already-known plan.
    if (sacrificeId === targetId) return null;
    const target = this.personaById.get(targetId);
    if (!target || !this.personaById.has(sacrificeId)) return null;
    const sacrificeSkills: Skill[] = [];
    for (const id of this.parentSkillPool([sacrificeId], compendium)) {
      const skill = this.skillById.get(id);
      if (skill) sacrificeSkills.push(skill);
    }
    const targetSkillIds = this.parentSkillPool([targetId], compendium);
    return planGallows(this.data.inheritMatrix, target, sacrificeId, sacrificeSkills, targetSkillIds);
  }

  // ---- itemization & cost (§6.7, §6.8) ---------------------------------

  /** The skill card a persona itemises to, or null (§6.7). */
  itemize(personaId: PersonaId, alarm: boolean): SkillId | null {
    const persona = this.personaById.get(personaId);
    if (!persona) return null;
    return alarm ? persona.itemization.alarm : persona.itemization.normal;
  }

  /** Re-summon cost over base stats (§6.8). NaN for an unknown persona. */
  summonCost(personaId: PersonaId): number {
    const persona = this.personaById.get(personaId);
    return persona ? summonCost(persona.stats) : Number.NaN;
  }

  // ---- reverse fusion (§4.7.2, task 39) --------------------------------

  /**
   * Every parent set that produces `targetId`, across all four paths: the
   * advanced recipe (if any), all normal and same-arcana pairs, and every
   * treasure-demon pairing. Enumerated over the full unlock-filtered roster
   * (ownership is a badge, not a filter, §4.7.2) and memoised per target.
   */
  recipesFor(targetId: PersonaId, ctx: FusionContext): readonly Recipe[] {
    const memoKey = `${targetId} ${unlockSig(ctx.unlockGroups)}`;
    const cached = this.recipesMemo.get(memoKey);
    if (cached) return cached;

    const target = this.personaById.get(targetId);
    if (!target) {
      this.recipesMemo.set(memoKey, []);
      return [];
    }

    const out: Recipe[] = [];

    // Advanced recipe (may name special ingredients the pair scan below misses).
    const recipe = this.recipeByResult.get(targetId);
    if (recipe) {
      out.push({ resultId: targetId, ingredientIds: recipe.ingredientIds, path: 'advanced' });
    }

    // Different- and same-arcana pairs. Brute force over the ingredient roster
    // (treasure demons excluded — they only reach a target via the shift below).
    const pool = this.flatIngredients(ctx.unlockGroups);
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const result = this.fuse([pool[i].id, pool[j].id], ctx);
        if (
          result.ok &&
          result.resultId === targetId &&
          (result.path === 'different-arcana' || result.path === 'same-arcana')
        ) {
          out.push({
            resultId: targetId,
            ingredientIds: [pool[i].id, pool[j].id],
            path: result.path,
          });
        }
      }
    }

    // Treasure-demon pairings: each demon against every fusable persona in the
    // target's own arcana (the shift stays within that arcana).
    const arcanaList = this.resultsByArcana(ctx.unlockGroups).get(target.arcana) ?? [];
    for (const treasureId of this.treasureIds) {
      for (const other of arcanaList) {
        const result = this.fuse([treasureId, other.id], ctx);
        if (result.ok && result.resultId === targetId && result.path === 'treasure') {
          out.push({ resultId: targetId, ingredientIds: [treasureId, other.id], path: 'treasure' });
        }
      }
    }

    this.recipesMemo.set(memoKey, out);
    return out;
  }

  // ---- pool (§6.4) ------------------------------------------------------

  /** Resolve the raw-material pool for `ctx` (§6.4, task 31). */
  resolvePool(ctx: FusionContext): ResolvedPool {
    return resolvePool(this.data.personas, ctx);
  }

  // ---- internals --------------------------------------------------------

  private succeed(
    resultId: PersonaId,
    path: FusionPath,
    target: number | null,
    clampedToCeiling: boolean,
    ctx: FusionContext,
  ): FusionSuccess {
    const result = this.personaById.get(resultId)!;
    const blockedByLevel = ctx.enforceLevelCap && result.level > ctx.protagonistLevel;
    return { ok: true, resultId, path, targetLevel: target, clampedToCeiling, blockedByLevel };
  }

  private resultsByArcana(unlock: UnlockState): ArcanaLists {
    const key = unlockSig(unlock);
    let lists = this.resultsCache.get(key);
    if (!lists) {
      lists = buildResultsByArcana(this.data.personas, unlock);
      this.resultsCache.set(key, lists);
    }
    return lists;
  }

  private ingredientsByArcana(unlock: UnlockState): ArcanaLists {
    const key = unlockSig(unlock);
    let lists = this.ingredientsCache.get(key);
    if (!lists) {
      lists = buildIngredientsByArcana(this.data.personas, unlock);
      this.ingredientsCache.set(key, lists);
    }
    return lists;
  }

  private flatIngredients(unlock: UnlockState): readonly Persona[] {
    const out: Persona[] = [];
    for (const list of this.ingredientsByArcana(unlock).values()) out.push(...list);
    return out;
  }

  private parentSkillPool(
    parentIds: readonly PersonaId[],
    compendium: ReadonlyMap<PersonaId, CompendiumEntry>,
  ): Set<SkillId> {
    const pool = new Set<SkillId>();
    for (const id of parentIds) {
      const entry = compendium.get(id);
      if (entry) {
        for (const skillId of entry.skillIds) pool.add(skillId);
        continue;
      }
      const persona = this.personaById.get(id);
      if (persona) for (const skillId of nativeSkills(persona)) pool.add(skillId);
    }
    return pool;
  }
}

/** Skills a persona knows on its own at base level — innate, or levelled at ≤ base. */
function nativeSkills(persona: Persona): SkillId[] {
  const out: SkillId[] = [];
  for (const learned of persona.learnedSkills) {
    if (learned.kind === 'innate') out.push(learned.skillId);
    else if (learned.kind === 'level' && learned.level <= persona.level) out.push(learned.skillId);
    // `tag` acquisitions (Fusion Alarm, negotiation, Confidant) are not native.
  }
  return out;
}

/** `floor((lvlA + lvlB) / 2) + 1`, over base levels (§6.1). */
function targetLevel(a: Persona, b: Persona): number {
  return Math.floor((a.level + b.level) / 2) + 1;
}

/** Order-independent key for an ingredient set. */
function recipeKey(ids: readonly PersonaId[]): string {
  return [...ids].sort().join(' ');
}

/** Stable signature of an unlock state, for the per-unlock caches. */
function unlockSig(unlock: UnlockState): string {
  return `${unlock.story ? 1 : 0}${unlock.confidant ? 1 : 0}${unlock.dlc ? 1 : 0}`;
}

function fail(code: FusionInvalidCode, message: string): FusionInvalid {
  return { ok: false, code, message };
}
