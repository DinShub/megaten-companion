import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { GameDataService } from '../../data/game-data.service';

/**
 * About / attribution page (§13, task 59). Credits the upstream data source and
 * the game's rights holder, surfaces the pinned dataset commit the app was built
 * against, and states the non-commercial fan-tool status.
 *
 * The static attribution always renders; the commit SHA, import date and per-
 * dataset counts come from the loaded `meta.json` (§8.4.5) and fill in once the
 * P5rLayout's one-time data load resolves. Deliberately PrimeNG-free — a low-
 * frequency content page has no reason to pull the component library into its
 * lazy chunk.
 */
@Component({
  selector: 'app-about-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="about">
      <h1 class="about__title">About {{ game }} Companion</h1>
      <p class="about__lead">
        A fan-made planning companion for {{ game }}: browse personas, shadows and skills, track your
        compendium, and work out fusions, itemization and skill routes. It ships no game assets — only
        factual data such as levels, stats, affinities and fusion recipes.
      </p>

      <section class="about__sect" aria-labelledby="about-data">
        <h2 id="about-data" class="about__head">Data source</h2>
        <p>
          All game data is converted from
          <a class="about__link" [href]="repoUrl()" target="_blank" rel="noopener noreferrer"
            >{{ repo() }}</a
          >, an open-source Megami Tensei fusion tool released into the public domain under
          {{ licence() }}. Its author is credited here with thanks; none of the conversion work would
          exist without it.
        </p>

        <dl class="about__meta">
          <dt>Upstream</dt>
          <dd>
            <a class="about__link" [href]="repoUrl()" target="_blank" rel="noopener noreferrer"
              >github.com/{{ repo() }}</a
            >
          </dd>

          <dt>Pinned commit</dt>
          <dd>
            @if (sha(); as s) {
              <a class="about__link" [href]="commitUrl()" target="_blank" rel="noopener noreferrer"
                ><code>{{ shortSha() }}</code></a
              >
            } @else {
              <span class="about__pending">not loaded yet</span>
            }
          </dd>

          <dt>Data imported</dt>
          <dd>
            @if (importedAt(); as d) {
              <time [attr.datetime]="d">{{ d }}</time>
            } @else {
              <span class="about__pending">—</span>
            }
          </dd>

          <dt>Licence</dt>
          <dd>{{ licence() }}</dd>
        </dl>

        @if (datasets().length) {
          <details class="about__details">
            <summary>Datasets ({{ totalEntries() }} records)</summary>
            <ul class="about__datasets">
              @for (d of datasets(); track d.name) {
                <li>
                  <span class="about__ds-name">{{ d.name }}</span>
                  <span class="about__ds-count">{{ d.entries }}</span>
                </li>
              }
            </ul>
          </details>
        }
      </section>

      <section class="about__sect" aria-labelledby="about-game">
        <h2 id="about-game" class="about__head">Game content</h2>
        <p>
          Persona 5 Royal and all associated names and content are the property of
          <strong>Atlus</strong> and <strong>Sega</strong>, the rights holders for the underlying game.
          This project is not affiliated with, endorsed by, or sponsored by them. No sprites, portraits,
          music or copied prose are distributed here — every value shown is a factual game statistic.
        </p>
      </section>

      <section class="about__sect" aria-labelledby="about-status">
        <h2 id="about-status" class="about__head">Non-commercial fan tool</h2>
        <p>
          This is a free, non-commercial fan project made for other players. It is not sold, carries no
          advertising, and collects no personal data — your compendium and settings stay in your own
          browser.
        </p>
      </section>
    </article>
  `,
  styles: `
    .about {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      max-width: 44rem;

      &__title {
        margin: 0;
        font-size: 1.5rem;
      }
      &__lead {
        margin: 0;
        line-height: 1.55;
      }
      &__sect {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        padding-top: 1.25rem;
        border-top: 1px solid var(--p-content-border-color, rgba(127, 127, 127, 0.25));

        p {
          margin: 0;
          line-height: 1.55;
        }
      }
      &__head {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 600;
      }
      &__link {
        color: var(--p-primary-color);
        text-decoration: none;

        &:hover,
        &:focus-visible {
          text-decoration: underline;
        }
      }
      &__meta {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.4rem 1rem;
        margin: 0.25rem 0 0;
        font-size: 0.92rem;

        dt {
          font-weight: 600;
          color: var(--p-text-muted-color);
        }
        dd {
          margin: 0;
          overflow-wrap: anywhere;
        }
      }
      &__pending {
        color: var(--p-text-muted-color);
      }
      &__details {
        margin-top: 0.35rem;
        font-size: 0.9rem;

        summary {
          color: var(--p-text-muted-color);
          cursor: pointer;
        }
      }
      &__datasets {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
        gap: 0.3rem 1rem;
        margin: 0.6rem 0 0;
        padding: 0;
        list-style: none;

        li {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.2rem 0;
          border-bottom: 1px solid var(--p-content-border-color, rgba(127, 127, 127, 0.15));
        }
      }
      &__ds-count {
        color: var(--p-text-muted-color);
        font-variant-numeric: tabular-nums;
      }
    }
  `,
})
export class AboutPage {
  private readonly data = inject(GameDataService);

  /** Static title label; the game's own display name is game-scoped elsewhere. */
  protected readonly game = 'Persona 5 Royal';

  private readonly meta = computed(() => this.data.data()?.meta ?? null);

  protected readonly repo = computed(() => this.meta()?.upstream.repo ?? 'aqiu384/megaten-fusion-tool');
  protected readonly repoUrl = computed(() => `https://github.com/${this.repo()}`);
  protected readonly licence = computed(() => this.meta()?.upstream.licence ?? 'The Unlicense (public domain)');

  protected readonly sha = computed(() => this.meta()?.upstream.sha ?? null);
  protected readonly shortSha = computed(() => this.sha()?.slice(0, 10) ?? '');
  protected readonly commitUrl = computed(() => `${this.repoUrl()}/commit/${this.sha()}`);
  protected readonly importedAt = computed(() => this.meta()?.importedAt ?? null);

  /** Per-dataset record counts, sorted by name, for the collapsible summary. */
  protected readonly datasets = computed(() => {
    const map = this.meta()?.datasets;
    if (!map) return [];
    return Object.entries(map)
      .map(([name, d]) => ({ name, entries: d.entries }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  protected readonly totalEntries = computed(() =>
    this.datasets().reduce((sum, d) => sum + d.entries, 0),
  );
}
