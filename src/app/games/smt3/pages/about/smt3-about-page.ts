import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { Smt3DataService } from '../../data/smt3-data.service';

/**
 * About / attribution for the Nocturne companion: the upstream data source and
 * pinned commit (from the loaded `meta.json`), the rights holders, and the
 * import notes the data can't explain for itself.
 */
@Component({
  selector: 'app-smt3-about-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="s3-page ab">
      <h1>About the Nocturne Companion</h1>
      <p>
        A fan-made planning companion for Shin Megami Tensei III: Nocturne: browse demons, magatama and
        skills, track your compendium, and work out fusions and skill routes. It ships no game assets —
        only factual data such as levels, stats, affinities and fusion recipes.
      </p>

      <section class="s3-panel">
        <h2>Data source</h2>
        <p>
          All game data is converted from
          <a [href]="repoUrl()" target="_blank" rel="noopener noreferrer">{{ repo() }}</a> — the same
          open-source, public-domain ({{ licence() }}) Megami Tensei fusion tool, and the same pinned commit,
          as this app's Persona 5 Royal data. Its author is credited here with thanks.
        </p>
        <dl class="s3-kv">
          <dt>Pinned commit</dt>
          <dd>
            @if (sha(); as s) { <a [href]="repoUrl() + '/tree/' + s" target="_blank" rel="noopener noreferrer"><code>{{ s.slice(0, 7) }}</code></a> }
            @else { <span class="s3-muted">not loaded yet</span> }
          </dd>
          <dt>Data imported</dt>
          <dd>{{ meta()?.importedAt ?? '—' }}</dd>
          @for (d of datasets(); track d.name) {
            <dt>{{ d.name }}</dt><dd>{{ d.entries }} records</dd>
          }
        </dl>
        @if (meta()?.notes?.length) {
          <details>
            <summary>Import notes</summary>
            <ul>@for (n of meta()!.notes; track n) { <li>{{ n }}</li> }</ul>
          </details>
        }
      </section>

      <section class="s3-panel">
        <h2>Game content</h2>
        <p>
          Shin Megami Tensei III: Nocturne and all associated names and content are the property of
          <strong>Atlus</strong> and <strong>Sega</strong>. This project is not affiliated with, endorsed by, or
          sponsored by them. Every value shown is a factual game statistic.
        </p>
      </section>

      <section class="s3-panel">
        <h2>Non-commercial fan tool</h2>
        <p>Free, ad-free, and it collects no personal data — your compendium and settings stay in your own browser.</p>
      </section>
    </article>
  `,
  styles: `.ab { max-width: 44rem; p { margin: 0; line-height: 1.55; } h1 { margin: 0; font-size: 1.5rem; } details { margin-top: 0.8rem; font-size: 0.85rem; } li { margin: 0.3rem 0; } }`,
})
export class Smt3AboutPage {
  private readonly data = inject(Smt3DataService);

  protected readonly meta = computed(() => this.data.data()?.meta ?? null);
  protected readonly repo = computed(() => this.meta()?.upstream.repo ?? 'aqiu384/megaten-fusion-tool');
  protected readonly repoUrl = computed(() => `https://github.com/${this.repo()}`);
  protected readonly licence = computed(() => this.meta()?.upstream.licence ?? 'The Unlicense');
  protected readonly sha = computed(() => this.meta()?.upstream.sha ?? null);
  protected readonly datasets = computed(() =>
    Object.entries(this.meta()?.datasets ?? {}).map(([name, d]) => ({ name, entries: d.entries })),
  );
}
