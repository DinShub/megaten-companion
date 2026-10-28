import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { forkJoin, of, switchMap } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import type { GameDefinition } from '../../game.model';
import type {
  Demon,
  DemonId,
  ElementChart,
  FusionChart,
  GameDataMeta,
  Magatama,
  Skill,
  SkillId,
  SpecialRecipes,
} from '../model';
import type { LoadedSmt3Data, LoadStatus } from './game-data';

/** Who learns a skill: a demon (innate or at a level) or a magatama (at a Demi-fiend level). */
export type SkillLearner =
  | { readonly source: 'demon'; readonly id: DemonId; readonly innate: boolean; readonly level: number }
  | { readonly source: 'magatama'; readonly id: string; readonly innate: false; readonly level: number | null };

/**
 * Loads the committed Nocturne datasets once per session, cache-busted on the
 * `meta.json` upstream SHA, and exposes the lookups every page shares. Unlike
 * P5R there is no on-demand split: the whole set is ~95 kB gzipped and every
 * page (demon detail especially) reads across all of it.
 *
 * A network failure surfaces a retryable error via {@link status}/{@link error}
 * rather than throwing — pages show a retry, not a blank screen.
 */
@Injectable({ providedIn: 'root' })
export class Smt3DataService {
  private readonly http = inject(HttpClient);

  private readonly _data = signal<LoadedSmt3Data | null>(null);
  private readonly _status = signal<LoadStatus>('idle');
  private readonly _error = signal<string | null>(null);
  private lastGame: GameDefinition | null = null;

  readonly data = this._data.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly loading = computed(() => this._status() === 'loading');
  readonly ready = computed(() => this._status() === 'ready');

  readonly demonsById = computed<ReadonlyMap<DemonId, Demon>>(
    () => new Map((this._data()?.demons ?? []).map((d) => [d.id, d] as const)),
  );
  readonly skillsById = computed<ReadonlyMap<SkillId, Skill>>(
    () => new Map((this._data()?.skills ?? []).map((s) => [s.id, s] as const)),
  );
  readonly magatamaById = computed<ReadonlyMap<string, Magatama>>(
    () => new Map((this._data()?.magatama ?? []).map((m) => [m.id, m] as const)),
  );

  /** skill id → every demon and magatama that teaches it, level-ascending. */
  readonly skillLearners = computed<ReadonlyMap<SkillId, readonly SkillLearner[]>>(() => {
    const out = new Map<SkillId, SkillLearner[]>();
    const add = (skillId: SkillId, learner: SkillLearner): void => {
      const list = out.get(skillId);
      if (list) list.push(learner);
      else out.set(skillId, [learner]);
    };
    const data = this._data();
    for (const d of data?.demons ?? []) {
      for (const s of d.learnedSkills) {
        add(s.skillId, { source: 'demon', id: d.id, innate: s.kind === 'innate', level: s.kind === 'level' ? s.level : d.level });
      }
    }
    for (const m of data?.magatama ?? []) {
      for (const s of m.learnedSkills) add(s.skillId, { source: 'magatama', id: m.id, innate: false, level: s.level });
    }
    for (const list of out.values()) list.sort((a, b) => (a.level ?? 1e9) - (b.level ?? 1e9));
    return out;
  });

  /** skill id → demons that use it as enemies in the field. */
  readonly enemySkillUsers = computed<ReadonlyMap<SkillId, readonly DemonId[]>>(() => {
    const out = new Map<SkillId, DemonId[]>();
    for (const d of this._data()?.demons ?? []) {
      for (const id of d.enemy?.skillIds ?? []) {
        const list = out.get(id);
        if (list) list.push(d.id);
        else out.set(id, [d.id]);
      }
    }
    return out;
  });

  /** Fetch and cache every dataset. No-op once loaded or already loading. */
  load(game: GameDefinition): void {
    this.lastGame = game;
    if (this._status() === 'loading' || this._status() === 'ready') return;
    this.run(game);
  }

  retry(): void {
    if (this.lastGame && this._status() !== 'loading') this.run(this.lastGame);
  }

  private run(game: GameDefinition): void {
    const manifest = game.dataManifest;
    this._status.set('loading');
    this._error.set(null);

    this.http
      .get<GameDataMeta>(manifest['meta'])
      .pipe(
        switchMap((meta) => {
          const bust = (name: string): string => `${manifest[name]}?v=${meta.upstream.sha}`;
          return forkJoin({
            demons: this.http.get<Demon[]>(bust('demons')),
            skills: this.http.get<Skill[]>(bust('skills')),
            magatama: this.http.get<Magatama[]>(bust('magatama')),
            fusionChart: this.http.get<FusionChart>(bust('fusion-chart')),
            elementChart: this.http.get<ElementChart>(bust('element-chart')),
            specialRecipes: this.http.get<SpecialRecipes>(bust('special-recipes')),
          }).pipe(map((sets): LoadedSmt3Data => ({ ...sets, meta })));
        }),
        catchError((err: unknown) => {
          this._status.set('error');
          this._error.set(describeHttpError(err));
          return of(null);
        }),
      )
      .subscribe((data) => {
        if (data === null) return; // error already recorded
        this._data.set(data);
        this._status.set('ready');
      });
  }
}

function describeHttpError(err: unknown): string {
  const e = typeof err === 'object' && err !== null ? (err as { status?: number; url?: string }) : {};
  const url = e.url ? ` (${e.url})` : '';
  const status = e.status ? `HTTP ${e.status}` : 'network error';
  return `Couldn't load game data — ${status}${url}. Check your connection and retry.`;
}
