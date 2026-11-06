import { runTool } from './run-tool';
import { affinitySummary, rosterTools, routePlan, type RosterEntry, type RosterSource, type RouteQuery } from './roster-tools';

const ROSTER: RosterEntry[] = [
  { id: 'a', name: 'Jack Frost', group: 'magician', level: 8, owned: true, skillIds: ['bufu'] },
  { id: 'b', name: 'Pixie', group: 'lovers', level: 2, owned: true, skillIds: ['dia'] },
  { id: 'c', name: 'Jack-o-Lantern', group: 'magician', level: 10, owned: false, skillIds: [] },
  { id: 'd', name: 'Surt', group: 'magician', level: 60, owned: false, skillIds: [] },
  { id: 'e', name: 'Silky', group: 'priestess', level: 9, owned: true, skillIds: [] },
];

let routeQuery: RouteQuery | null = null;

const SOURCE: RosterSource = {
  noun: 'persona',
  routesPlanSkills: true,
  playerLevel: () => 20,
  levelCapped: () => true,
  roster: () => ROSTER,
  skills: () => [
    { id: 'bufu', name: 'Bufu', element: 'ice' },
    { id: 'dia', name: 'Dia', element: 'healing' },
  ],
  detail: (id) => ({ id }),
  skillDetail: (id) => ({ id }),
  recipesFor: () => [
    { resultId: 'c', ingredientIds: ['c', 'd'], path: 'normal' },
    { resultId: 'c', ingredientIds: ['a', 'b'], path: 'normal' },
    { resultId: 'c', ingredientIds: ['a', 'd'], path: 'normal' },
  ],
  fusionsFrom: (id) =>
    id === 'a'
      ? [
          { resultId: 'c', ingredientIds: ['a', 'b'], path: 'normal' },
          { resultId: 'd', ingredientIds: ['a', 'e'], path: 'normal' }, // above the player's level
          { resultId: 'e', ingredientIds: ['a', 'b'], path: 'normal' }, // already owned
          { resultId: 'd', ingredientIds: ['a', 'c'], path: 'normal' }, // needs an unowned partner
        ]
      : [],
  fuse: (ids) => (ids.includes('d') ? { ok: false, message: 'No result.' } : { ok: true, resultId: 'c', path: 'normal', blockedByLevel: false }),
  route: (query) => {
    routeQuery = query;
    return { routes: [] };
  },
};

const TOOLS = rosterTools(SOURCE);
const call = (name: string, args: Record<string, unknown> = {}) => {
  const run = runTool(TOOLS, name, args);
  return { isError: run.isError, output: run.isError ? run.output : (JSON.parse(run.output) as Record<string, any>) };
};
const ok = (name: string, args: Record<string, unknown> = {}): Record<string, any> => {
  const result = call(name, args);
  expect(result.isError).toBe(false);
  return result.output as Record<string, any>;
};

describe('rosterTools', () => {
  it('declares schemas both providers accept', () => {
    for (const tool of TOOLS) {
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.additionalProperties).toBe(false);
      for (const key of tool.parameters.required) expect(tool.parameters.properties[key]).toBeDefined();
    }
  });

  it('search_roster combines filters and says how much it left out', () => {
    expect(ok('search_roster', { group: 'magician' })['total']).toBe(3);
    expect(ok('search_roster', { group: 'magician', owned: false, max_level: 20 })['results'].map((r: any) => r.name)).toEqual(['Jack-o-Lantern']);
    expect(ok('search_roster', { knows_skill: 'bufu' })['results'][0].name).toBe('Jack Frost');
    const limited = ok('search_roster', { limit: 2 });
    expect(limited['total']).toBe(5);
    expect(limited['showing']).toBe(2);
  });

  it('resolves names loosely but never guesses between several', () => {
    expect(ok('get_details', { name: 'jack frost' })).toEqual({ id: 'a' });
    expect(ok('get_details', { name: 'JACK-FROST' })).toEqual({ id: 'a' });
    expect(ok('get_details', { name: 'pix' })).toEqual({ id: 'b' });

    const ambiguous = call('get_details', { name: 'jack' });
    expect(ambiguous.isError).toBe(true);
    expect(ambiguous.output).toContain('Jack Frost');
    expect(ambiguous.output).toContain('Jack-o-Lantern');

    expect(call('get_details', { name: 'Nobody' }).isError).toBe(true);
    expect(call('get_details', { name: '' }).isError).toBe(true);
  });

  it('recipes_for puts the most practical first and can demand full ownership', () => {
    const all = ok('recipes_for', { target: 'Jack-o-Lantern' });
    expect(all['results'].map((r: any) => r.missing)).toEqual([0, 1, 2]);
    expect(all['above_player_level']).toBe(false);
    expect(ok('recipes_for', { target: 'Jack-o-Lantern', owned_only: true })['total']).toBe(1);
  });

  it('fusable_now lists only new results reachable from owned ingredients at this level', () => {
    const found = ok('fusable_now');
    expect(found['results'].map((r: any) => r.name)).toEqual(['Jack-o-Lantern']);
    expect(found['results'][0].one_recipe).toEqual(['Jack Frost', 'Pixie']);
    expect(ok('fusable_now', { include_owned: true })['results'].map((r: any) => r.name)).toEqual(['Jack-o-Lantern', 'Silky']);
  });

  it('fuse explains an impossible fusion', () => {
    expect(ok('fuse', { ingredients: ['Jack Frost', 'Pixie'] })['result']).toBe('Jack-o-Lantern');
    expect(ok('fuse', { ingredients: ['Jack Frost', 'Surt'] })).toEqual({ fusable: false, reason: 'No result.' });
  });

  it('find_route fills in defaults and clamps depth', () => {
    ok('find_route', { target: 'Surt', skills: ['Bufu'], max_depth: 99 });
    expect(routeQuery).toEqual({ targetId: 'd', skillIds: ['bufu'], objective: 'fewest-steps', pool: 'owned', maxDepth: 4 });
  });

  it('hides the skills argument where routes cannot plan for skills', () => {
    const tools = rosterTools({ ...SOURCE, routesPlanSkills: false });
    expect(tools.find((t) => t.name === 'find_route')?.parameters.properties['skills']).toBeUndefined();
  });
});

describe('runTool', () => {
  it('rejects bad arguments from the model without throwing', () => {
    expect(runTool(TOOLS, 'nope', {}).isError).toBe(true);
    expect(runTool(TOOLS, 'get_details', {}).output).toContain('Missing required argument');
    expect(runTool(TOOLS, 'get_details', { name: 3 }).output).toContain('must be a string');
    expect(runTool(TOOLS, 'get_details', { name: 'Pixie', extra: 1 }).output).toContain('Unknown argument');
    expect(runTool(TOOLS, 'get_details', 'text').isError).toBe(true);
    expect(runTool(TOOLS, 'find_route', { target: 'Surt', pool: 'everything' }).output).toContain('one of');
    expect(runTool(TOOLS, 'search_roster', { limit: 1.5 }).isError).toBe(true);
    expect(runTool(TOOLS, 'fuse', { ingredients: [1, 2] }).isError).toBe(true);
  });

  it('reports a throwing tool as an error result', () => {
    const tool = { ...TOOLS[0], name: 'boom', run: () => { throw new Error('kaput'); } };
    expect(runTool([tool], 'boom', {})).toEqual({ isError: true, output: 'kaput' });
  });

  it('caps a huge result', () => {
    const tool = { ...TOOLS[0], name: 'big', run: () => 'x'.repeat(100_000) };
    const run = runTool([tool], 'big', {});
    expect(run.output.length).toBeLessThan(25_000);
    expect(run.output).toContain('narrow the query');
  });
});

describe('route and affinity helpers', () => {
  it('turns any game\'s tree into ordered steps', () => {
    const plan = routePlan(
      {
        kind: 'fusion',
        resultId: 'top',
        children: [
          { kind: 'leaf', personaId: 'x', owned: true },
          { kind: 'fusion', resultId: 'mid', children: [{ kind: 'leaf', demonId: 'y', owned: false }, { kind: 'leaf', personaId: 'z', owned: true }] },
        ],
      },
      (id) => id.toUpperCase(),
    );
    expect(plan.steps).toEqual(['Y + Z → MID', 'X + MID → TOP']);
    expect(plan.start_with).toEqual([
      { name: 'X', owned: true },
      { name: 'Y', owned: false },
      { name: 'Z', owned: true },
    ]);
  });

  it('groups affinities and drops neutral ones', () => {
    expect(affinitySummary({ fire: 'weak', ice: 'neutral', elec: 'weak', dark: 'null' })).toEqual({ weak: ['fire', 'elec'], null: ['dark'] });
  });
});
