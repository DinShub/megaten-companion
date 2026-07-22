import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { forkJoin, of, switchMap } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import type { GameDefinition } from '../../game.model';
import type {
  Accessory,
  AdvancedRecipes,
  ArcanaId,
  ElementChart,
  FusionChart,
  GameDataMeta,
  InheritMatrix,
  Persona,
  Shadow,
  Skill,
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
  readonly skillLearnedBy = computed(() => {
    const data = this._data();
    return data ? buildSkillLearnedBy(data.personas) : new Map();
  });

  readonly dropSources = computed(() => {
    const data = this._data();
    return data ? buildDropSources(data.shadows) : new Map();
  });

  readonly invertedSpecials = computed(() => {
    const data = this._data();
    return data ? buildInvertedSpecials(data.advancedRecipes) : new Map();
  });

  // ---- Loading ----------------------------------------------------------

  /** Fetch and cache the datasets. No-op once loaded or already loading. */
  load(game: GameDefinition): void {
    this.lastGame = game;
    if (this._status() === 'loading' || this._status() === 'ready') return;
    this.run(game);
  }

  /** Re-attempt after a failure (the shell's retry button). */
  retry(): void {
    if (this.lastGame && this._status() !== 'loading') this.run(this.lastGame);
  }

  private run(game: GameDefinition): void {
    const manifest = game.dataManifest;
    this._status.set('loading');
    this._error.set(null);

    // Fetch meta first for the SHA, then every dataset cache-busted by it.
    this.http
      .get<GameDataMeta>(manifest['meta'])
      .pipe(
        switchMap((meta) => {
          const bust = (name: string): string => `${manifest[name]}?v=${meta.upstream.sha}`;
          return forkJoin({
            personas: this.http.get<Persona[]>(bust('personas')),
            skills: this.http.get<Skill[]>(bust('skills')),
            traits: this.http.get<Trait[]>(bust('traits')),
            shadows: this.http.get<Shadow[]>(bust('shadows')),
            accessories: this.http.get<Accessory[]>(bust('accessories')),
            fusionChart: this.http.get<FusionChart>(bust('fusion-chart')),
            advancedRecipes: this.http.get<AdvancedRecipes>(bust('advanced-recipes')),
            elementChart: this.http.get<ElementChart>(bust('element-chart')),
            inheritMatrix: this.http.get<InheritMatrix>(bust('inherit-matrix')),
          }).pipe(map((sets): LoadedGameData => ({ ...sets, meta })));
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
  const url = isHttpErrorLike(err) && err.url ? ` (${err.url})` : '';
  const status = isHttpErrorLike(err) && err.status ? `HTTP ${err.status}` : 'network error';
  return `Couldn't load game data — ${status}${url}. Check your connection and retry.`;
}

function isHttpErrorLike(err: unknown): err is { status?: number; url?: string } {
  return typeof err === 'object' && err !== null;
}
