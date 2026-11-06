import type { AiSchemaProperty, AiTool, AiToolParameters } from './ai.model';

/** One persona or demon, in the terms the tools need. */
export interface RosterEntry {
  readonly id: string;
  readonly name: string;
  /** Arcana or race. */
  readonly group: string;
  readonly level: number;
  readonly owned: boolean;
  /** Skills it learns on its own. */
  readonly skillIds: readonly string[];
}

export interface SkillEntry {
  readonly id: string;
  readonly name: string;
  readonly element: string;
}

export interface RecipeLike {
  readonly resultId: string;
  readonly ingredientIds: readonly string[];
  readonly path: string;
}

export type FuseResult =
  | { readonly ok: true; readonly resultId: string; readonly path: string; readonly blockedByLevel: boolean }
  | { readonly ok: false; readonly message: string };

export interface RouteQuery {
  readonly targetId: string;
  readonly skillIds: readonly string[];
  readonly objective: 'fewest-steps' | 'cheapest' | 'fewest-unowned';
  /** `owned`: only what's in the compendium. `open`: also what's obtainable at the player's level. */
  readonly pool: 'owned' | 'open';
  readonly maxDepth: number;
}

/**
 * The narrow view of a game the shared tools work from. Every game has a roster, a
 * skill list, a fusion engine and a route finder, under slightly different names;
 * each adapter maps its own onto this, and the tools are written once.
 */
export interface RosterSource {
  /** "persona" or "demon". */
  readonly noun: string;
  /** Whether find_route can plan for requested skills. */
  readonly routesPlanSkills: boolean;
  playerLevel(): number;
  /** False when the player has switched the level cap off. */
  levelCapped(): boolean;
  roster(): readonly RosterEntry[];
  skills(): readonly SkillEntry[];
  detail(id: string): unknown;
  skillDetail(id: string): unknown;
  recipesFor(id: string): readonly RecipeLike[];
  fusionsFrom(id: string): readonly RecipeLike[];
  /** Fixed recipes {@link fusionsFrom} doesn't list, for games that keep them apart. */
  specialRecipes?(): readonly RecipeLike[];
  fuse(ids: readonly string[]): FuseResult;
  route(query: RouteQuery): unknown;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 60;
const MAX_ROUTE_DEPTH = 4;

/** The nine lookups every game offers the model. */
export function rosterTools(source: RosterSource): readonly AiTool[] {
  const { noun } = source;
  const byName = (): Named<RosterEntry> => named(source.roster(), noun);
  const skillsByName = (): Named<SkillEntry> => named(source.skills(), 'skill');
  const nameOf = (id: string): string => source.roster().find((r) => r.id === id)?.name ?? id;

  const aboveLevel = (entry: RosterEntry): boolean => source.levelCapped() && entry.level > source.playerLevel();

  /** Ingredient rows for a recipe, plus how many the player still needs. */
  const describeRecipe = (recipe: RecipeLike) => {
    const roster = byName();
    const ingredients = recipe.ingredientIds.map((id) => {
      const entry = roster.byId(id);
      return { name: entry?.name ?? id, level: entry?.level ?? null, owned: entry?.owned ?? false };
    });
    return { ingredients, path: recipe.path, missing: ingredients.filter((i) => !i.owned).length };
  };

  return [
    {
      name: 'search_roster',
      description: `Find ${noun}s by any mix of name, arcana or race, level range, ownership and known skill. Returns name, group, level and ownership.`,
      parameters: params({
        query: text(`Part of the ${noun}'s name.`),
        group: text('Arcana or race, for example "magician".'),
        min_level: integer('Lowest base level.'),
        max_level: integer('Highest base level.'),
        owned: flag('true for only compendium entries, false for only unregistered ones.'),
        knows_skill: text('Exact skill name it learns on its own.'),
        limit: integer(`Most rows to return, up to ${MAX_LIMIT}. Default ${DEFAULT_LIMIT}.`),
      }),
      run: (args) => {
        const skillId = args['knows_skill'] ? skillsByName().resolve(args['knows_skill'] as string).id : null;
        const rows = source.roster().filter((r) => {
          if (args['query'] && !fold(r.name).includes(fold(args['query'] as string))) return false;
          if (args['group'] && fold(r.group) !== fold(args['group'] as string)) return false;
          if (args['min_level'] != null && r.level < (args['min_level'] as number)) return false;
          if (args['max_level'] != null && r.level > (args['max_level'] as number)) return false;
          if (args['owned'] != null && r.owned !== args['owned']) return false;
          return !skillId || r.skillIds.includes(skillId);
        });
        return page(rows, args, (r) => ({ name: r.name, group: r.group, level: r.level, owned: r.owned }));
      },
    },
    {
      name: 'get_details',
      description: `Everything known about one ${noun}: stats, affinities, skills, how it's obtained, and the player's registered copy if any.`,
      parameters: params({ name: text(`The ${noun}'s name.`) }, ['name']),
      run: (args) => source.detail(byName().resolve(args['name'] as string).id),
    },
    {
      name: 'search_skills',
      description: 'Find skills by name and/or element. Returns names and elements only; use get_skill for details.',
      parameters: params({
        query: text("Part of the skill's name."),
        element: text('Element, for example "fire" or "support".'),
        limit: integer(`Most rows to return, up to ${MAX_LIMIT}. Default ${DEFAULT_LIMIT}.`),
      }),
      run: (args) => {
        const rows = source.skills().filter((s) => {
          if (args['query'] && !fold(s.name).includes(fold(args['query'] as string))) return false;
          return !args['element'] || fold(s.element) === fold(args['element'] as string);
        });
        return page(rows, args, (s) => ({ name: s.name, element: s.element }));
      },
    },
    {
      name: 'get_skill',
      description: `What one skill does, where its skill card comes from if it has one, and which ${noun}s learn it.`,
      parameters: params({ name: text("The skill's name.") }, ['name']),
      run: (args) => {
        const skill = skillsByName().resolve(args['name'] as string);
        const learners = source.roster().filter((r) => r.skillIds.includes(skill.id));
        return {
          ...(source.skillDetail(skill.id) as object),
          learned_by: learners.slice(0, MAX_LIMIT).map((r) => ({ name: r.name, level: r.level, owned: r.owned })),
        };
      },
    },
    {
      name: 'recipes_for',
      description: `Ways to fuse a target ${noun}, under the player's unlock settings. Most practical first: fewest ingredients the player doesn't own, then lowest levels.`,
      parameters: params(
        {
          target: text(`The ${noun} to make.`),
          owned_only: flag('Only recipes where the player owns every ingredient.'),
          limit: integer(`Most rows to return, up to ${MAX_LIMIT}. Default ${DEFAULT_LIMIT}.`),
        },
        ['target'],
      ),
      run: (args) => {
        const target = byName().resolve(args['target'] as string);
        const rows = source.recipesFor(target.id).map(describeRecipe);
        const ranked = rows
          .filter((r) => !args['owned_only'] || r.missing === 0)
          .sort((a, b) => a.missing - b.missing || highestLevel(a.ingredients) - highestLevel(b.ingredients));
        return {
          target: target.name,
          target_level: target.level,
          above_player_level: aboveLevel(target),
          ...page(ranked, args, (r) => r),
        };
      },
    },
    {
      name: 'fusions_from',
      description: `What a ${noun} can make when used as an ingredient, with each partner.`,
      parameters: params(
        {
          ingredient: text(`The ${noun} to fuse.`),
          owned_partners_only: flag('Only partners the player owns.'),
          limit: integer(`Most rows to return, up to ${MAX_LIMIT}. Default ${DEFAULT_LIMIT}.`),
        },
        ['ingredient'],
      ),
      run: (args) => {
        const roster = byName();
        const parent = roster.resolve(args['ingredient'] as string);
        const rows = source
          .fusionsFrom(parent.id)
          .map((recipe) => ({
            result: roster.byId(recipe.resultId),
            partners: recipe.ingredientIds.filter((id) => id !== parent.id).map((id) => roster.byId(id)),
            path: recipe.path,
          }))
          .filter((r) => !args['owned_partners_only'] || r.partners.every((p) => p?.owned))
          .sort((a, b) => (b.result?.level ?? 0) - (a.result?.level ?? 0));
        return {
          ingredient: parent.name,
          ...page(rows, args, (r) => ({
            result: r.result?.name,
            result_level: r.result?.level,
            result_owned: r.result?.owned,
            above_player_level: r.result ? aboveLevel(r.result) : false,
            partners: r.partners.map((p) => p?.name),
            path: r.path,
          })),
        };
      },
    },
    {
      name: 'fuse',
      description: `The result of fusing exact ${noun}s together.`,
      parameters: params({ ingredients: list(`The ${noun}s to fuse, at least two.`) }, ['ingredients']),
      run: (args) => {
        const roster = byName();
        const parents = (args['ingredients'] as string[]).map((name) => roster.resolve(name));
        const outcome = source.fuse(parents.map((p) => p.id));
        if (!outcome.ok) return { fusable: false, reason: outcome.message };
        const result = roster.byId(outcome.resultId);
        return {
          fusable: true,
          result: result?.name ?? outcome.resultId,
          result_level: result?.level ?? null,
          result_owned: result?.owned ?? false,
          path: outcome.path,
          above_player_level: outcome.blockedByLevel,
        };
      },
    },
    {
      name: 'fusable_now',
      description: `Every distinct ${noun} the player can make right now using only ${noun}s they already own, highest level first, with one recipe for each. Excludes what's above their level.`,
      parameters: params({
        include_owned: flag(`Also list results already in the compendium. Default false.`),
        limit: integer(`Most rows to return, up to ${MAX_LIMIT}. Default ${DEFAULT_LIMIT}.`),
      }),
      run: (args) => {
        const roster = byName();
        const owned = source.roster().filter((r) => r.owned);
        const found = new Map<string, { result: RosterEntry; via: readonly string[]; path: string }>();
        const candidates = [...owned.flatMap((parent) => source.fusionsFrom(parent.id)), ...(source.specialRecipes?.() ?? [])];
        for (const recipe of candidates) {
          const result = roster.byId(recipe.resultId);
          if (!result || found.has(result.id) || aboveLevel(result)) continue;
          if (result.owned && !args['include_owned']) continue;
          if (!recipe.ingredientIds.every((id) => roster.byId(id)?.owned)) continue;
          found.set(result.id, { result, via: recipe.ingredientIds.map(nameOf), path: recipe.path });
        }
        const rows = [...found.values()].sort((a, b) => b.result.level - a.result.level);
        return {
          owned_count: owned.length,
          ...page(rows, args, (r) => ({
            name: r.result.name,
            group: r.result.group,
            level: r.result.level,
            owned: r.result.owned,
            one_recipe: r.via,
            path: r.path,
          })),
        };
      },
    },
    {
      name: 'find_route',
      description: `Plan a multi-step fusion chain to a target ${noun}${
        source.routesPlanSkills ? ', optionally ending with specific inherited skills' : ''
      }. Slower than the other tools, so call it for a specific goal. Returns ranked routes as ordered steps.`,
      parameters: params(
        {
          target: text(`The ${noun} to end up with.`),
          ...(source.routesPlanSkills
            ? { skills: list('Skill names the result must end up with. Omit for just the target.') }
            : {}),
          objective: { type: 'string', description: 'What to minimise. Default fewest-steps.', enum: ['fewest-steps', 'cheapest', 'fewest-unowned'] },
          pool: {
            type: 'string',
            description: `owned: only the compendium. open: also ${noun}s obtainable at the player's level. Default owned.`,
            enum: ['owned', 'open'],
          },
          max_depth: integer(`How many fusions deep to search, 1 to ${MAX_ROUTE_DEPTH}. Default 3.`),
        },
        ['target'],
      ),
      run: (args) => {
        const depth = (args['max_depth'] as number | undefined) ?? 3;
        return source.route({
          targetId: byName().resolve(args['target'] as string).id,
          skillIds: ((args['skills'] as string[] | undefined) ?? []).map((name) => skillsByName().resolve(name).id),
          objective: (args['objective'] as RouteQuery['objective'] | undefined) ?? 'fewest-steps',
          pool: (args['pool'] as RouteQuery['pool'] | undefined) ?? 'owned',
          maxDepth: Math.min(MAX_ROUTE_DEPTH, Math.max(1, depth)),
        });
      },
    },
  ];
}

// ---- shared pieces for the game adapters -----------------------------------

/** A finished route as ordered, readable steps. Accepts every game's tree shape. */
export interface RouteNodeLike {
  readonly kind: 'leaf' | 'fusion';
  readonly personaId?: string;
  readonly demonId?: string;
  readonly owned?: boolean;
  readonly resultId?: string;
  readonly children?: readonly RouteNodeLike[];
}

export function routePlan(tree: RouteNodeLike, nameOf: (id: string) => string) {
  const steps: string[] = [];
  const start: { name: string; owned: boolean }[] = [];
  const idOf = (n: RouteNodeLike): string => n.personaId ?? n.demonId ?? n.resultId ?? '';
  const walk = (node: RouteNodeLike): void => {
    if (node.kind === 'leaf') {
      start.push({ name: nameOf(idOf(node)), owned: node.owned ?? false });
      return;
    }
    const children = node.children ?? [];
    children.forEach(walk);
    steps.push(`${children.map((c) => nameOf(idOf(c))).join(' + ')} → ${nameOf(idOf(node))}`);
  };
  walk(tree);
  return { start_with: start, steps };
}

/** Group a resistance table by affinity, dropping the neutral ones. */
export function affinitySummary(affinities: Readonly<Record<string, string>>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [element, affinity] of Object.entries(affinities)) {
    if (affinity !== 'neutral') (out[affinity] ??= []).push(element);
  }
  return out;
}

/** One enemy, in the terms the shared enemy search needs. */
export interface EnemyRow {
  readonly name: string;
  readonly group: string | null;
  readonly level: number;
  readonly boss: boolean;
  readonly areas: readonly string[];
  readonly hp: number | null;
  readonly affinities: Readonly<Record<string, string[]>>;
  readonly skills: readonly string[];
  readonly drops: readonly string[];
}

/** Search the enemy list, for the games that have one. */
export function enemySearchTool(enemies: () => readonly EnemyRow[], label = 'shadow'): AiTool {
  return {
    name: 'search_enemies',
    description: `Find ${label}s and bosses by name, weakness or area. Returns level, HP, affinities, skills, drops and where they appear.`,
    parameters: params({
      query: text('Part of the name.'),
      weak_to: text('An element it is weak to, for example "fire".'),
      area: text('Part of an area name.'),
      limit: integer(`Most rows to return, up to ${MAX_LIMIT}. Default ${DEFAULT_LIMIT}.`),
    }),
    run: (args) => {
      const rows = enemies().filter((e) => {
        if (args['query'] && !fold(e.name).includes(fold(args['query'] as string))) return false;
        if (args['weak_to'] && !(e.affinities['weak'] ?? []).some((w) => fold(w) === fold(args['weak_to'] as string))) return false;
        return !args['area'] || e.areas.some((a) => fold(a).includes(fold(args['area'] as string)));
      });
      return page(rows, args, (e) => e);
    },
  };
}

export function params(
  properties: Readonly<Record<string, AiSchemaProperty>>,
  required: readonly string[] = [],
): AiToolParameters {
  return { type: 'object', properties, required, additionalProperties: false };
}

export const text = (description: string): AiSchemaProperty => ({ type: 'string', description });
export const integer = (description: string): AiSchemaProperty => ({ type: 'integer', description });
export const flag = (description: string): AiSchemaProperty => ({ type: 'boolean', description });
const list = (description: string): AiSchemaProperty => ({ type: 'array', description, items: { type: 'string' } });

/** The limit-and-count wrapper every listing shares, so the model knows when it saw only part. */
export function page<T, R>(rows: readonly T[], args: Readonly<Record<string, unknown>>, map: (row: T) => R) {
  const limit = Math.min(MAX_LIMIT, Math.max(1, (args['limit'] as number | undefined) ?? DEFAULT_LIMIT));
  return { total: rows.length, showing: Math.min(limit, rows.length), results: rows.slice(0, limit).map(map) };
}

const highestLevel = (ingredients: readonly { level: number | null }[]): number =>
  Math.max(...ingredients.map((i) => i.level ?? 99));

/** Case, spacing and punctuation-insensitive, so "jack frost" finds "Jack-Frost". */
const fold = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

interface Named<T> {
  byId(id: string): T | undefined;
  /** Exact match, then a unique partial match; otherwise throws with suggestions for the model. */
  resolve(name: string): T;
}

function named<T extends { readonly id: string; readonly name: string }>(items: readonly T[], noun: string): Named<T> {
  const ids = new Map(items.map((item) => [item.id, item] as const));
  return {
    byId: (id) => ids.get(id),
    resolve: (name) => {
      const wanted = fold(name);
      const exact = items.find((item) => fold(item.name) === wanted);
      if (exact) return exact;
      const partial = wanted === '' ? [] : items.filter((item) => fold(item.name).includes(wanted));
      if (partial.length === 1) return partial[0];
      if (partial.length > 1) {
        throw new Error(`"${name}" matches several ${noun}s: ${partial.slice(0, 10).map((p) => p.name).join(', ')}.`);
      }
      throw new Error(`No ${noun} called "${name}" in this game. Try a search tool.`);
    },
  };
}
