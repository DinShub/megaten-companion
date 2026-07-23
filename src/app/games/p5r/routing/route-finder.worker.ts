/**
 * Route-finder Web Worker (§7.2 "Execution", task 51).
 *
 * Non-negotiable per the spec: a depth-4 search over 232 personas will not finish
 * in a frame, so the search runs off the main thread and the UI stays interactive.
 * The worker owns its own {@link FusionEngine} (built from the datasets each
 * request carries) and calls the pure {@link findRoutes} — no Angular, no DOM.
 *
 * Cancellation is cooperative-by-termination: a synchronous search can't observe
 * a message mid-run, so the store cancels by `terminate()`-ing this worker (which
 * takes effect immediately) and spawning a fresh one. The internal wall-clock /
 * node-cap budget (§7.2) is the backstop that keeps any single search bounded.
 *
 * Built as a standalone bundle by `@angular/build`'s `new Worker(new URL(…))`
 * detection, so it never touches the eager `main` chunk (bundle budget, §9.3).
 */
import { FusionEngine } from '../fusion';
import { findRoutes } from './route-finder';
import type { RouteWorkerRequest, RouteWorkerResponse } from './types';

// The dedicated-worker `postMessage` is single-argument; cast past the DOM lib's
// two-argument `Window.postMessage` signature that the app tsconfig exposes.
const reply = (message: RouteWorkerResponse): void =>
  (self as unknown as { postMessage(m: unknown): void }).postMessage(message);

addEventListener('message', (event: MessageEvent<RouteWorkerRequest>) => {
  const { reqId, data, request, ctx } = event.data;
  try {
    const engine = new FusionEngine(data);
    const result = findRoutes(engine, data, request, ctx);
    reply({ reqId, ok: true, result });
  } catch (err) {
    reply({ reqId, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
