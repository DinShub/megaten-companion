/** `public/data/p3r/meta.json` — written by the importer, read to cache-bust datasets. */
export interface DatasetMeta {
  readonly file: string;
  readonly entries: number;
  readonly bytes: number;
  /** Raw upstream URLs this dataset was converted from, for attribution. */
  readonly sourceUrls: readonly string[];
}

export interface GameDataMeta {
  readonly game: 'p3r';
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
