/**
 * The Nocturne fusion rules engine.
 *
 * Pure and deterministic: constructed from the datasets, it answers "what do
 * these two demons make", "what makes this target", "what does this demon fuse
 * into", "which skills can the result inherit" and "what does it cost". The
 * rules are transcribed from upstream (`compendium/fusions/smt-*-fusions.ts`
 * and `smt4f/models/compendium.ts`, as configured by `smt3/compendium.module.ts`);
 * where a reading disagrees with upstream, upstream wins.
 *
 * Rules, in the order `fuse` applies them:
 *  1. **special** — a fixed two-demon recipe overrides everything (Rangda +
 *     Barong → Shiva), including the rare same-demon recipes.
 *  2. **mitama** — two different Elements make a Mitama.
 *  3. **element** — an Element plus a demon shifts that demon one rank up or
 *     down within its own race (the race's fusable results, the demon's own
 *     level slotted in if it is not one of them).
 *  4. **same-race** — two demons of one race make that race's Element.
 *  5. **normal** — the chart gives the result race; the result is the lowest
 *     fusable demon of that race at or above `(a + b) / 2 + 1`, clamped to the
 *     race's top. If that is one of the ingredients, the next one up is taken.
 */
import type { CompendiumEntry, Demon, DemonId, RaceId, Skill, SkillId, UnlockGroup } from '../model';
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
type RaceLists = ReadonlyMap<RaceId, readonly Demon[]>;

/** A demon is available unless it belongs to a switched-off unlock group. */
export function unlockAllowed(demon: Demon, unlock: UnlockState): boolean {
  return demon.unlock === null || unlock[demon.unlock.group] !== false;
}

/**
 * Per race, the demons the race chart and element shifts can *produce*:
 * `normal` kind and unlock-allowed, level-ascending. Specials, Fiends,
 * evolution- and recruit-only demons are never chart results (upstream drops
 * every demon with a special-recipe entry from its result lists).
 */
export function buildResultsByRace(demons: readonly Demon[], unlock: UnlockState): Map<RaceId, Demon[]> {
  const map = new Map<RaceId, Demon[]>();
  for (const d of demons) {
    if (d.kind !== 'normal' || !unlockAllowed(d, unlock)) continue;
    const list = map.get(d.race);
    if (list) list.push(d);
    else map.set(d.race, [d]);
  }
  for (const list of map.values()) list.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return map;
}

/** Re-summon cost: upstream's `estimateBasePrice` over St+Ma+Vi+Ag+Lu. An estimate, labelled so. */
export function summonCost(demon: Demon): number {
  const { strength, magic, vitality, agility, luck } = demon.stats;
  const sum = strength + magic + vitality + agility + luck;
  return 100 * Math.floor((sum * sum) / 20);
}

/** Skills a demon knows on its own at a level — innate, or learned at or below it. */
export function nativeSkills(demon: Demon, level = demon.level): SkillId[] {
  return demon.learnedSkills
    .filter((s) => s.kind === 'innate' || s.level <= level)
    .map((s) => s.skillId);
}

export class FusionEngine {
  private readonly demonById: ReadonlyMap<DemonId, Demon>;
  private readonly skillById: ReadonlyMap<SkillId, Skill>;
  private readonly specialByKey: ReadonlyMap<string, DemonId>;
  private readonly specialsByResult: ReadonlyMap<DemonId, readonly (readonly [DemonId, DemonId])[]>;
  private readonly mitamaByKey: ReadonlyMap<string, DemonId>;
  private readonly fiendsByRace: ReadonlyMap<RaceId, readonly DemonId[]>;

  private readonly resultsCache = new Map<string, RaceLists>();
  private readonly recipesMemo = new Map<string, ReadonlyMap<DemonId, readonly Recipe[]>>();
  private readonly fusionsFromMemo = new Map<string, readonly Recipe[]>();

  constructor(private readonly data: FusionData) {
    this.demonById = new Map(data.demons.map((d) => [d.id, d] as const));
    this.skillById = new Map(data.skills.map((s) => [s.id, s] as const));

    const specialByKey = new Map<string, DemonId>();
    const specialsByResult = new Map<DemonId, (readonly [DemonId, DemonId])[]>();
    for (const recipe of data.specialRecipes.pairs) {
      specialByKey.set(pairKey(recipe.ingredientIds[0], recipe.ingredientIds[1]), recipe.resultId);
      const list = specialsByResult.get(recipe.resultId) ?? [];
      list.push(recipe.ingredientIds);
      specialsByResult.set(recipe.resultId, list);
    }
    this.specialByKey = specialByKey;
    this.specialsByResult = specialsByResult;

    this.mitamaByKey = new Map(
      data.elementChart.mitama.map((m) => [pairKey(m.ingredientIds[0], m.ingredientIds[1]), m.resultId] as const),
    );

    const fiends = new Map<RaceId, DemonId[]>();
    for (const f of data.specialRecipes.deathstone) {
      const list = fiends.get(f.race) ?? [];
      list.push(f.resultId);
      fiends.set(f.race, list);
    }
    this.fiendsByRace = fiends;
  }

  // ---- fuse --------------------------------------------------------------

  /** Fuse two demons. Returns a typed failure rather than throwing, so the UI can say *why*. */
  fuse(parentIds: readonly DemonId[], ctx: FusionContext): FusionOutcome {
    if (parentIds.length < 2) return fail('too-few-parents', 'Fusion needs two demons.');
    if (parentIds.length > 2) return fail('too-many-parents', 'Nocturne fuses exactly two demons at a time.');
    const a = this.demonById.get(parentIds[0]);
    const b = this.demonById.get(parentIds[1]);
    if (!a) return fail('unknown-demon', `Unknown demon: ${parentIds[0]}.`);
    if (!b) return fail('unknown-demon', `Unknown demon: ${parentIds[1]}.`);

    const special = this.specialByKey.get(pairKey(a.id, b.id));
    if (special) {
      const result = this.demonById.get(special)!;
      if (!unlockAllowed(result, ctx.unlockGroups)) {
        return fail('result-locked', `${result.name} is gated: ${result.unlock!.condition}. Turn its unlock group on in Settings.`);
      }
      return this.succeed(special, 'special', ctx);
    }

    if (a.id === b.id) return fail('duplicate-parents', 'A demon cannot be fused with itself.');

    const aElement = a.kind === 'element';
    const bElement = b.kind === 'element';
    if (aElement && bElement) {
      const mitama = this.mitamaByKey.get(pairKey(a.id, b.id));
      return mitama ? this.succeed(mitama, 'mitama', ctx) : fail('no-race-result', 'These elements make nothing.');
    }
    if (a.kind === 'mitama' || b.kind === 'mitama') {
      return fail('mitama-ingredient', 'A Mitama has no chart result with another demon.');
    }
    if (aElement) return this.fuseElement(a, b, ctx);
    if (bElement) return this.fuseElement(b, a, ctx);

    if (a.race === b.race) {
      const elementId = this.data.fusionChart.sameRace[a.race];
      return elementId
        ? this.succeed(elementId, 'same-race', ctx)
        : fail('no-race-result', `Two ${a.race} demons make nothing.`);
    }
    return this.fuseNormal(a, b, ctx);
  }

  private fuseNormal(a: Demon, b: Demon, ctx: FusionContext): FusionOutcome {
    const race = this.data.fusionChart.normal[a.race]?.[b.race];
    if (!race) return fail('no-race-result', `${a.race} × ${b.race} has no fusion result.`);
    const list = this.resultsByRace(ctx.unlockGroups).get(race) ?? [];
    if (list.length === 0) return fail('empty-race-pool', `No fusable ${race} demon is available.`);

    const target = (a.level + b.level) / 2 + 1;
    let index = list.findIndex((d) => d.level >= target);
    const clamped = index === -1;
    if (clamped) index = list.length - 1;

    // Upstream: a result that *is* an ingredient steps up to the next demon in the race.
    let bumped = false;
    if ((list[index].id === a.id || list[index].id === b.id) && index + 1 < list.length) {
      index += 1;
      bumped = true;
    }

    const cursedRace = this.data.fusionChart.cursed[a.race]?.[b.race] ?? null;
    const deathstoneIds = (this.fiendsByRace.get(race) ?? []).filter((id) =>
      unlockAllowed(this.demonById.get(id)!, ctx.unlockGroups),
    );
    return this.succeed(list[index].id, 'normal', ctx, { targetLevel: target, clampedToCeiling: clamped, bumped, cursedRace, deathstoneIds });
  }

  /** Element + demon: one rank up or down within the demon's own race. */
  private fuseElement(element: Demon, other: Demon, ctx: FusionContext): FusionOutcome {
    const shift = this.data.elementChart.shifts[other.race]?.[element.id];
    if (!shift) return fail('element-no-shift', `${element.name} does not react with ${other.race} demons.`);
    const list = this.resultsByRace(ctx.unlockGroups).get(other.race) ?? [];

    // Slot the ingredient's level into the race's result levels (upstream inserts
    // it when absent, so a special or evolved demon still has a rank to shift from).
    const at = list.findIndex((d) => d.level >= other.level);
    const pos = at === -1 ? list.length : at;
    const inList = pos < list.length && list[pos].level === other.level;
    const next = shift > 0 ? (inList ? pos + shift : pos + shift - 1) : pos + shift;
    if (next < 0 || next >= list.length) {
      return fail('element-out-of-range', `Shifting ${other.name} ${shift > 0 ? 'up' : 'down'} falls off the end of its race.`);
    }
    return this.succeed(list[next].id, 'element', ctx);
  }

  // ---- reverse & forward listings ----------------------------------------

  /**
   * Every pair that produces `targetId`: its special recipes, plus every pair
   * of unlock-allowed demons `fuse` maps to it. Memoised per unlock state.
   * Deathstone Fiends, evolution-only and recruit-only demons have no pairs —
   * the UI explains how to get those instead.
   */
  recipesFor(targetId: DemonId, ctx: FusionContext): readonly Recipe[] {
    return this.recipeIndex(ctx).get(targetId) ?? [];
  }

  /**
   * result id → every pair that makes it, built in a single pass over all
   * ~19k unlock-allowed pairs (plus the same-demon specials, which an i < j
   * scan never visits) and memoised per unlock state. Fusion results depend on
   * the context only through the unlock state, so one index serves every
   * level/compendium setting.
   */
  private recipeIndex(ctx: FusionContext): ReadonlyMap<DemonId, readonly Recipe[]> {
    const key = unlockSig(ctx.unlockGroups);
    const cached = this.recipesMemo.get(key);
    if (cached) return cached;

    const index = new Map<DemonId, Recipe[]>();
    const add = (recipe: Recipe): void => {
      const list = index.get(recipe.resultId);
      if (list) list.push(recipe);
      else index.set(recipe.resultId, [recipe]);
    };
    const universe = this.universe(ctx.unlockGroups);
    for (let i = 0; i < universe.length; i++) {
      for (let j = i + 1; j < universe.length; j++) {
        const o = this.fuse([universe[i].id, universe[j].id], ctx);
        if (o.ok) add({ resultId: o.resultId, ingredientIds: [universe[i].id, universe[j].id], path: o.path });
      }
    }
    for (const [resultId, pairs] of this.specialsByResult) {
      for (const [x, y] of pairs) {
        if (x !== y) continue;
        const o = this.fuse([x, y], ctx);
        if (o.ok) add({ resultId, ingredientIds: [x, y], path: 'special' });
      }
    }
    this.recipesMemo.set(key, index);
    return index;
  }

  /** Every fusion that uses `parentId` with one other demon. The forward complement of {@link recipesFor}. */
  fusionsFrom(parentId: DemonId, ctx: FusionContext): readonly Recipe[] {
    const memoKey = `${parentId} ${unlockSig(ctx.unlockGroups)}`;
    const cached = this.fusionsFromMemo.get(memoKey);
    if (cached) return cached;

    const out: Recipe[] = [];
    if (this.demonById.has(parentId)) {
      for (const other of this.universe(ctx.unlockGroups)) {
        const o = this.fuse([parentId, other.id], ctx);
        if (o.ok) out.push({ resultId: o.resultId, ingredientIds: [parentId, other.id], path: o.path });
      }
    }
    this.fusionsFromMemo.set(memoKey, out);
    return out;
  }

  // ---- inheritance -------------------------------------------------------

  /**
   * The inheritable-skill pool for a fusion: every skill either parent carries,
   * with the result's verdict. Registered parents contribute their recorded
   * skills; unregistered ones their native skills at base level.
   */
  inheritableSkills(parentIds: readonly DemonId[], resultId: DemonId, ctx: FusionContext): SkillEligibility[] {
    const result = this.demonById.get(resultId);
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

  /** The bare inheritance predicate for one skill against one demon. */
  canInherit(demonId: DemonId, skillId: SkillId): boolean {
    const demon = this.demonById.get(demonId);
    const skill = this.skillById.get(skillId);
    return demon != null && skill != null && this.eligibility(demon, skill).eligible;
  }

  private eligibility(result: Demon, skill: Skill): SkillEligibility {
    if (skill.unique) return { skillId: skill.id, eligible: false, reason: 'unique' };
    if (skill.inheritCategory && !result.inherits.includes(skill.inheritCategory)) {
      return { skillId: skill.id, eligible: false, reason: 'blocked-category', blockingCategory: skill.inheritCategory };
    }
    return { skillId: skill.id, eligible: true };
  }

  // ---- misc --------------------------------------------------------------

  /** Estimated re-summon cost; NaN for an unknown demon. */
  summonCost(demonId: DemonId): number {
    const demon = this.demonById.get(demonId);
    return demon ? summonCost(demon) : Number.NaN;
  }

  /** Fusable demons of a race, level-ascending, under an unlock state. */
  raceResults(race: RaceId, unlock: UnlockState): readonly Demon[] {
    return this.resultsByRace(unlock).get(race) ?? [];
  }

  // ---- internals ---------------------------------------------------------

  private succeed(
    resultId: DemonId,
    path: FusionPath,
    ctx: FusionContext,
    extra: Partial<Pick<FusionSuccess, 'targetLevel' | 'clampedToCeiling' | 'bumped' | 'deathstoneIds' | 'cursedRace'>> = {},
  ): FusionSuccess {
    const result = this.demonById.get(resultId)!;
    return {
      ok: true,
      resultId,
      path,
      targetLevel: extra.targetLevel ?? null,
      clampedToCeiling: extra.clampedToCeiling ?? false,
      bumped: extra.bumped ?? false,
      blockedByLevel: ctx.enforceLevelCap && result.level > ctx.protagonistLevel,
      deathstoneIds: extra.deathstoneIds ?? [],
      cursedRace: extra.cursedRace ?? null,
    };
  }

  private resultsByRace(unlock: UnlockState): RaceLists {
    const key = unlockSig(unlock);
    let lists = this.resultsCache.get(key);
    if (!lists) {
      lists = buildResultsByRace(this.data.demons, unlock);
      this.resultsCache.set(key, lists);
    }
    return lists;
  }

  /** Every unlock-allowed demon — the ingredient universe for the listings. */
  private universe(unlock: UnlockState): readonly Demon[] {
    return this.data.demons.filter((d) => unlockAllowed(d, unlock));
  }

  private parentSkillPool(parentIds: readonly DemonId[], compendium: ReadonlyMap<DemonId, CompendiumEntry>): Set<SkillId> {
    const pool = new Set<SkillId>();
    for (const id of parentIds) {
      const entry = compendium.get(id);
      if (entry) {
        for (const skillId of entry.skillIds) pool.add(skillId);
        continue;
      }
      const demon = this.demonById.get(id);
      if (demon) for (const skillId of nativeSkills(demon)) pool.add(skillId);
    }
    return pool;
  }
}

/** Order-independent key for a pair. */
function pairKey(a: DemonId, b: DemonId): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

function unlockSig(unlock: UnlockState): string {
  return `${unlock.story ? 1 : 0}${unlock.fiend ? 1 : 0}${unlock.amala ? 1 : 0}`;
}

function fail(code: FusionInvalidCode, message: string): FusionInvalid {
  return { ok: false, code, message };
}
