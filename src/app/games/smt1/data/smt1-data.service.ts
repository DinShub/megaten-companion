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
  RaceId,
  RaceInfo,
  Races,
  Skill,
  SkillId,
  SpecialRecipes,
  TripleChart,
} from '../model';
import type { LoadedSmt1Data, LoadStatus } from './game-data';

/**
 * Loads the committed SMT1 datasets once per session, cache-busted on the
 * `meta.json` upstream SHA, and exposes the lookups every page shares. Like
 * Nocturne, the whole set loads at once (~40 kB gzipped).
 *
 * A network failure surfaces a retryable error via {@link status}/{@link error}
 * rather than throwing — pages show a retry, not a blank screen.
 */
@Injectable({ providedIn: 'root' })
export class Smt1DataService {
  private readonly http = inject(HttpClient);

  private readonly _data = signal<LoadedSmt1Data | null>(null);
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
  readonly racesById = computed<ReadonlyMap<RaceId, RaceInfo>>(
    () => new Map((this._data()?.races.races ?? []).map((r) => [r.id, r] as const)),
  );

  /** skill id → the demons that know it, level-ascending. */
  readonly skillUsers = computed<ReadonlyMap<SkillId, readonly DemonId[]>>(() => {
    const out = new Map<SkillId, DemonId[]>();
    const demons = [...(this._data()?.demons ?? [])].sort((a, b) => a.level - b.level);
    for (const d of demons) {
      for (const id of d.skillIds) {
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
            races: this.http.get<Races>(bust('races')),
            fusionChart: this.http.get<FusionChart>(bust('fusion-chart')),
            tripleChart: this.http.get<TripleChart>(bust('triple-chart')),
            elementChart: this.http.get<ElementChart>(bust('element-chart')),
            specialRecipes: this.http.get<SpecialRecipes>(bust('special-recipes')),
          }).pipe(map((sets): LoadedSmt1Data => ({ ...sets, meta })));
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
