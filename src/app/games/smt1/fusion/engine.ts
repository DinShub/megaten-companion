/**
 * The SMT1 fusion rules engine.
 *
 * Pure and deterministic: constructed from the datasets, it answers "what do
 * these two (or three) demons make", "what makes this target" and "what does
 * this demon fuse into". The rules are transcribed from upstream
 * (`compendium/fusions/smt-nonelem-fusions.ts`, `snes-dark-fusions.ts`,
 * `per-triple-fusions.ts` and `smt1/models/compendium.ts`, as configured by
 * `smt1/compendium.module.ts`); where a reading disagrees with upstream,
 * upstream wins, except for the two deliberate changes in SPEC §17.1:
 *
 *  - special recipes apply forward (upstream only lists them), and
 *  - the dark-race rule applies forward too (upstream has it only in reverse),
 *    so forward and reverse always agree. Reverse is computed by inverting forward.
 *
 * Pair rules, in the order {@link FusionEngine.fuse} applies them:
 *  1. **special** — a fixed two-demon recipe (Barong + Rangda → Shiva).
 *  2. **element** — an element moves its partner up or down within the
 *     partner's race (its fusable results, the partner's own level slotted in
 *     if it isn't one of them). Two elements make nothing.
 *  3. **dark** — a dark-race demon and a light or neutral one, the light one at
 *     least as high: if the level sum is a multiple of 7 the light one moves two
 *     ranks up its race, else of 5 one up, else of 3 one down. Two dark demons
 *     make nothing.
 *  4. **same-race** — two demons of one race make that race's element.
 *  5. **normal / species** — the chart gives a race or a species; the result is
 *     the lowest fusable demon there at or above `(a + b) / 2 + 1.5`, clamped to
 *     the top. If that is an ingredient, the next one up is taken.
 *
 * Triple ({@link FusionEngine.fuse3}): a three-demon special recipe first; else
 * the highest-level demon (it must be strictly highest) picks the column and the
 * other two the row (a pair of different species) of the triple chart, and the
 * result is the lowest of that race at or above `(sum + 22.5) / 3`, with no clamp.
 */
import { displayLevel } from '../model';
import type { ChartResult, Demon, DemonId, RaceId, SpeciesId } from '../model';
import type { FusionContext, FusionData, FusionInvalid, FusionInvalidCode, FusionOutcome, FusionPath, FusionSuccess, Recipe } from './types';

/** Upstream `normalLvlModifier`. */
const PAIR_LEVEL_MODIFIER = 1.5;
/** Upstream `SpeciesFusionChart.lvlModifier` (the triple rule's), times three. */
const TRIPLE_LEVEL_MODIFIER = 3 * 7.5;

/** Re-summon cost: upstream's SMT1 price, the whole level cubed. An estimate, labelled so. */
export function summonCost(demon: Demon): number {
  return Math.pow(Math.floor(demon.level), 3);
}

export class FusionEngine {
  private readonly demonById: ReadonlyMap<DemonId, Demon>;
  private readonly lightDark: ReadonlyMap<RaceId, 'light' | 'neutral' | 'dark'>;
  private readonly speciesOf: ReadonlyMap<RaceId, SpeciesId>;
  private readonly elementIds: ReadonlySet<DemonId>;
  /** Per race: the demons the chart and the shifts can produce, level-ascending. */
  private readonly resultsByRace: ReadonlyMap<RaceId, readonly Demon[]>;
  /** Per species: its races' results together; at a shared level the earlier race wins (upstream's lookup). */
  private readonly resultsBySpecies: ReadonlyMap<SpeciesId, readonly Demon[]>;
  /** Upstream's tri-level: the level plus a tie-break of 0.01 per race below it in its species. */
  private readonly triLevel: ReadonlyMap<DemonId, number>;
  private readonly specialByKey: ReadonlyMap<string, DemonId>;
  private readonly tripleRow: ReadonlyMap<string, Readonly<Partial<Record<SpeciesId, RaceId>>>>;
  private allPairs: Map<string, FusionOutcome> | null = null;

  constructor(private readonly data: FusionData) {
    this.demonById = new Map(data.demons.map((d) => [d.id, d]));
    this.lightDark = new Map(data.races.races.map((r) => [r.id, r.light]));
    this.speciesOf = new Map(data.races.races.map((r) => [r.id, r.species]));
    this.elementIds = new Set(data.elementChart.elementIds);

    const byRace = new Map<RaceId, Demon[]>();
    for (const d of data.demons) {
      if (d.kind !== 'normal') continue;
      const list = byRace.get(d.race);
      if (list) list.push(d);
      else byRace.set(d.race, [d]);
    }
    for (const list of byRace.values()) list.sort((a, b) => a.level - b.level);
    this.resultsByRace = byRace;

    const bySpecies = new Map<SpeciesId, Demon[]>();
    const tri = new Map<DemonId, number>();
    for (const sp of data.races.species) {
      const atLevel = new Map<number, Demon>();
      sp.raceIds.forEach((race, k) => {
        for (const d of data.demons.filter((x) => x.race === race)) {
          tri.set(d.id, (d.level * 100 + (sp.raceIds.length - 1 - k)) / 100);
          if (d.kind === 'normal' && !atLevel.has(d.level)) atLevel.set(d.level, d);
        }
      });
      bySpecies.set(sp.id, [...atLevel.values()].sort((a, b) => a.level - b.level));
    }
    this.resultsBySpecies = bySpecies;
    this.triLevel = tri;

    this.specialByKey = new Map(data.specialRecipes.recipes.map((r) => [setKey(r.ingredientIds), r.resultId]));
    this.tripleRow = new Map(data.tripleChart.rows.map((row) => [setKey(row.pair), row.results]));
  }

  demon(id: DemonId): Demon | undefined {
    return this.demonById.get(id);
  }

  isElement(id: DemonId): boolean {
    return this.elementIds.has(id);
  }

  isDarkRace(race: RaceId): boolean {
    return this.lightDark.get(race) === 'dark';
  }

  /** The special recipe that makes a demon, if any. */
  specialRecipeFor(id: DemonId): readonly DemonId[] | null {
    return this.data.specialRecipes.recipes.find((r) => r.resultId === id)?.ingredientIds ?? null;
  }

  /** What two or three demons make. */
  fuseAny(ids: readonly DemonId[], ctx: FusionContext): FusionOutcome {
    if (ids.length < 2) return fail('too-few-parents', 'Pick at least two demons.');
    if (ids.length > 3) return fail('too-many-parents', 'Fusion takes two or three demons.');
    return ids.length === 2 ? this.fuse(ids[0], ids[1], ctx) : this.fuse3(ids[0], ids[1], ids[2], ctx);
  }

  /** What two demons make. */
  fuse(aId: DemonId, bId: DemonId, ctx: FusionContext): FusionOutcome {
    const a = this.demonById.get(aId);
    const b = this.demonById.get(bId);
    if (!a || !b) return fail('unknown-demon', `Unknown demon: ${!a ? aId : bId}.`);
    if (a.id === b.id) return fail('duplicate-parents', 'A demon cannot be fused with itself.');

    const special = this.specialByKey.get(setKey([a.id, b.id]));
    if (special) return this.success(special, 'special', ctx, { chartSays: this.chartCell(a, b) });

    const aEl = this.isElement(a.id);
    const bEl = this.isElement(b.id);
    if (aEl && bEl) return fail('element-pair', 'Two elements make nothing on their own.');
    if (aEl || bEl) {
      const [element, partner] = aEl ? [a, b] : [b, a];
      const shift = this.data.elementChart.shifts[partner.race]?.[element.id];
      if (shift !== undefined) return this.rankShift(partner, shift, 'element', ctx);
      if (!this.isDarkRace(partner.race)) return fail('element-no-shift', `${partner.name}'s race doesn't react with ${element.name}.`);
    }

    const aDark = this.isDarkRace(a.race);
    const bDark = this.isDarkRace(b.race);
    if (aDark && bDark) return fail('dark-pair', 'Two dark demons make nothing.');
    if (aDark || bDark) {
      const [dark, light] = aDark ? [a, b] : [b, a];
      return this.darkShift(light, dark, ctx);
    }

    const cell = this.chartCell(a, b);
    if (a.race === b.race) {
      if (cell?.kind === 'element') return this.success(cell.id, 'same-race', ctx);
      return fail('no-race-result', `Two ${raceName(a.race)} demons make nothing.`);
    }
    if (!cell || cell.kind === 'element') return fail('no-race-result', `${raceName(a.race)} and ${raceName(b.race)} don't fuse.`);

    const pool = cell.kind === 'race' ? this.resultsByRace.get(cell.id) : this.resultsBySpecies.get(cell.id);
    if (!pool?.length) return fail('empty-race-pool', `No ${cell.id} demon can be fused.`);
    const target = (a.level + b.level) / 2 + PAIR_LEVEL_MODIFIER;
    let index = pool.findIndex((d) => d.level >= target);
    const clamped = index === -1;
    if (clamped) index = pool.length - 1;
    let bumped = false;
    while (pool[index] && (pool[index].id === a.id || pool[index].id === b.id)) {
      index += 1;
      bumped = true;
    }
    if (!pool[index]) return fail('result-is-ingredient', 'The only result here is one of the ingredients.');
    return this.success(pool[index].id, cell.kind === 'race' ? 'normal' : 'species', ctx, { targetLevel: target, clampedToCeiling: clamped, bumped });
  }

  /** What three demons make. */
  fuse3(aId: DemonId, bId: DemonId, cId: DemonId, ctx: FusionContext): FusionOutcome {
    const ds = [aId, bId, cId].map((id) => this.demonById.get(id));
    const missing = [aId, bId, cId].find((_, i) => !ds[i]);
    if (missing) return fail('unknown-demon', `Unknown demon: ${missing}.`);
    const [a, b, c] = ds as [Demon, Demon, Demon];
    if (new Set([a.id, b.id, c.id]).size < 3) return fail('duplicate-parents', 'Pick three different demons.');

    const special = this.specialByKey.get(setKey([a.id, b.id, c.id]));
    if (special) return this.success(special, 'special', ctx);

    const sorted = [a, b, c].sort((x, y) => y.level - x.level);
    const [top, n1, n2] = sorted;
    if (top.level === n1.level) return fail('triple-tie', `${top.name} and ${n1.name} share the highest level; one demon must be strictly highest.`);

    const s1 = this.speciesOf.get(n1.race);
    const s2 = this.speciesOf.get(n2.race);
    const sTop = this.speciesOf.get(top.race);
    const row = s1 && s2 && s1 !== s2 ? this.tripleRow.get(setKey([s1, s2])) : undefined;
    const race = row && sTop ? row[sTop] : undefined;
    if (!race) return fail('no-triple-result', 'The triple chart has nothing for these three.');

    const pool = this.resultsByRace.get(race);
    if (!pool?.length) return fail('empty-race-pool', `No ${raceName(race)} demon can be fused.`);
    const sum = top.level + (this.triLevel.get(n1.id) ?? n1.level) + (this.triLevel.get(n2.id) ?? n2.level);
    let index = pool.findIndex((d) => 3 * d.level - TRIPLE_LEVEL_MODIFIER >= sum);
    if (index === -1) return fail('no-triple-result', `These three are too high for any ${raceName(race)}.`);
    let bumped = false;
    while (pool[index] && [a.id, b.id, c.id].includes(pool[index].id)) {
      index += 1;
      bumped = true;
    }
    if (!pool[index]) return fail('result-is-ingredient', 'The only result here is one of the ingredients.');
    return this.success(pool[index].id, 'triple', ctx, { targetLevel: (sum + TRIPLE_LEVEL_MODIFIER) / 3, bumped });
  }

  /** Every pair that makes `targetId`, special recipes first. The level cap doesn't hide recipes. */
  pairRecipesFor(targetId: DemonId): Recipe[] {
    const out: Recipe[] = [];
    for (const [key, outcome] of this.pairs()) {
      if (outcome.ok && outcome.resultId === targetId) out.push({ resultId: targetId, ingredientIds: key.split('|'), path: outcome.path });
    }
    return out.sort(byPath);
  }

  /**
   * Every trio that makes `targetId`. Enumerates only the triple-chart cells
   * that give the target's race, so it stays cheap, then confirms each trio
   * through {@link fuse3}.
   */
  tripleRecipesFor(targetId: DemonId, ctx: FusionContext): Recipe[] {
    const target = this.demonById.get(targetId);
    if (!target) return [];
    const out: Recipe[] = [];
    const special = this.data.specialRecipes.recipes.find((r) => r.resultId === targetId && r.ingredientIds.length === 3);
    if (special) out.push({ resultId: targetId, ingredientIds: special.ingredientIds, path: 'special' });

    const inSpecies = (s: SpeciesId): Demon[] => this.data.demons.filter((d) => this.speciesOf.get(d.race) === s);
    for (const row of this.data.tripleChart.rows) {
      for (const [sTop, race] of Object.entries(row.results) as [SpeciesId, RaceId][]) {
        if (race !== target.race) continue;
        const tops = inSpecies(sTop);
        const lows1 = inSpecies(row.pair[0]);
        const lows2 = inSpecies(row.pair[1]);
        for (const t of tops) {
          for (const x of lows1) {
            if (x.level >= t.level) continue;
            for (const y of lows2) {
              if (y.level >= t.level) continue;
              const r = this.fuse3(t.id, x.id, y.id, ctx);
              if (r.ok && r.path === 'triple' && r.resultId === targetId) out.push({ resultId: targetId, ingredientIds: [t.id, x.id, y.id], path: 'triple' });
            }
          }
        }
      }
    }
    return out;
  }

  /** Everything `demonId` makes with one partner, partner by partner. */
  fusionsOf(demonId: DemonId, ctx: FusionContext): { readonly partnerId: DemonId; readonly outcome: FusionSuccess }[] {
    const out: { partnerId: DemonId; outcome: FusionSuccess }[] = [];
    for (const other of this.data.demons) {
      if (other.id === demonId) continue;
      const r = this.fuse(demonId, other.id, ctx);
      if (r.ok) out.push({ partnerId: other.id, outcome: r });
    }
    return out;
  }

  /**
   * Every pair's outcome, computed once (≈31.6k pairs). The table is
   * context-free — `blockedByLevel` is always false in it — so callers apply
   * the level cap themselves (see {@link isAboveLevel}).
   */
  pairs(): ReadonlyMap<string, FusionOutcome> {
    if (!this.allPairs) {
      const free: FusionContext = { heroLevel: 99, enforceLevelCap: false };
      const map = new Map<string, FusionOutcome>();
      const ds = this.data.demons;
      for (let i = 0; i < ds.length; i++) {
        for (let j = i + 1; j < ds.length; j++) {
          map.set(setKey([ds[i].id, ds[j].id]), this.fuse(ds[i].id, ds[j].id, free));
        }
      }
      this.allPairs = map;
    }
    return this.allPairs;
  }

  /** Whether a demon is above the hero's level, honouring the cap switch. */
  isAboveLevel(id: DemonId, ctx: FusionContext): boolean {
    const d = this.demonById.get(id);
    return ctx.enforceLevelCap && !!d && displayLevel(d) > ctx.heroLevel;
  }

  /** The chart cell for two demons' races, ignoring every other rule. */
  chartCell(a: Demon, b: Demon): ChartResult | null {
    return this.data.fusionChart.normal[a.race]?.[b.race] ?? null;
  }

  private rankShift(partner: Demon, shift: number, path: FusionPath, ctx: FusionContext): FusionOutcome {
    const levels = this.rankLadder(partner);
    const index = levels.findIndex((l) => l === partner.level) + shift;
    const lvl = levels[index];
    if (lvl === undefined || lvl === 0 || lvl === 100) return fail('element-out-of-range', `${partner.name} has no demon ${Math.abs(shift)} rank${Math.abs(shift) > 1 ? 's' : ''} ${shift > 0 ? 'above' : 'below'} it.`);
    const result = this.resultsByRace.get(partner.race)?.find((d) => d.level === lvl);
    if (!result) return fail('element-out-of-range', `${partner.name} has no demon there.`);
    return this.success(result.id, path, ctx);
  }

  /** Upstream's `[0, 0, …race results…, 100, 100]`, with the demon's own level slotted in. */
  private rankLadder(d: Demon): number[] {
    const levels = (this.resultsByRace.get(d.race) ?? []).map((x) => x.level);
    if (!levels.includes(d.level)) levels.push(d.level);
    levels.sort((x, y) => x - y);
    return [0, 0, ...levels, 100, 100];
  }

  /** The inverse of upstream's `splitWithDarkRace`. */
  private darkShift(light: Demon, dark: Demon, ctx: FusionContext): FusionOutcome {
    const levels = [0, 0, ...(this.resultsByRace.get(light.race) ?? []).map((x) => x.level), 100, 100];
    const at = levels.indexOf(light.level);
    if (at === -1) return fail('dark-no-rule', `${light.name} can't be moved within its race.`);
    if (light.level < dark.level) return fail('dark-no-rule', `${dark.name} is higher than ${light.name}; the dark rule needs the other demon at least as high.`);
    const sum = light.level + dark.level;
    const step = sum % 7 === 0 ? 2 : sum % 5 === 0 ? 1 : sum % 3 === 0 ? -1 : 0;
    if (step === 0) return fail('dark-no-rule', `Their levels add up to ${sum}, which isn't a multiple of 7, 5 or 3.`);
    const lvl = levels[at + step];
    if (lvl === 0 || lvl === 100 || lvl === undefined) return fail('element-out-of-range', `${light.name} has no demon ${step > 0 ? `${step} above` : 'below'} it.`);
    const result = this.resultsByRace.get(light.race)?.find((d) => d.level === lvl);
    if (!result) return fail('element-out-of-range', `${light.name} has no demon there.`);
    return this.success(result.id, 'dark', ctx);
  }

  private success(
    resultId: DemonId,
    path: FusionPath,
    ctx: FusionContext,
    extra: Partial<Pick<FusionSuccess, 'targetLevel' | 'clampedToCeiling' | 'bumped' | 'chartSays'>> = {},
  ): FusionSuccess {
    const result = this.demonById.get(resultId);
    return {
      ok: true,
      resultId,
      path,
      targetLevel: extra.targetLevel ?? null,
      clampedToCeiling: extra.clampedToCeiling ?? false,
      bumped: extra.bumped ?? false,
      blockedByLevel: !!result && this.isAboveLevel(result.id, ctx),
      chartSays: extra.chartSays ?? null,
    };
  }
}

/** Order-free key for a set of ids. */
function setKey(ids: readonly string[]): string {
  return [...ids].sort().join('|');
}

const PATH_ORDER: readonly FusionPath[] = ['special', 'element', 'dark', 'same-race', 'normal', 'species', 'triple'];
const byPath = (a: Recipe, b: Recipe): number => PATH_ORDER.indexOf(a.path) - PATH_ORDER.indexOf(b.path);

const raceName = (race: string): string => race[0].toUpperCase() + race.slice(1);

function fail(code: FusionInvalidCode, message: string): FusionInvalid {
  return { ok: false, code, message };
}
