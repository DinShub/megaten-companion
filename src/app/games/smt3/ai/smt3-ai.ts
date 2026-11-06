import { inject, Injectable } from '@angular/core';

import type { AiTool } from '../../../core/ai/ai.model';
import type { GameAi } from '../../../core/ai/game-ai';
import {
  affinitySummary,
  enemySearchTool,
  integer,
  page,
  params,
  rosterTools,
  routePlan,
  text,
  type RosterSource,
} from '../../../core/ai/roster-tools';
import { Smt3CompendiumStore } from '../compendium/smt3-compendium.store';
import { Smt3DataService } from '../data/smt3-data.service';
import type { LoadedSmt3Data } from '../data/game-data';
import { Smt3FusionStore } from '../pages/fusion/smt3-fusion.store';
import { findRoutes } from '../routing/smt3-route-finder';
import { Smt3SettingsStore } from '../settings/smt3-settings.store';

/** Nocturne's side of the chat: its data, engine and route finder as read-only tools. */
@Injectable({ providedIn: 'root' })
export class Smt3Ai implements GameAi {
  private readonly gameData = inject(Smt3DataService);
  private readonly fusion = inject(Smt3FusionStore);
  private readonly settings = inject(Smt3SettingsStore);
  private readonly compendium = inject(Smt3CompendiumStore);

  readonly gameId = 'smt3';
  readonly gameTitle = 'Shin Megami Tensei III: Nocturne';
  readonly notes =
    'The protagonist is the Demi-fiend, who equips Magatama. Demons fuse in pairs by race chart, with same-race, element, Mitama and special recipes, and some evolve at a level instead. Which skills a demon can inherit depends on its inherit categories. A demon holds at most 8 skills.';
  readonly suggestions = [
    'What should I fuse next with what I have?',
    'What can I make right now that I don\'t own yet?',
    'Which Magatama resists fire?',
    'Which enemies are weak to ice?',
  ];
  readonly status = this.gameData.status;
  readonly error = this.gameData.error;

  retry(): void {
    this.gameData.retry();
  }

  snapshot(): string {
    const data = this.loaded();
    const groups = Object.entries(this.settings.unlockGroups()).map(([g, on]) => `${g} ${on ? 'on' : 'off'}`);
    const rows = this.compendium.entries().map((e) => {
      const demon = this.fusion.demon(e.demonId);
      const skills = e.skillIds.map((id) => this.fusion.skill(id)?.name ?? id).join(', ');
      return `- ${demon?.name ?? e.demonId} (${demon?.race ?? '?'}, Lv ${e.level})${skills ? `: ${skills}` : ''}`;
    });
    return [
      `Demi-fiend level: ${this.settings.protagonistLevel()}. Level cap enforced: ${this.settings.enforceLevelCap() ? 'yes' : 'no'}.`,
      `Unlock groups: ${groups.join(', ')}.`,
      `Compendium (${rows.length} of ${data.demons.length} demons):`,
      ...(rows.length ? rows : ['(empty)']),
    ].join('\n');
  }

  tools(): readonly AiTool[] {
    const skillName = (id: string): string => this.fusion.skill(id)?.name ?? id;
    return [
      ...rosterTools(this.source()),
      enemySearchTool(
        () =>
          this.loaded().demons.flatMap((d) =>
            d.enemy
              ? [
                  {
                    name: d.name,
                    group: d.race,
                    level: d.level,
                    boss: d.kind === 'fiend',
                    areas: d.enemy.locations,
                    hp: d.enemy.hp,
                    affinities: affinitySummary(d.affinities),
                    skills: d.enemy.skillIds.map(skillName),
                    drops: d.enemy.drops,
                  },
                ]
              : [],
          ),
        'enemy demon',
      ),
      {
        name: 'search_magatama',
        description: 'Find Magatama by name or by the element they protect against. Returns stats, affinities, skills and where to get them.',
        parameters: params({
          query: text('Part of the name.'),
          resists: text('An element it resists, nulls, repels or drains, for example "fire".'),
          limit: integer('Most rows to return. Default 25.'),
        }),
        run: (args) => {
          const query = String(args['query'] ?? '').toLowerCase();
          const resists = String(args['resists'] ?? '').toLowerCase();
          const rows = this.loaded().magatama.filter((m) => {
            if (!m.name.toLowerCase().includes(query)) return false;
            if (!resists) return true;
            const affinity = m.affinities[resists as keyof typeof m.affinities];
            return !!affinity && affinity !== 'neutral' && affinity !== 'weak';
          });
          return page(rows, args, (m) => ({
            name: m.name,
            level: m.level,
            stats: m.stats,
            affinities: affinitySummary(m.affinities),
            skills: m.learnedSkills.map((s) => ({ name: skillName(s.skillId), level: s.level })),
            obtain: m.obtain,
          }));
        },
      },
    ];
  }

  private loaded(): LoadedSmt3Data {
    const data = this.gameData.data();
    if (!data) throw new Error('The game data has not loaded yet.');
    return data;
  }

  private source(): RosterSource {
    const engine = () => {
      const built = this.fusion.engine();
      if (!built) throw new Error('The game data has not loaded yet.');
      return built;
    };
    const skillName = (id: string): string => this.fusion.skill(id)?.name ?? id;

    return {
      noun: 'demon',
      routesPlanSkills: true,
      playerLevel: () => this.settings.protagonistLevel(),
      levelCapped: () => this.settings.enforceLevelCap(),
      roster: () => {
        const owned = this.compendium.entryMap();
        return this.loaded().demons.map((d) => ({
          id: d.id,
          name: d.name,
          group: d.race,
          level: d.level,
          owned: owned.has(d.id),
          skillIds: d.learnedSkills.map((s) => s.skillId),
        }));
      },
      skills: () => this.loaded().skills,
      detail: (id) => {
        const d = this.fusion.demon(id);
        if (!d) throw new Error(`Unknown demon "${id}".`);
        const entry = this.fusion.ownedEntries().get(id);
        return {
          name: d.name,
          race: d.race,
          base_level: d.level,
          kind: d.kind,
          inherits: d.inherits,
          stats: d.stats,
          affinities: affinitySummary(d.affinities),
          ailments: d.ailments,
          skills: d.learnedSkills.map((s) => ({
            name: skillName(s.skillId),
            learned: s.kind === 'level' ? s.level : 'innate',
          })),
          unlock: d.unlock?.condition ?? null,
          condition: d.prereq,
          evolves_to: d.evolvesTo ? { demon: this.fusion.demonName(d.evolvesTo.demonId), at_level: d.evolvesTo.level } : null,
          evolves_from: d.evolvesFrom ? { demon: this.fusion.demonName(d.evolvesFrom.demonId), at_level: d.evolvesFrom.level } : null,
          recruitment: d.personality ? { personality: d.personality, age: d.age, gender: d.gender } : null,
          as_enemy: d.enemy
            ? { hp: d.enemy.hp, mp: d.enemy.mp, exp: d.enemy.exp, macca: d.enemy.macca, drops: d.enemy.drops, locations: d.enemy.locations }
            : null,
          registered: entry ? { level: entry.level, skills: entry.skillIds.map(skillName) } : null,
        };
      },
      skillDetail: (id) => {
        const s = this.fusion.skill(id);
        if (!s) throw new Error(`Unknown skill "${id}".`);
        return {
          name: s.name,
          element: s.element,
          inherit_category: s.inheritCategory,
          cost: s.cost,
          target: s.target,
          description: s.description,
          power: s.power,
          hits: s.hits,
          inheritable: !s.unique,
        };
      },
      recipesFor: (id) => this.fusion.recipesFor(id),
      fusionsFrom: (id) => this.fusion.fusionsFrom(id),
      fuse: (ids) => engine().fuse(ids, this.fusion.ctx()),
      route: (query) => {
        const result = findRoutes(engine(), this.loaded(), this.fusion.ctx(), {
          targetId: query.targetId,
          skillIds: query.skillIds,
          objective: query.objective,
          maxDepth: query.maxDepth,
          pool: query.pool === 'owned' ? 'compendium' : 'recruitable',
        });
        return {
          routes: result.routes.slice(0, 3).map((r) => ({
            ...routePlan(r.tree, (did) => this.fusion.demonName(did)),
            fusions: r.steps,
            summon_cost: r.cost,
            unowned_to_acquire: r.unowned,
            has_every_skill: r.complete,
            skills: r.assignments.map((a) => ({ skill: skillName(a.skillId), delivered: a.satisfied, why_not: a.reason ?? null })),
          })),
          problems: result.problems,
          search_was_cut_short: result.incomplete,
        };
      },
    };
  }
}
