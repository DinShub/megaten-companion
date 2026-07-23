import { effect, inject, signal, untracked, type WritableSignal } from '@angular/core';
import { ActivatedRoute, type ParamMap, Router } from '@angular/router';

/**
 * A page's filter state, mirrored into the URL query string so a filtered view
 * is shareable and survives a reload (§4 "filter state deep-linked in the URL").
 *
 * `parse` seeds the signal from the current URL on first render; an effect writes
 * `serialize(state)` back on every change. Serialize a field to `null` to drop it
 * from the URL, keeping the query string clean when a filter is at its default.
 *
 * Deliberately one-way after seeding (URL is written, not re-read): reload
 * restoration is the requirement, and re-reading would fight the write-back.
 * Must be called from an injection context (a component field initializer).
 */
export interface UrlStateConfig<T> {
  readonly parse: (params: ParamMap) => T;
  readonly serialize: (state: T) => Record<string, string | null>;
}

export function createUrlState<T>(config: UrlStateConfig<T>): WritableSignal<T> {
  const route = inject(ActivatedRoute);
  const router = inject(Router);

  const state = signal<T>(config.parse(route.snapshot.queryParamMap));

  effect(() => {
    const queryParams = config.serialize(state());
    // `untracked` guards against the navigation re-entering this effect; `merge`
    // preserves unrelated params, and null values drop defaulted filters.
    untracked(() =>
      router.navigate([], {
        relativeTo: route,
        queryParams,
        queryParamsHandling: 'merge',
        replaceUrl: true,
      }),
    );
  });

  return state;
}

/** Parse a comma-separated multi-value param into a de-duplicated string list. */
export function parseList(params: ParamMap, key: string): string[] {
  const raw = params.get(key);
  if (!raw) return [];
  return [...new Set(raw.split(',').filter(Boolean))];
}

/** Serialize a list to a comma-joined string, or `null` when empty. */
export function serializeList(values: readonly string[]): string | null {
  return values.length ? values.join(',') : null;
}

/** Parse a bounded integer param, or `null` when absent/invalid. */
export function parseInt10(params: ParamMap, key: string): number | null {
  const raw = params.get(key);
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}
