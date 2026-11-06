import { inject, Injectable } from '@angular/core';

import type { AiTool } from '../../../core/ai/ai.model';
import type { GameAi } from '../../../core/ai/game-ai';
import { affinitySummary, rosterTools, routePlan, type RecipeLike, type RosterSource } from '../../../core/ai/roster-tools';
import { Smt1CompendiumStore } from '../compendium/smt1-compendium.store';
import { Smt1DataService } from '../data/smt1-data.service';
import type { LoadedSmt1Data } from '../data/game-data';
import { displayLevel, type Affinity, type Demon } from '../model';
import { Smt1FusionStore } from '../pages/fusion/smt1-fusion.store';
import { findRoutes } from '../routing/smt1-route-finder';
import { Smt1SettingsStore } from '../settings/smt1-settings.store';

/** SMT1's side of the chat: its data, engine and route finder as read-only tools. */
@Injectable({ providedIn: 'root' })
export class Smt1Ai implements GameAi {
  private readonly gameData = inject(Smt1DataService);
  private readonly fusion = inject(Smt1FusionStore);
  private readonly settings = inject(Smt1SettingsStore);
  private readonly compendium = inject(Smt1CompendiumStore);

  /** ingredient id → pair recipes using it, built once from the engine's pair table. */
  private pairsByDemon: { source: unknown; map: ReadonlyMap<string, readonly RecipeLike[]> } | null = null;

  readonly gameId = 'smt1';
  readonly gameTitle = 'Shin Megami Tensei (PS1 version)';
  readonly notes =
    'Demons fuse in pairs by race and species chart, in trios by a separate chart, with elements, dark-race rules and special recipes. Demons have a fixed set of up to three skills: nothing is learned or inherited, so never plan around passing a skill down. The compendium only records which demons the hero owns, plus the player\'s notes. The data is for the PS1 version; other versions may differ.';
  readonly suggestions = [
    'What should I fuse next with what I have?',
    'What can I make right now that I don\'t own yet?',
    'What\'s the strongest demon I can make right now?',
    'Which demons learn a healing skill?',
  ];
  readonly status = this.gameData.status;
  readonly error = this.gameData.error;

  retry(): void {
    this.gameData.retry();
  }

  snapshot(): string {
    const data = this.loaded();
    const rows = this.compendium.entries().map((e) => {
      const demon = this.fusion.demon(e.demonId);
      const level = demon ? displayLevel(demon) : '?';
      // A note is the player's own text, quoted so it reads as data.
      return `- ${demon?.name ?? e.demonId} (${demon?.race ?? '?'}, Lv ${level})${e.note ? `; note: ${JSON.stringify(e.note)}` : ''}`;
    });
    return [
      `Hero level: ${this.settings.heroLevel()}. Level cap enforced: ${this.settings.enforceLevelCap() ? 'yes' : 'no'}.`,
      `Compendium (${rows.length} of ${data.demons.length} demons):`,
      ...(rows.length ? rows : ['(empty)']),
    ].join('\n');
  }

  tools(): readonly AiTool[] {
    return rosterTools(this.source());
  }

  private loaded(): LoadedSmt1Data {
    const data = this.gameData.data();
    if (!data) throw new Error('The game data has not loaded yet.');
    return data;
  }

  private pairs(): ReadonlyMap<string, readonly RecipeLike[]> {
    const engine = this.engine();
    if (this.pairsByDemon?.source === engine) return this.pairsByDemon.map;
    const map = new Map<string, RecipeLike[]>();
    for (const [key, outcome] of engine.pairs()) {
      if (!outcome.ok) continue;
      const ingredientIds = key.split('|');
      const recipe: RecipeLike = { resultId: outcome.resultId, ingredientIds, path: outcome.path };
      for (const id of ingredientIds) {
        const list = map.get(id);
        if (list) list.push(recipe);
        else map.set(id, [recipe]);
      }
    }
    this.pairsByDemon = { source: engine, map };
    return map;
  }

  private engine() {
    const built = this.fusion.engine();
    if (!built) throw new Error('The game data has not loaded yet.');
    return built;
  }

  private source(): RosterSource {
    const skillName = (id: string): string => this.gameData.skillsById().get(id)?.name ?? id;
    const affinities = (d: Demon): Record<string, string[]> =>
      affinitySummary(Object.fromEntries(Object.entries(d.affinities).map(([k, v]: [string, Affinity]) => [k, v.type])));

    return {
      noun: 'demon',
      routesPlanSkills: false,
      playerLevel: () => this.settings.heroLevel(),
      levelCapped: () => this.settings.enforceLevelCap(),
      roster: () => {
        const owned = this.fusion.owned();
        return this.loaded().demons.map((d) => ({
          id: d.id,
          name: d.name,
          group: d.race,
          level: displayLevel(d),
          owned: owned.has(d.id),
          skillIds: d.skillIds,
        }));
      },
      skills: () => this.loaded().skills,
      detail: (id) => {
        const d = this.fusion.demon(id);
        if (!d) throw new Error(`Unknown demon "${id}".`);
        const entry = this.compendium.entryFor(id);
        return {
          name: d.name,
          race: d.race,
          level: displayLevel(d),
          kind: d.kind,
          alignment: d.alignment,
          stats: d.stats,
          combat: d.combat,
          affinities: affinities(d),
          skills: d.skillIds.map(skillName),
          drop: d.drop,
          condition: d.prereq,
          owned: !!entry,
          note: entry?.note || null,
        };
      },
      skillDetail: (id) => {
        const s = this.gameData.skillsById().get(id);
        if (!s) throw new Error(`Unknown skill "${id}".`);
        return { name: s.name, element: s.element, mp: s.mp, power: s.power, target: s.target, effect: s.effect, enemy_only: s.enemyOnly };
      },
      recipesFor: (id) => [...this.fusion.pairRecipesFor(id), ...this.fusion.tripleRecipesFor(id)],
      fusionsFrom: (id) => this.pairs().get(id) ?? [],
      fuse: (ids) => this.engine().fuseAny(ids, this.fusion.ctx()),
      route: (query) => {
        const result = findRoutes(
          this.engine(),
          this.loaded().demons,
          { ...this.fusion.ctx(), owned: this.fusion.owned() },
          { targetId: query.targetId, objective: query.objective, maxDepth: query.maxDepth, pool: query.pool === 'owned' ? 'compendium' : 'anything' },
        );
        return {
          routes: result.routes.slice(0, 3).map((r) => ({
            ...routePlan(r.tree, (did) => this.fusion.demonName(did)),
            fusions: r.steps,
            summon_cost: r.cost,
            unowned_to_acquire: r.unowned,
          })),
          problems: result.problems,
        };
      },
    };
  }
}
