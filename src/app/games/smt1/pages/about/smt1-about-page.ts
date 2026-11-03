import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { Smt1DataService } from '../../data/smt1-data.service';

/**
 * About / attribution for the SMT1 companion: where the data comes from and why
 * it is labelled PS1 (SPEC §17.1 A1), the pinned commit, the rights holders, and
 * the import notes the data can't explain for itself.
 */
@Component({
  selector: 'app-smt1-about-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="g1-page g1-about">
      <div class="g1-runhead">
        <div>
          <h1><span class="g1-runhead__jp g1-plate" lang="ja">このガイドについて</span>About this guide</h1>
          <p>A fan-made planning companion for Shin Megami Tensei on the PlayStation.</p>
        </div>
      </div>

      <section class="g1-box" aria-labelledby="ab-ps1">
        <div class="g1-box__bar g1-plate"><h2 id="ab-ps1">The PS1 version and this data</h2></div>
        <div class="g1-box__data">
          <p>
            The data comes from one open-source source,
            <a [href]="repoUrl()" target="_blank" rel="noopener noreferrer">{{ repo() }}</a>. It has a single Shin Megami
            Tensei dataset, built from the SNES-era tables. There is no separate PS1 dataset there or anywhere this
            project found.
          </p>
          <p>
            The 2001 PlayStation release changed the interface, party rows, automap, music and difficulty. Nothing found
            says it changed demons, stats or fusion, so this guide uses that data and labels it PS1. If a number here
            doesn't match your PS1 game, that's the likely reason.
          </p>
        </div>
      </section>

      <section class="g1-box" aria-labelledby="ab-src">
        <div class="g1-box__bar g1-plate"><h2 id="ab-src">Data source</h2></div>
        <div class="g1-box__data">
          <p>Converted from {{ repo() }}, released into the public domain ({{ licence() }}). Its author is credited here with thanks.</p>
          <dl class="g1-facts g1-facts--stack">
            <div><dt>Pinned commit</dt><dd>@if (sha(); as s) { <a [href]="repoUrl() + '/tree/' + s" target="_blank" rel="noopener noreferrer"><code>{{ s.slice(0, 7) }}</code></a> } @else { not loaded yet }</dd></div>
            <div><dt>Data imported</dt><dd>{{ meta()?.importedAt ?? '–' }}</dd></div>
            @for (d of datasets(); track d.name) { <div><dt>{{ d.name }}</dt><dd>{{ d.entries }} records</dd></div> }
          </dl>
          @if (meta()?.notes?.length) {
            <details>
              <summary>Import notes</summary>
              <ul>@for (n of meta()!.notes; track n) { <li>{{ n }}</li> }</ul>
            </details>
          }
        </div>
      </section>

      <section class="g1-box" aria-labelledby="ab-rights">
        <div class="g1-box__bar g1-plate"><h2 id="ab-rights">Game content</h2></div>
        <div class="g1-box__data">
          <p>
            Shin Megami Tensei and all associated names and content are the property of <strong>Atlus</strong> and
            <strong>Sega</strong>. This project is not affiliated with, endorsed by, or sponsored by them. Every value shown
            is a factual game statistic. Free and ad-free, and it collects no personal data: your compendium and settings
            stay in your own browser.
          </p>
        </div>
      </section>
    </article>
  `,
})
export class Smt1AboutPage {
  private readonly data = inject(Smt1DataService);

  protected readonly meta = computed(() => this.data.data()?.meta ?? null);
  protected readonly repo = computed(() => this.meta()?.upstream.repo ?? 'aqiu384/megaten-fusion-tool');
  protected readonly repoUrl = computed(() => `https://github.com/${this.repo()}`);
  protected readonly licence = computed(() => this.meta()?.upstream.licence ?? 'The Unlicense');
  protected readonly sha = computed(() => this.meta()?.upstream.sha ?? null);
  protected readonly datasets = computed(() => Object.entries(this.meta()?.datasets ?? {}).map(([name, d]) => ({ name, entries: d.entries })));
}
