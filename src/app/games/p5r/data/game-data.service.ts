import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { forkJoin, of, switchMap } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import type { GameDefinition } from '../../game.model';
import type {
  Accessory,
  AdvancedRecipes,
  ArcanaId,
  ClassroomEntry,
  ElementChart,
  FusionChart,
  GameDataMeta,
  InheritMatrix,
  Persona,
  PersonaId,
  Shadow,
  ShadowId,
  Skill,
  SkillId,
  Trait,
} from '../model';
import { SettingsStore } from '../settings/settings.store';
import type { LoadedGameData, LoadStatus } from './game-data';
import {
  buildDropSources,
  buildIngredientsByArcana,
  buildInvertedSpecials,
  buildResultsByArcana,
  buildSkillLearnedBy,
  type SkillLearner,
} from './indexes';

const EMPTY_ARCANA_MAP: ReadonlyMap<ArcanaId, readonly Persona[]> = new Map();

/**
 * Loads the committed P5R datasets and builds the §5.2 indexes (tasks 12–13).
 *
 * - Datasets are fetched once per session and cached in memory; a second
 *   `load()` after success is a no-op.
 * - Each dataset URL is cache-busted by the `meta.json` upstream SHA (§8.5).
 * - A network failure surfaces a retryable error via {@link status} /
 *   {@link error} rather than throwing — the shell shows a retry, not a blank
 *   page.
 * - The arcana indexes read the unlock toggles, so flipping a toggle rebuilds
 *   `resultsByArcana` without a reload.
 */
@Injectable({ providedIn: 'root' })
export class GameDataService {
  private readonly http = inject(HttpClient);
  private readonly settings = inject(SettingsStore);

  private readonly _data = signal<LoadedGameData | null>(null);
  private readonly _status = signal<LoadStatus>('idle');
  private readonly _error = signal<string | null>(null);
  private lastGame: GameDefinition | null = null;

  readonly data = this._data.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly loading = computed(() => this._status() === 'loading');
  readonly ready = computed(() => this._status() === 'ready');

  // ---- On-demand extras (task 58) ---------------------------------------
  // Shadows (51 KB) + accessories are the only datasets a calculator-only
  // session never needs, so they load separately, on request, rather than in
  // the primary bundle. Until then `data().shadows`/`.accessories` stay `[]`,
  // which every consumer already tolerates (`?? []` / an empty `.find`).
  private readonly _extrasStatus = signal<LoadStatus>('idle');
  private readonly _extrasError = signal<string | null>(null);
  private extrasRequested = false;

  readonly extrasLoading = computed(() => this._extrasStatus() === 'loading');
  readonly extrasReady = computed(() => this._extrasStatus() === 'ready');

  /** Combined primary+extras load view for the shadow-backed pages. */
  readonly shadowsReady = computed(() => this.ready() && this.extrasReady());
  readonly shadowsLoading = computed(
    () => this.loading() || this.extrasLoading() || (this.ready() && this._extrasStatus() === 'idle'),
  );
  readonly shadowsError = computed(() => this._error() ?? this._extrasError());

  // ---- On-demand classroom (task 64) ------------------------------------
  // The classroom answers (§4.5) are needed only by the classroom page, so like
  // shadows they load separately rather than in the primary bundle — and unlike
  // the extras, without dragging the 51 KB shadow dataset along with them.
  private readonly _classroomStatus = signal<LoadStatus>('idle');
  private readonly _classroomError = signal<string | null>(null);
  private classroomRequested = false;

  /** Combined primary+classroom load view for the classroom page. */
  readonly classroomReady = computed(() => this.ready() && this._classroomStatus() === 'ready');
  readonly classroomLoading = computed(
    () => this.loading() || this._classroomStatus() === 'loading' || (this.ready() && this._classroomStatus() === 'idle'),
  );
  readonly classroomError = computed(() => this._error() ?? this._classroomError());

  // ---- Derived indexes (§5.2) -------------------------------------------

  /** Rebuilds when the data loads *or* an unlock toggle flips (task 13). */
  readonly resultsByArcana = computed<ReadonlyMap<ArcanaId, readonly Persona[]>>(() => {
    const data = this._data();
    return data ? buildResultsByArcana(data.personas, this.settings.unlockGroups()) : EMPTY_ARCANA_MAP;
  });

  readonly ingredientsByArcana = computed<ReadonlyMap<ArcanaId, readonly Persona[]>>(() => {
    const data = this._data();
    return data
      ? buildIngredientsByArcana(data.personas, this.settings.unlockGroups())
      : EMPTY_ARCANA_MAP;
  });

  /** Toggle-independent: memoised, so it rebuilds only once per data load. */
  readonly skillLearnedBy = computed<ReadonlyMap<SkillId, readonly SkillLearner[]>>(() => {
    const data = this._data();
    return data ? buildSkillLearnedBy(data.personas) : new Map<SkillId, SkillLearner[]>();
  });

  readonly dropSources = computed<ReadonlyMap<string, readonly ShadowId[]>>(() => {
    const data = this._data();
    return data ? buildDropSources(data.shadows) : new Map<string, ShadowId[]>();
  });

  readonly invertedSpecials = computed<ReadonlyMap<PersonaId, readonly PersonaId[]>>(() => {
    const data = this._data();
    return data ? buildInvertedSpecials(data.advancedRecipes) : new Map<PersonaId, PersonaId[]>();
  });

  // ---- Loading ----------------------------------------------------------

  /**
   * Fetch and cache the primary datasets. No-op once loaded or already loading.
   * Shadows and accessories are **not** fetched here — they load on demand via
   * {@link loadExtras}, so a session that only uses the calculator never pays for
   * the 51 KB shadow dataset (§8.5, task 58).
   */
  load(game: GameDefinition): void {
    this.lastGame = game;
    if (this._status() === 'loading' || this._status() === 'ready') return;
    this.run(game);
  }

  /** Re-attempt the primary load after a failure (the shell's retry button). */
  retry(): void {
    if (this.lastGame && this._status() !== 'loading') this.run(this.lastGame);
  }

  /**
   * Load the on-demand extras — shadows + accessories — and merge them into the
   * cached bundle. Called by the surfaces that actually show shadow data (the
   * shadow / drops pages, persona & skill detail, itemization, global search),
   * so the calculator path never triggers the fetch. Idempotent, and safe to
   * call before the primary load finishes — it's kicked once that completes.
   */
  loadExtras(): void {
    this.extrasRequested = true;
    if (this._status() === 'ready') this.runExtras();
  }

  /** Re-attempt the extras load after a failure. */
  retryExtras(): void {
    if (this._extrasStatus() !== 'loading') this.runExtras();
  }

  /** Retry whichever half (primary or extras) failed, for shadow-backed pages. */
  retryShadows(): void {
    if (this._status() !== 'ready') this.retry();
    else this.retryExtras();
  }

  /**
   * Load the classroom answers on demand and merge them into the cached bundle.
   * Called only by the classroom page (§4.5), so no other session pays for it.
   * Idempotent, and safe to call before the primary load finishes — it is kicked
   * once that completes.
   */
  loadClassroom(): void {
    this.classroomRequested = true;
    if (this._status() === 'ready') this.runClassroom();
  }

  /** Retry whichever half (primary or classroom) failed, for the classroom page. */
  retryClassroom(): void {
    if (this._status() !== 'ready') this.retry();
    else if (this._classroomStatus() !== 'loading') this.runClassroom();
  }

  private run(game: GameDefinition): void {
    const manifest = game.dataManifest;
    this._status.set('loading');
    this._error.set(null);

    // Fetch meta first for the SHA, then every primary dataset cache-busted by it.
    this.http
      .get<GameDataMeta>(manifest['meta'])
      .pipe(
        switchMap((meta) => {
          const bust = (name: string): string => `${manifest[name]}?v=${meta.upstream.sha}`;
          return forkJoin({
            personas: this.http.get<Persona[]>(bust('personas')),
            skills: this.http.get<Skill[]>(bust('skills')),
            traits: this.http.get<Trait[]>(bust('traits')),
            fusionChart: this.http.get<FusionChart>(bust('fusion-chart')),
            advancedRecipes: this.http.get<AdvancedRecipes>(bust('advanced-recipes')),
            elementChart: this.http.get<ElementChart>(bust('element-chart')),
            inheritMatrix: this.http.get<InheritMatrix>(bust('inherit-matrix')),
            // Extras load lazily; start empty (consumers tolerate `[]`).
          }).pipe(map((sets): LoadedGameData => ({ ...sets, shadows: [], accessories: [], classroom: [], meta })));
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
        if (this.extrasRequested) this.runExtras();
        if (this.classroomRequested) this.runClassroom();
      });
  }

  private runExtras(): void {
    const data = this._data();
    const game = this.lastGame;
    if (!data || !game) return; // primary not ready yet — run() kicks us when it is
    if (this._extrasStatus() === 'loading' || this._extrasStatus() === 'ready') return;

    const manifest = game.dataManifest;
    const bust = (name: string): string => `${manifest[name]}?v=${data.meta.upstream.sha}`;
    this._extrasStatus.set('loading');
    this._extrasError.set(null);

    forkJoin({
      shadows: this.http.get<Shadow[]>(bust('shadows')),
      accessories: this.http.get<Accessory[]>(bust('accessories')),
    })
      .pipe(
        catchError((err: unknown) => {
          this._extrasStatus.set('error');
          this._extrasError.set(describeHttpError(err));
          return of(null);
        }),
      )
      .subscribe((extras) => {
        if (extras === null) return; // error already recorded
        const current = this._data();
        if (!current) return;
        this._data.set({ ...current, shadows: extras.shadows, accessories: extras.accessories });
        this._extrasStatus.set('ready');
      });
  }

  private runClassroom(): void {
    const data = this._data();
    const game = this.lastGame;
    if (!data || !game) return; // primary not ready yet — run() kicks us when it is
    if (this._classroomStatus() === 'loading' || this._classroomStatus() === 'ready') return;

    const manifest = game.dataManifest;
    const url = `${manifest['classroom']}?v=${data.meta.upstream.sha}`;
    this._classroomStatus.set('loading');
    this._classroomError.set(null);

    this.http
      .get<ClassroomEntry[]>(url)
      .pipe(
        catchError((err: unknown) => {
          this._classroomStatus.set('error');
          this._classroomError.set(describeHttpError(err));
          return of(null);
        }),
      )
      .subscribe((classroom) => {
        if (classroom === null) return; // error already recorded
        const current = this._data();
        if (!current) return;
        this._data.set({ ...current, classroom });
        this._classroomStatus.set('ready');
      });
  }
}

function describeHttpError(err: unknown): string {
  const url = isHttpErrorLike(err) && err.url ? ` (${err.url})` : '';
  const status = isHttpErrorLike(err) && err.status ? `HTTP ${err.status}` : 'network error';
  return `Couldn't load game data — ${status}${url}. Check your connection and retry.`;
}

function isHttpErrorLike(err: unknown): err is { status?: number; url?: string } {
  return typeof err === 'object' && err !== null;
}
