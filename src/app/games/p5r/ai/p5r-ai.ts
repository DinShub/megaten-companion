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
  type RouteQuery,
} from '../../../core/ai/roster-tools';
import { CompendiumStore } from '../compendium/compendium.store';
import { GameDataService } from '../data/game-data.service';
import type { LoadedGameData } from '../data/game-data';
import { FusionStore } from '../pages/fusion/fusion.store';
import { DEFAULT_LIMITS, findRoutes } from '../routing';
import { SettingsStore } from '../settings/settings.store';

/** Persona 5 Royal's side of the chat: its data, engine and route finder as read-only tools. */
@Injectable({ providedIn: 'root' })
export class P5rAi implements GameAi {
  private readonly gameData = inject(GameDataService);
  private readonly fusion = inject(FusionStore);
  private readonly settings = inject(SettingsStore);
  private readonly compendium = inject(CompendiumStore);

  readonly gameId = 'p5r';
  readonly gameTitle = 'Persona 5 Royal';
  readonly notes =
    'Personas fuse by arcana chart, with same-arcana, treasure-demon and advanced (multi-persona) recipes. Treasure demons are recruited, not fused. The app caps a persona at 8 skills in total but does not model the game\'s lower limit on how many skills one fusion can pass down, so say so when a plan depends on carrying many skills. Skill cards come from itemization at the Gallows, with more options under Fusion Alarm, and from shadow negotiation.';
  readonly suggestions = [
    'What should I fuse next with what I have?',
    'What can I make right now that I don\'t own yet?',
    'Which shadows are weak to fire?',
    'What are the classroom answers for 5/12?',
  ];
  readonly status = this.gameData.status;
  readonly error = this.gameData.error;

  constructor() {
    // Lookups can reach these, and only a chat session pays for fetching them here.
    this.gameData.loadExtras();
    this.gameData.loadClassroom();
  }

  retry(): void {
    this.gameData.retry();
  }

  snapshot(): string {
    const data = this.loaded();
    const skillName = (id: string): string => this.fusion.skill(id)?.name ?? id;
    const groups = Object.entries(this.settings.unlockGroups()).map(([g, on]) => `${g} ${on ? 'on' : 'off'}`);
    const rows = this.compendium.entries().map((e) => {
      const persona = this.fusion.persona(e.personaId);
      const trait = this.fusion.traitName(e.traitId);
      const skills = e.skillIds.map(skillName).join(', ');
      return `- ${persona?.name ?? e.personaId} (${persona?.arcana ?? '?'}, Lv ${e.level})${skills ? `: ${skills}` : ''}${trait ? `; trait ${trait}` : ''}`;
    });
    return [
      `Protagonist level: ${this.settings.protagonistLevel()}. Level cap enforced: ${this.settings.enforceLevelCap() ? 'yes' : 'no'}.`,
      `Unlock groups: ${groups.join(', ')}. Fusion Alarm: ${this.settings.alarm() ? 'on' : 'off'}.`,
      `Compendium (${rows.length} of ${data.personas.length} personas):`,
      ...(rows.length ? rows : ['(empty)']),
    ].join('\n');
  }

  tools(): readonly AiTool[] {
    return [
      ...rosterTools(this.source()),
      enemySearchTool(() =>
        this.loaded().shadows.map((s) => ({
          name: s.name,
          group: s.arcana,
          level: s.level,
          boss: s.kind === 'subboss',
          areas: s.areas,
          hp: s.hp,
          affinities: affinitySummary(s.affinities),
          skills: s.skillIds.map((id) => this.fusion.skill(id)?.name ?? id),
          drops: [s.drops.material, s.drops.armor, ...s.drops.items].filter((d): d is string => !!d),
        })),
      ),
      {
        name: 'search_classroom',
        description: 'Look up the answers to classroom and exam questions. Returns the in-game date, question and correct answers.',
        parameters: params({
          query: text('Words from the question.'),
          date: text('In-game month/day, for example "5/12".'),
          limit: integer('Most rows to return. Default 25.'),
        }),
        run: (args) => {
          const words = String(args['query'] ?? '').toLowerCase().split(/\s+/).filter(Boolean);
          const rows = this.loaded().classroom.filter((c) => {
            if (args['date'] && c.date !== args['date']) return false;
            const question = c.question.toLowerCase();
            return words.every((word) => question.includes(word));
          });
          return page(rows, args, (c) => ({ date: c.date, exam: c.exam?.name ?? null, question: c.question, answers: c.answers }));
        },
      },
    ];
  }

  private loaded(): LoadedGameData {
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
    const name = (id: string): string => this.fusion.personaName(id);
    const skillName = (id: string): string => this.fusion.skill(id)?.name ?? id;

    return {
      noun: 'persona',
      routesPlanSkills: true,
      playerLevel: () => this.settings.protagonistLevel(),
      levelCapped: () => this.settings.enforceLevelCap(),
      roster: () => {
        const owned = this.compendium.entryMap();
        return this.loaded().personas.map((p) => ({
          id: p.id,
          name: p.name,
          group: p.arcana,
          level: p.level,
          owned: owned.has(p.id),
          skillIds: p.learnedSkills.map((s) => s.skillId),
        }));
      },
      skills: () => this.loaded().skills,
      detail: (id) => {
        const p = this.fusion.persona(id);
        if (!p) throw new Error(`Unknown persona "${id}".`);
        const entry = this.fusion.entryFor(id);
        return {
          name: p.name,
          arcana: p.arcana,
          base_level: p.level,
          kind: p.kind,
          inherit_type: p.inheritType,
          trait: this.fusion.traitName(p.traitId),
          stats: p.stats,
          affinities: affinitySummary(p.affinities),
          skills: p.learnedSkills.map((s) => ({
            name: skillName(s.skillId),
            learned: s.kind === 'level' ? s.level : s.kind === 'tag' ? s.tag : 'innate',
          })),
          unlock: p.unlock?.condition ?? null,
          recruit_location: p.prereq,
          itemizes_to: p.itemization.normalItem,
          itemizes_to_with_alarm: p.itemization.alarmItem,
          registered: entry
            ? { level: entry.level, skills: entry.skillIds.map(skillName), trait: this.fusion.traitName(entry.traitId) }
            : null,
        };
      },
      skillDetail: (id) => {
        const s = this.fusion.skill(id);
        if (!s) throw new Error(`Unknown skill "${id}".`);
        return {
          name: s.name,
          element: s.element,
          cost: s.cost,
          target: s.target,
          description: s.description,
          inheritable: !s.unique,
          card_found_at: s.cardLocations,
          card_sources: s.cardSources.map((c) => ({
            how: c.kind,
            from: c.kind === 'negotiation' ? (this.fusion.shadowsById().get(c.from)?.name ?? c.from) : name(c.from),
          })),
        };
      },
      recipesFor: (id) => engine().recipesFor(id, this.fusion.ctx()),
      fusionsFrom: (id) => engine().fusionsFrom(id, this.fusion.ctx()),
      fuse: (ids) => engine().fuse(ids, this.fusion.ctx()),
      route: (query: RouteQuery) => {
        const result = findRoutes(
          engine(),
          this.loaded(),
          { targetId: query.targetId, skillIds: query.skillIds, objective: query.objective, maxDepth: query.maxDepth },
          { ...this.fusion.ctx(), pool: query.pool === 'owned' ? 'compendium' : 'obtainable' },
          { ...DEFAULT_LIMITS, maxRoutes: 3 },
        );
        return {
          routes: result.routes.map((r) => ({
            ...routePlan(r.tree, name),
            fusions: r.steps,
            summon_cost: r.cost,
            unowned_to_acquire: r.unowned,
            has_every_skill: r.complete,
            skills: r.assignments.map((a) => ({ skill: skillName(a.skillId), delivered: a.satisfied, via: a.via })),
            problems: r.diagnostics.map((d) => d.message),
          })),
          problems: result.diagnostics.map((d) => d.message),
          search_was_cut_short: result.incomplete,
        };
      },
    };
  }
}
