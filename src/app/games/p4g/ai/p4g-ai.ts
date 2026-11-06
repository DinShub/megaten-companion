import { inject, Injectable } from '@angular/core';

import type { AiTool } from '../../../core/ai/ai.model';
import type { GameAi } from '../../../core/ai/game-ai';
import { affinitySummary, enemySearchTool, rosterTools, routePlan, type RosterSource } from '../../../core/ai/roster-tools';
import { P4gCompendiumStore } from '../compendium/p4g-compendium.store';
import { P4gDataService } from '../data/p4g-data.service';
import type { LoadedP4gData } from '../data/game-data';
import { P4gFusionStore } from '../pages/fusion/p4g-fusion.store';
import { findRoutes } from '../routing/p4g-route-finder';
import { P4gSettingsStore } from '../settings/p4g-settings.store';

/** Persona 4 Golden's side of the chat: its data, engine and route finder as read-only tools. */
@Injectable({ providedIn: 'root' })
export class P4gAi implements GameAi {
  private readonly gameData = inject(P4gDataService);
  private readonly fusion = inject(P4gFusionStore);
  private readonly settings = inject(P4gSettingsStore);
  private readonly compendium = inject(P4gCompendiumStore);

  readonly gameId = 'p4g';
  readonly gameTitle = 'Persona 4 Golden';
  readonly notes =
    'Personas fuse in pairs by arcana chart, in three-persona triangles, and by fixed special recipes. recipes_for lists pairs and specials; if none suit, use fuse to test a triangle. A persona holds at most 8 skills.';
  readonly suggestions = [
    'What should I fuse next with what I have?',
    'What can I make right now that I don\'t own yet?',
    'Which shadows are weak to fire?',
    'How do I get Izanagi-no-Okami?',
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
      const persona = this.fusion.persona(e.personaId);
      const skills = e.skillIds.map((id) => this.fusion.skill(id)?.name ?? id).join(', ');
      return `- ${persona?.name ?? e.personaId} (${persona?.arcana ?? '?'}, Lv ${e.level})${skills ? `: ${skills}` : ''}`;
    });
    return [
      `Protagonist level: ${this.settings.protagonistLevel()}. Level cap enforced: ${this.settings.enforceLevelCap() ? 'yes' : 'no'}.`,
      `Unlock groups: ${groups.join(', ')}.`,
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
          boss: s.boss,
          areas: s.area ? [s.area] : [],
          hp: s.hp,
          affinities: affinitySummary(s.affinities),
          skills: s.skillIds.map((id) => this.fusion.skill(id)?.name ?? id),
          drops: s.drops.map((d) => `${d.item} (${d.chance}%)`),
        })),
      ),
    ];
  }

  private loaded(): LoadedP4gData {
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
        const entry = this.fusion.ownedEntries().get(id);
        return {
          name: p.name,
          arcana: p.arcana,
          base_level: p.level,
          kind: p.kind,
          inherit_type: p.inheritType,
          stats: p.stats,
          affinities: affinitySummary(p.affinities),
          skills: p.learnedSkills.map((s) => ({
            name: skillName(s.skillId),
            learned: s.kind === 'level' ? s.level : 'innate',
          })),
          unlock: p.unlock?.condition ?? null,
          registered: entry ? { level: entry.level, skills: entry.skillIds.map(skillName) } : null,
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
          card_from_persona: s.cardPersonaId ? this.fusion.personaName(s.cardPersonaId) : null,
        };
      },
      recipesFor: (id) => {
        const special = engine().specialFor(id);
        const pairs = engine().recipesFor(id, this.fusion.ctx());
        // A two-persona special is already among the pairs.
        return special && special.ingredientIds.length > 2 ? [special, ...pairs] : pairs;
      },
      fusionsFrom: (id) => engine().fusionsFrom(id, this.fusion.ctx()),
      specialRecipes: () =>
        this.loaded().specialRecipes.filter((r) => r.ingredientIds.length > 2).map((r) => ({ ...r, path: 'special' })),
      fuse: (ids) => engine().fuse(ids, this.fusion.ctx()),
      route: (query) => {
        const result = findRoutes(engine(), this.loaded(), this.fusion.ctx(), {
          targetId: query.targetId,
          skillIds: query.skillIds,
          objective: query.objective,
          maxDepth: query.maxDepth,
          pool: query.pool === 'owned' ? 'compendium' : 'available',
        });
        return {
          routes: result.routes.slice(0, 3).map((r) => ({
            ...routePlan(r.tree, (pid) => this.fusion.personaName(pid)),
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
