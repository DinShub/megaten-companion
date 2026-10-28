import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { forkJoin, of, switchMap } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import type { GameDefinition } from '../../game.model';
import type {
  FusionChart,
  GameDataMeta,
  InheritMatrix,
  Persona,
  PersonaId,
  Shadow,
  ShadowId,
  Skill,
  SkillId,
  SpecialRecipe,
} from '../model';
import type { LoadedP4gData, LoadStatus } from './game-data';

/** Who learns a skill: a persona, innate or at a level. */
export interface SkillLearner {
  readonly id: PersonaId;
  readonly innate: boolean;
  readonly level: number;
}

/**
 * Loads the committed P4G datasets once per session, cache-busted on the
 * `meta.json` upstream SHA, and exposes the lookups every page shares. As for
 * Nocturne, there is no on-demand split: the set is ~70 kB gzipped and the
 * detail pages read across all of it.
 *
 * A network failure surfaces a retryable error via {@link status}/{@link error}
 * rather than throwing — pages show a retry, not a blank screen.
 */
@Injectable({ providedIn: 'root' })
export class P4gDataService {
  private readonly http = inject(HttpClient);

  private readonly _data = signal<LoadedP4gData | null>(null);
  private readonly _status = signal<LoadStatus>('idle');
  private readonly _error = signal<string | null>(null);
  private lastGame: GameDefinition | null = null;

  readonly data = this._data.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly loading = computed(() => this._status() === 'loading');
  readonly ready = computed(() => this._status() === 'ready');

  readonly personasById = computed<ReadonlyMap<PersonaId, Persona>>(
    () => new Map((this._data()?.personas ?? []).map((p) => [p.id, p] as const)),
  );
  readonly skillsById = computed<ReadonlyMap<SkillId, Skill>>(
    () => new Map((this._data()?.skills ?? []).map((s) => [s.id, s] as const)),
  );
  readonly shadowsById = computed<ReadonlyMap<ShadowId, Shadow>>(
    () => new Map((this._data()?.shadows ?? []).map((s) => [s.id, s] as const)),
  );

  /** skill id → every persona that learns it, level-ascending. */
  readonly skillLearners = computed<ReadonlyMap<SkillId, readonly SkillLearner[]>>(() => {
    const out = new Map<SkillId, SkillLearner[]>();
    for (const p of this._data()?.personas ?? []) {
      for (const s of p.learnedSkills) {
        const learner = { id: p.id, innate: s.kind === 'innate', level: s.kind === 'level' ? s.level : p.level };
        const list = out.get(s.skillId);
        if (list) list.push(learner);
        else out.set(s.skillId, [learner]);
      }
    }
    for (const list of out.values()) list.sort((a, b) => a.level - b.level);
    return out;
  });

  /** skill id → shadows that use it. */
  readonly shadowSkillUsers = computed<ReadonlyMap<SkillId, readonly ShadowId[]>>(() => {
    const out = new Map<SkillId, ShadowId[]>();
    for (const s of this._data()?.shadows ?? []) {
      for (const id of s.skillIds) {
        const list = out.get(id);
        if (list) list.push(s.id);
        else out.set(id, [s.id]);
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
            personas: this.http.get<Persona[]>(bust('personas')),
            skills: this.http.get<Skill[]>(bust('skills')),
            shadows: this.http.get<Shadow[]>(bust('shadows')),
            fusionChart: this.http.get<FusionChart>(bust('fusion-chart')),
            specialRecipes: this.http.get<SpecialRecipe[]>(bust('special-recipes')),
            inheritMatrix: this.http.get<InheritMatrix>(bust('inherit-matrix')),
          }).pipe(map((sets): LoadedP4gData => ({ ...sets, meta })));
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
