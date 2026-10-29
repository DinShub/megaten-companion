/**
 * The P3R fusion rules engine.
 *
 * Pure and deterministic: constructed from the datasets, it answers "what do
 * these personas make", "what makes this target", "what does this persona fuse
 * into", "which skills can the result inherit" and "what does it cost". The
 * rules are transcribed from upstream (`compendium/fusions/smt-nonelem-fusions.ts`
 * and `per-nonelem-fusions.ts`, as configured by `p3r/compendium.module.ts` and
 * `pq2/fusion-data.service.ts` — `P3_NORMAL_FUSION_CALCULATOR`, with
 * `hasTripleFusion: false`); where a reading disagrees with upstream, upstream wins.
 *
 * Rules, in the order `fuse` applies them:
 *  1. **special** — a fixed recipe of exactly these personas overrides everything
 *     (Rangda + Barong → Shiva, the three Moirai → Norn, six for Orpheus Telos).
 *  2. **two personas, same arcana** — the highest fusable persona of that arcana at
 *     or below `(a + b) / 2 + 1`, never one of the two ingredients.
 *  3. **two personas, different arcana** — the chart gives the arcana; the result
 *     is its lowest fusable persona at or above `(a + b) / 2 + 0.5`, clamped to the
 *     top. If that is an ingredient, the next one up is taken.
 *
 * Reload has no triangle fusion: three or more personas fuse only as a special recipe.
 */
import type { ArcanaId, CompendiumEntry, Persona, PersonaId, Skill, SkillId, UnlockGroup } from '../model';
import { UNLOCK_GROUPS } from '../model/ids';
import type {
  FusionContext,
  FusionData,
  FusionInvalid,
  FusionInvalidCode,
  FusionOutcome,
  FusionPath,
  FusionSuccess,
  Recipe,
  SkillEligibility,
} from './types';

type UnlockState = Readonly<Record<UnlockGroup, boolean>>;
type ArcanaLists = ReadonlyMap<ArcanaId, readonly Persona[]>;

/** A persona is available unless it belongs to a switched-off unlock group. */
export function unlockAllowed(persona: Persona, unlock: UnlockState): boolean {
  return persona.unlock === null || unlock[persona.unlock.group] !== false;
}

/**
 * Per arcana, the personas the chart can *produce*: `normal` kind and
 * unlock-allowed, level-ascending. Specials are never chart results (upstream
 * drops every persona with a special recipe from its result lists).
 */
export function buildResultsByArcana(personas: readonly Persona[], unlock: UnlockState): Map<ArcanaId, Persona[]> {
  const map = new Map<ArcanaId, Persona[]>();
  for (const p of personas) {
    if (p.kind !== 'normal' || !unlockAllowed(p, unlock)) continue;
    const list = map.get(p.arcana);
    if (list) list.push(p);
    else map.set(p.arcana, [p]);
  }
  for (const list of map.values()) list.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return map;
}

/**
 * Compendium recall price: upstream's `computePrice` for P3R — 2000 plus the
 * square of the five base stats' sum. An estimate, labelled so.
 */
export function summonCost(persona: Persona): number {
  const { strength, magic, endurance, agility, luck } = persona.stats;
  const sum = strength + magic + endurance + agility + luck;
  return 2000 + sum * sum;
}

/**
 * Skills a persona knows on its own at a level — innate, or learned at or
 * below it. Theurgies are the protagonist's, not the persona's, so they are
 * never part of it (and never inherited).
 */
export function nativeSkills(persona: Persona, level = persona.level): SkillId[] {
  return persona.learnedSkills
    .filter((s) => s.kind === 'innate' || (s.kind === 'level' && s.level <= level))
    .map((s) => s.skillId);
}

export class FusionEngine {
  private readonly personaById: ReadonlyMap<PersonaId, Persona>;
  private readonly skillById: ReadonlyMap<SkillId, Skill>;
  private readonly specialByKey: ReadonlyMap<string, PersonaId>;
  private readonly specialByResult: ReadonlyMap<PersonaId, readonly PersonaId[]>;

  private readonly resultsCache = new Map<string, ArcanaLists>();
  private readonly pairIndexMemo = new Map<string, ReadonlyMap<PersonaId, readonly Recipe[]>>();
  private readonly fusionsFromMemo = new Map<string, readonly Recipe[]>();

  constructor(private readonly data: FusionData) {
    this.personaById = new Map(data.personas.map((p) => [p.id, p] as const));
    this.skillById = new Map(data.skills.map((s) => [s.id, s] as const));
    this.specialByKey = new Map(data.specialRecipes.map((r) => [groupKey(r.ingredientIds), r.resultId] as const));
    this.specialByResult = new Map(data.specialRecipes.map((r) => [r.resultId, r.ingredientIds] as const));
  }

  // ---- fuse --------------------------------------------------------------

  /** Fuse two or more personas. Returns a typed failure rather than throwing, so the UI can say *why*. */
  fuse(parentIds: readonly PersonaId[], ctx: FusionContext): FusionOutcome {
    if (parentIds.length < 2) return fail('too-few-parents', 'Fusion needs at least two personas.');
    const parents: Persona[] = [];
    for (const id of parentIds) {
      const p = this.personaById.get(id);
      if (!p) return fail('unknown-persona', `Unknown persona: ${id}.`);
      parents.push(p);
    }
    if (new Set(parentIds).size !== parentIds.length) return fail('duplicate-parents', 'A persona cannot be fused with itself.');

    const special = this.specialByKey.get(groupKey(parentIds));
    if (special) {
      const result = this.personaById.get(special)!;
      if (!unlockAllowed(result, ctx.unlockGroups)) {
        return fail('result-locked', `${result.name} is gated: ${result.unlock!.condition}. Turn its unlock group on in Settings.`);
      }
      return this.succeed(special, 'special', ctx);
    }

    if (parents.length === 2) return this.fusePair(parents[0], parents[1], ctx);
    return fail('no-special-recipe', `${parents.length} personas fuse only as a special recipe, and these are not one.`);
  }

  private fusePair(a: Persona, b: Persona, ctx: FusionContext): FusionOutcome {
    const lists = this.resultsByArcana(ctx.unlockGroups);

    if (a.arcana === b.arcana) {
      const target = (a.level + b.level) / 2 + 1;
      const list = (lists.get(a.arcana) ?? []).filter((p) => p.id !== a.id && p.id !== b.id);
      let pick: Persona | null = null;
      for (const p of list) if (p.level <= target) pick = p;
      return pick
        ? this.succeed(pick.id, 'same-arcana', ctx, { targetLevel: target })
        : fail('empty-arcana-pool', `No ${a.arcana} persona sits at or below Lv ${target} besides these two.`);
    }

    const arcana = this.data.fusionChart.normal[a.arcana]?.[b.arcana];
    if (!arcana) return fail('no-arcana-result', `${a.arcana} × ${b.arcana} has no fusion result.`);
    const list = lists.get(arcana) ?? [];
    if (list.length === 0) return fail('empty-arcana-pool', `No fusable ${arcana} persona is available.`);

    const target = (a.level + b.level) / 2 + 0.5;
    let index = list.findIndex((p) => p.level >= target);
    const clamped = index === -1;
    if (clamped) index = list.length - 1;
    let bumped = false;
    if ((list[index].id === a.id || list[index].id === b.id) && index + 1 < list.length) {
      index += 1;
      bumped = true;
    }
    return this.succeed(list[index].id, 'normal', ctx, { targetLevel: target, clampedToCeiling: clamped, bumped });
  }

  // ---- reverse & forward listings ----------------------------------------

  /**
   * Every two-persona way to make `targetId` — normal, same-arcana and
   * two-ingredient specials — memoised per unlock state.
   */
  recipesFor(targetId: PersonaId, ctx: FusionContext): readonly Recipe[] {
    return this.pairIndex(ctx).get(targetId) ?? [];
  }

  /** The special recipe that makes `targetId`, if any, whatever its size. */
  specialFor(targetId: PersonaId): Recipe | null {
    const ingredients = this.specialByResult.get(targetId);
    return ingredients ? { resultId: targetId, ingredientIds: ingredients, path: 'special' } : null;
  }

  /** result id → every two-persona recipe, built in one pass over all pairs and memoised per unlock state. */
  private pairIndex(ctx: FusionContext): ReadonlyMap<PersonaId, readonly Recipe[]> {
    const key = unlockSig(ctx.unlockGroups);
    const cached = this.pairIndexMemo.get(key);
    if (cached) return cached;

    const index = new Map<PersonaId, Recipe[]>();
    const universe = this.universe(ctx.unlockGroups);
    for (let i = 0; i < universe.length; i++) {
      for (let j = i + 1; j < universe.length; j++) {
        const o = this.fuse([universe[i].id, universe[j].id], ctx);
        if (!o.ok) continue;
        const recipe: Recipe = { resultId: o.resultId, ingredientIds: [universe[i].id, universe[j].id], path: o.path };
        const list = index.get(o.resultId);
        if (list) list.push(recipe);
        else index.set(o.resultId, [recipe]);
      }
    }
    this.pairIndexMemo.set(key, index);
    return index;
  }

  /** Every two-persona fusion that uses `parentId`. The forward complement of {@link recipesFor}. */
  fusionsFrom(parentId: PersonaId, ctx: FusionContext): readonly Recipe[] {
    const memoKey = `${parentId} ${unlockSig(ctx.unlockGroups)}`;
    const cached = this.fusionsFromMemo.get(memoKey);
    if (cached) return cached;

    const out: Recipe[] = [];
    if (this.personaById.has(parentId)) {
      for (const other of this.universe(ctx.unlockGroups)) {
        if (other.id === parentId) continue;
        const o = this.fuse([parentId, other.id], ctx);
        if (o.ok) out.push({ resultId: o.resultId, ingredientIds: [parentId, other.id], path: o.path });
      }
    }
    this.fusionsFromMemo.set(memoKey, out);
    return out;
  }

  // ---- inheritance -------------------------------------------------------

  /**
   * The inheritable-skill pool for a fusion: every skill any parent carries,
   * with the result's verdict. Registered parents contribute their recorded
   * skills; unregistered ones their native skills at base level.
   */
  inheritableSkills(parentIds: readonly PersonaId[], resultId: PersonaId, ctx: FusionContext): SkillEligibility[] {
    const result = this.personaById.get(resultId);
    if (!result) return [];
    const known = new Set(nativeSkills(result));
    const out: SkillEligibility[] = [];
    for (const skillId of this.parentSkillPool(parentIds, ctx.compendium)) {
      const skill = this.skillById.get(skillId);
      if (!skill) continue;
      if (known.has(skillId)) out.push({ skillId, eligible: false, reason: 'already-known' });
      else out.push(this.eligibility(result, skill));
    }
    return out;
  }

  /** The bare inheritance predicate for one skill against one persona. */
  canInherit(personaId: PersonaId, skillId: SkillId): boolean {
    const persona = this.personaById.get(personaId);
    const skill = this.skillById.get(skillId);
    return persona != null && skill != null && this.eligibility(persona, skill).eligible;
  }

  private eligibility(result: Persona, skill: Skill): SkillEligibility {
    if (skill.unique) return { skillId: skill.id, eligible: false, reason: 'unique' };
    if (this.data.inheritMatrix[result.inheritType]?.[skill.element] === false) {
      return { skillId: skill.id, eligible: false, reason: 'blocked-element', blockingElement: skill.element };
    }
    return { skillId: skill.id, eligible: true };
  }

  // ---- misc --------------------------------------------------------------

  /** Estimated recall cost; NaN for an unknown persona. */
  summonCost(personaId: PersonaId): number {
    const persona = this.personaById.get(personaId);
    return persona ? summonCost(persona) : Number.NaN;
  }

  /** Fusable personas of an arcana, level-ascending, under an unlock state. */
  arcanaResults(arcana: ArcanaId, unlock: UnlockState): readonly Persona[] {
    return this.resultsByArcana(unlock).get(arcana) ?? [];
  }

  // ---- internals ---------------------------------------------------------

  private succeed(
    resultId: PersonaId,
    path: FusionPath,
    ctx: FusionContext,
    extra: Partial<Pick<FusionSuccess, 'targetLevel' | 'clampedToCeiling' | 'bumped'>> = {},
  ): FusionSuccess {
    const result = this.personaById.get(resultId)!;
    return {
      ok: true,
      resultId,
      path,
      targetLevel: extra.targetLevel ?? null,
      clampedToCeiling: extra.clampedToCeiling ?? false,
      bumped: extra.bumped ?? false,
      blockedByLevel: ctx.enforceLevelCap && result.level > ctx.protagonistLevel,
    };
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

  /** Every unlock-allowed persona — the ingredient universe for the listings. */
  private universe(unlock: UnlockState): readonly Persona[] {
    return this.data.personas.filter((p) => unlockAllowed(p, unlock));
  }

  private parentSkillPool(parentIds: readonly PersonaId[], compendium: ReadonlyMap<PersonaId, CompendiumEntry>): Set<SkillId> {
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

/** Order-independent key for a group of personas. */
function groupKey(ids: readonly PersonaId[]): string {
  return [...ids].sort().join(' ');
}

function unlockSig(unlock: UnlockState): string {
  return UNLOCK_GROUPS.map((g) => (unlock[g] ? 1 : 0)).join('');
}

function fail(code: FusionInvalidCode, message: string): FusionInvalid {
  return { ok: false, code, message };
}
