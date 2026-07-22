/**
 * `public/data/p5r/meta.json` — written by the importer (§8.4.5) and read by
 * the app to cache-bust the datasets on the pinned upstream commit (§8.5).
 */
export interface DatasetMeta {
  readonly file: string;
  readonly entries: number;
  readonly bytes: number;
  /** Raw upstream URLs this dataset was converted from, for attribution (§13). */
  readonly sourceUrls: readonly string[];
}

export interface GameDataMeta {
  readonly game: 'p5r';
  readonly upstream: {
    readonly repo: string;
    readonly sha: string;
    readonly licence: string;
  };
  /** ISO date. Sticky: only refreshed when a dataset actually changed. */
  readonly importedAt: string;
  readonly datasets: Readonly<Record<string, DatasetMeta>>;
  /** Import decisions the emitted data cannot explain for itself. */
  readonly notes: readonly string[];
}
