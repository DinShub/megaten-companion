import { DestroyRef, inject, Injectable, NgZone, signal } from '@angular/core';

import { GameDataService } from '../../data/game-data.service';
import type { LoadedGameData } from '../../data/game-data';
import { FusionEngine } from '../../fusion';
import type { FusionContext, FusionData, PoolMode } from '../../fusion';
import { DEFAULT_MAX_DEPTH, findRoutes } from '../../routing';
import type { Objective, RouteRequest, RouteSearchResult, RouteWorkerRequest, RouteWorkerResponse } from '../../routing';
import { FusionStore } from './fusion.store';

/**
 * The Angular seam over the route finder (§7, Phase 7). Mirrors {@link FusionStore}:
 * `providedIn: 'root'` but referenced only from the lazy route-finder page, so it,
 * the worker wiring and the pure finder all stay out of the eager `main` chunk.
 *
 * Search runs in a **Web Worker** (§7.2, task 51) — a depth-3/4 search won't finish
 * in a frame. This store owns the worker: it posts the datasets + request + context,
 * routes the reply back onto signals, and **cancels by terminating** (a synchronous
 * search can't see a message mid-run, so termination is the only immediate cancel).
 *
 * Where `Worker` is unavailable — the jsdom test environment, or a browser without
 * module-worker support — it transparently runs the same pure {@link findRoutes} on
 * the calling thread. Identical results; only the off-main-thread guarantee is lost.
 */
@Injectable({ providedIn: 'root' })
export class RouteFinderStore {
  private readonly gameData = inject(GameDataService);
  private readonly fusion = inject(FusionStore);
  private readonly zone = inject(NgZone);

  private worker: Worker | null = null;
  private counter = 0;
  /** The reqId currently awaited; replies for any other id are stale and ignored. */
  private pending = 0;

  readonly searching = signal(false);
  readonly result = signal<RouteSearchResult | null>(null);
  readonly error = signal<string | null>(null);

  /**
   * Form state, lifted out of the routed {@link RouteFinder} component so it
   * survives navigation (§7). Following a persona link out of a route result and
   * pressing Back destroys and recreates the routed component; as component-local
   * signals these would reset to defaults, blanking the target, skills, objective,
   * pool and depth. Held on this `providedIn: 'root'` singleton they persist just
   * like {@link result}. `reset()` intentionally leaves them untouched.
   */
  readonly targetId = signal<string | null>(null);
  /** Target picker starts on the full roster — you're usually building an unowned goal. */
  readonly rosterMode = signal(false);
  readonly skillIds = signal<string[]>([]);
  readonly objective = signal<Objective>('fewest-steps');
  readonly pool = signal<PoolMode>('compendium');
  readonly maxDepth = signal(DEFAULT_MAX_DEPTH);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.disposeWorker());
  }

  /** Kick off a search; a search already in flight is pre-empted (§7.2 cancel). */
  search(request: RouteRequest, pool: PoolMode): void {
    const data = this.gameData.data();
    if (!data) return;

    if (this.searching()) this.disposeWorker(); // abandon the in-flight run immediately
    const ctx: FusionContext = { ...this.fusion.ctx(), pool };
    const reqId = ++this.counter;
    this.pending = reqId;
    this.searching.set(true);
    this.error.set(null);

    const worker = this.ensureWorker();
    const message: RouteWorkerRequest = { reqId, data: fusionDataOf(data), request, ctx };
    if (worker) {
      worker.postMessage(message);
      return;
    }
    // No worker available — run synchronously so the feature still works (tests).
    try {
      const engine = new FusionEngine(message.data);
      this.deliver({ reqId, ok: true, result: findRoutes(engine, message.data, request, ctx) });
    } catch (err) {
      this.deliver({ reqId, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Stop an in-flight search immediately (§7.2 "the UI … can cancel"). */
  cancel(): void {
    this.disposeWorker();
    this.pending = 0;
    this.searching.set(false);
  }

  /** Clear results — used when the target/skills change so stale routes don't linger. */
  reset(): void {
    this.cancel();
    this.result.set(null);
    this.error.set(null);
  }

  // ---- worker lifecycle -------------------------------------------------

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined') return null;
    const worker = new Worker(new URL('../../routing/route-finder.worker', import.meta.url), { type: 'module' });
    // Re-enter Angular so the signal writes schedule change detection even under
    // a zoned runtime where a raw worker callback would otherwise sit outside it.
    worker.onmessage = (event: MessageEvent<RouteWorkerResponse>) => this.zone.run(() => this.deliver(event.data));
    this.worker = worker;
    return worker;
  }

  private disposeWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  private deliver(response: RouteWorkerResponse): void {
    if (response.reqId !== this.pending) return; // a stale/cancelled search
    this.pending = 0;
    this.searching.set(false);
    if (response.ok) {
      this.result.set(response.result);
      this.error.set(null);
    } else {
      this.error.set(response.error);
      this.result.set(null);
    }
  }
}

/** The six-dataset slice the engine and finder read — smaller than the full load to clone. */
function fusionDataOf(data: LoadedGameData): FusionData {
  return {
    personas: data.personas,
    skills: data.skills,
    fusionChart: data.fusionChart,
    advancedRecipes: data.advancedRecipes,
    elementChart: data.elementChart,
    inheritMatrix: data.inheritMatrix,
  };
}
