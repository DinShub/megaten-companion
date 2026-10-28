/**
 * The P4G fusion rules engine.
 *
 * Pure and deterministic: constructed from the datasets, it answers "what do
 * these personas make", "what makes this target", "what does this persona fuse
 * into", "which skills can the result inherit" and "what does it cost". The
 * rules are transcribed from upstream (`compendium/fusions/smt-nonelem-fusions.ts`,
 * `per-nonelem-fusions.ts` and `per-triple-fusions.ts`, as configured by
 * `p4/compendium.module.ts` and `pq2/fusion-data.service.ts`); where a reading
 * disagrees with upstream, upstream wins.
 *
 * Rules, in the order `fuse` applies them:
 *  1. **special** — a fixed recipe of exactly these personas overrides everything
 *     (Belial + Nebiros → Alice, the three Norns → Norn, twelve for Izanagi-no-Okami).
 *  2. **two personas, same arcana** — the highest fusable persona of that arcana at
 *     or below `(a + b) / 2 + 1`, never one of the two ingredients.
 *  3. **two personas, different arcana** — the normal chart gives the arcana; the
 *     result is its lowest fusable persona at or above `(a + b) / 2 + 0.5`, clamped
 *     to the top. If that is an ingredient, the next one up is taken.
 *  4. **three personas (triangle)** — the highest-level persona leads (ties go to
 *     the earlier arcana). The other two make an arcana on the normal chart (or
 *     share one); the triangle chart crosses it with the lead's arcana. The result
 *     is the lowest fusable persona of that arcana at or above `(a + b + c) / 3 +
 *     4.25` — no clamping — stepping past any ingredient. Three of one arcana stay
 *     in it, skipping the ingredients' levels.
 */
import type { ArcanaId, CompendiumEntry, Persona, PersonaId, Skill, SkillId, UnlockGroup } from '../model';
import { ARCANA_ORDER } from '../model/ids';
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

/** Upstream's triangle level offset (`PersonaFusionChart.lvlModifier` for the triple chart). */
const TRIANGLE_OFFSET = 4.25;

/** A persona is available unless it belongs to a switched-off unlock group. */
export function unlockAllowed(persona: Persona, unlock: UnlockState): boolean {
  return persona.unlock === null || unlock[persona.unlock.group] !== false;
}

/**
 * Per arcana, the personas the charts can *produce*: `normal` kind and
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
 * Compendium recall price: upstream's `computePrice` for P4 — 2000 plus the
 * square of the five base stats' sum. An estimate, labelled so.
 */
export function summonCost(persona: Persona): number {
  const { strength, magic, endurance, agility, luck } = persona.stats;
  const sum = strength + magic + endurance + agility + luck;
  return 2000 + sum * sum;
}

/** Skills a persona knows on its own at a level — innate, or learned at or below it. */
export function nativeSkills(persona: Persona, level = persona.level): SkillId[] {
  return persona.learnedSkills.filter((s) => s.kind === 'innate' || s.level <= level).map((s) => s.skillId);
}

const ARCANA_INDEX = new Map<ArcanaId, number>(ARCANA_ORDER.map((a, i) => [a, i] as const));

export class FusionEngine {
  private readonly personaById: ReadonlyMap<PersonaId, Persona>;
  private readonly skillById: ReadonlyMap<SkillId, Skill>;
  private readonly specialByKey: ReadonlyMap<string, PersonaId>;
  private readonly specialByResult: ReadonlyMap<PersonaId, readonly PersonaId[]>;

  private readonly resultsCache = new Map<string, ArcanaLists>();
  private readonly pairIndexMemo = new Map<string, ReadonlyMap<PersonaId, readonly Recipe[]>>();
  private readonly fusionsFromMemo = new Map<string, readonly Recipe[]>();
  private readonly trianglesMemo = new Map<string, readonly Recipe[]>();

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
    if (parents.length === 3) return this.fuseTriangle(parents[0], parents[1], parents[2], ctx);
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

  private fuseTriangle(x: Persona, y: Persona, z: Persona, ctx: FusionContext): FusionOutcome {
    const [lead, n1, n2] = [x, y, z].sort(leadOrder);
    const lists = this.resultsByArcana(ctx.unlockGroups);
    const target = (x.level + y.level + z.level) / 3 + TRIANGLE_OFFSET;
    const ids = new Set([x.id, y.id, z.id]);

    if (lead.arcana === n1.arcana && lead.arcana === n2.arcana) {
      const levels = new Set([x.level, y.level, z.level]);
      const pick = (lists.get(lead.arcana) ?? []).find((p) => !levels.has(p.level) && p.level >= target);
      return pick
        ? this.succeed(pick.id, 'triangle', ctx, { targetLevel: target, intermediateArcana: lead.arcana, leadId: lead.id })
        : fail('empty-arcana-pool', `No ${lead.arcana} persona sits at or above Lv ${fmt(target)} besides these three.`);
    }

    const middle = n1.arcana === n2.arcana ? n1.arcana : this.data.fusionChart.normal[n1.arcana]?.[n2.arcana];
    if (!middle) return fail('no-arcana-result', `${n1.arcana} × ${n2.arcana} has no fusion result to cross with ${lead.name}.`);
    const arcana = this.data.fusionChart.triple[lead.arcana]?.[middle];
    if (!arcana) return fail('no-arcana-result', `${lead.arcana} × ${middle} has no triangle result.`);

    const list = lists.get(arcana) ?? [];
    let index = list.findIndex((p) => p.level >= target);
    if (index === -1) return fail('empty-arcana-pool', `No ${arcana} persona reaches Lv ${fmt(target)}.`);
    let bumped = false;
    if (ids.has(list[index].id)) {
      if (index + 1 >= list.length) return fail('empty-arcana-pool', `The only ${arcana} result is one of the ingredients.`);
      index += 1;
      bumped = true;
    }
    return this.succeed(list[index].id, 'triangle', ctx, { targetLevel: target, intermediateArcana: middle, leadId: lead.id, bumped });
  }

  // ---- reverse & forward listings ----------------------------------------

  /**
   * Every two-persona way to make `targetId` — normal, same-arcana and
   * two-ingredient specials — memoised per unlock state. Triangles are listed
   * separately ({@link trianglesFor}) because there are far more of them.
   */
  recipesFor(targetId: PersonaId, ctx: FusionContext): readonly Recipe[] {
    return this.pairIndex(ctx).get(targetId) ?? [];
  }

  /** The special recipe that makes `targetId`, if any, whatever its size. */
  specialFor(targetId: PersonaId): Recipe | null {
    const ingredients = this.specialByResult.get(targetId);
    return ingredients ? { resultId: targetId, ingredientIds: ingredients, path: 'special' } : null;
  }

  /**
   * Every three-persona triangle that makes `targetId`, computed on demand and
   * memoised per target and unlock state. The scan prunes on arcana: only lead
   * personas whose arcana can reach the target's on the triangle chart are tried.
   */
  trianglesFor(targetId: PersonaId, ctx: FusionContext): readonly Recipe[] {
    const memoKey = `${targetId} ${unlockSig(ctx.unlockGroups)}`;
    const cached = this.trianglesMemo.get(memoKey);
    if (cached) return cached;

    const out: Recipe[] = [];
    const target = this.personaById.get(targetId);
    if (target && target.kind === 'normal') {
      const universe = [...this.universe(ctx.unlockGroups)].sort(leadOrder);
      // Which middle arcana reach the target's arcana for each lead arcana.
      const middlesFor = new Map<ArcanaId, Set<ArcanaId>>();
      for (const [lead, row] of Object.entries(this.data.fusionChart.triple)) {
        const set = new Set<ArcanaId>();
        for (const [middle, result] of Object.entries(row)) if (result === target.arcana) set.add(middle as ArcanaId);
        middlesFor.set(lead as ArcanaId, set);
      }
      for (let i = 0; i < universe.length; i++) {
        const lead = universe[i];
        const middles = middlesFor.get(lead.arcana);
        if (!middles || middles.size === 0) continue;
        // Everything after `lead` in lead order is a valid lower member.
        for (let j = i + 1; j < universe.length; j++) {
          for (let k = j + 1; k < universe.length; k++) {
            const a = universe[j];
            const b = universe[k];
            const middle = a.arcana === b.arcana ? a.arcana : this.data.fusionChart.normal[a.arcana]?.[b.arcana];
            if (!middle || !middles.has(middle)) continue;
            const o = this.fuse([lead.id, a.id, b.id], ctx);
            if (o.ok && o.resultId === targetId && o.path === 'triangle') {
              out.push({ resultId: targetId, ingredientIds: [lead.id, a.id, b.id], path: 'triangle' });
            }
          }
        }
      }
    }
    this.trianglesMemo.set(memoKey, out);
    return out;
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
    extra: Partial<Pick<FusionSuccess, 'targetLevel' | 'clampedToCeiling' | 'bumped' | 'intermediateArcana' | 'leadId'>> = {},
  ): FusionSuccess {
    const result = this.personaById.get(resultId)!;
    return {
      ok: true,
      resultId,
      path,
      targetLevel: extra.targetLevel ?? null,
      intermediateArcana: extra.intermediateArcana ?? null,
      leadId: extra.leadId ?? null,
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

/** Triangle lead order: highest level first; a tie goes to the earlier arcana. */
function leadOrder(a: Persona, b: Persona): number {
  return b.level - a.level || (ARCANA_INDEX.get(a.arcana) ?? 0) - (ARCANA_INDEX.get(b.arcana) ?? 0) || a.id.localeCompare(b.id);
}

/** Order-independent key for a group of personas. */
function groupKey(ids: readonly PersonaId[]): string {
  return [...ids].sort().join(' ');
}

function unlockSig(unlock: UnlockState): string {
  return `${unlock.story ? 1 : 0}${unlock['social-link'] ? 1 : 0}`;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '');
}

function fail(code: FusionInvalidCode, message: string): FusionInvalid {
  return { ok: false, code, message };
}
