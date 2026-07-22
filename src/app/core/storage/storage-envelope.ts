/**
 * The persistence envelope (§9.4). Every value written to `localStorage` — and
 * every export file — is wrapped in this shape so a stored payload always
 * carries the schema version it was written at. Reads run a migration chain
 * keyed on `schemaVersion`; a payload from a *future* version is refused rather
 * than coerced, because silently losing a hand-typed compendium is the worst
 * outcome this app can produce.
 */
export interface StorageEnvelope<T> {
  readonly schemaVersion: number;
  /** ISO timestamp of the write. */
  readonly savedAt: string;
  readonly data: T;
}

/** Upgrades a payload from one schema version to the next. */
export type Migration = (data: unknown) => unknown;

/**
 * Describes how one logical value is stored: its short key, the version the app
 * currently writes, and the migrations that carry older payloads forward.
 * `migrations[n]` upgrades data written at version `n` to version `n + 1`.
 */
export interface StorageSchema<T> {
  /** Short key; namespaced to `megaten-companion:v1:<key>` at rest. */
  readonly key: string;
  readonly currentVersion: number;
  readonly migrations: Readonly<Record<number, Migration>>;
}

/** Why a read produced no usable value. */
export type ReadFailure =
  /** No value stored under the key yet. */
  | { readonly status: 'empty' }
  /** Value present but not parseable / not a valid envelope. */
  | { readonly status: 'error'; readonly reason: 'corrupt'; readonly message: string }
  /** Written by a newer app version than this one understands — refused (§9.4). */
  | { readonly status: 'error'; readonly reason: 'future-version'; readonly message: string }
  /** A migration step was missing or threw. */
  | { readonly status: 'error'; readonly reason: 'migration-failed'; readonly message: string };

export type ReadResult<T> = { readonly status: 'ok'; readonly data: T } | ReadFailure;

/** The subset of the DOM `Storage` API the app depends on. */
export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
