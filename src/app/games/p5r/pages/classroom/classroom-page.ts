import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { LoadState } from '../../../../shared/load-state/load-state';
import { createUrlState } from '../../../../shared/url-query';
import { GameDataService } from '../../data/game-data.service';
import {
  type ClassroomState,
  groupExams,
  groupQuizzesByMonth,
  isClassroomSearchActive,
  parseClassroomState,
  searchClassroom,
  serializeClassroomState,
  sortByOrder,
} from './classroom-filter';
import { RansomTitle } from '../../ui/ransom-title';

/**
 * Classroom answers (§4.5, task 64). A straight reference: every class and exam
 * question, its answer, and the in-game date. The primary control is a question-
 * text search ("the game just asked me this"); browsing by date and a separate
 * ordered exam view are secondary. Answers show immediately — no spoiler gating.
 *
 * The dataset loads on demand (task 58): a session that never opens this page
 * never fetches it, and it drags no other dataset along.
 */
@Component({
  selector: 'app-classroom-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, LoadState, RansomTitle],
  template: `
    @if (data.classroomReady()) {
      <div class="page classroom">
        <ng-template #card let-e let-showExam="showExam">
          <article class="qa" [class.qa--exam]="e.kind === 'exam'">
            <div class="qa__meta">
              <span class="qa__date">{{ e.date }}</span>
              @if (showExam && e.exam) { <span class="qa__badge">{{ e.exam.name }}</span> }
            </div>
            <p class="qa__q">{{ e.question }}</p>
            @if (e.answers.length === 1) {
              <p class="qa__a"><span class="qa__a-label">Answer</span><span class="qa__a-text">{{ e.answers[0] }}</span></p>
            } @else {
              <div class="qa__a">
                <span class="qa__a-label">Answers</span>
                <ol class="qa__a-list">
                  @for (ans of e.answers; track $index) { <li>{{ ans }}</li> }
                </ol>
              </div>
            }
          </article>
        </ng-template>

        <header class="page__head">
          <app-ransom-title class="page__title" text="Classroom Answers" />
          <span class="page__count">{{ entries().length }} questions</span>
        </header>
        <p class="classroom__lead">
          Put on the spot in class? Search the question, or browse by date — every answer is right here.
        </p>

        <div class="toolbar">
          <span class="toolbar__search">
            <i class="pi pi-search" aria-hidden="true"></i>
            <input
              type="text"
              placeholder="Search a question or answer…"
              aria-label="Search classroom questions and answers"
              [value]="state().search"
              (input)="patch({ search: $any($event.target).value })"
            />
            @if (searching()) {
              <button class="toolbar__x" type="button" aria-label="Clear search" (click)="patch({ search: '' })">
                <i class="pi pi-times" aria-hidden="true"></i>
              </button>
            }
          </span>
        </div>

        @if (searching()) {
          <section class="group" aria-live="polite">
            <h2 class="group__title">{{ results().length }} {{ results().length === 1 ? 'result' : 'results' }}</h2>
            @if (results().length) {
              <ul class="cards">
                @for (e of results(); track e.id) {
                  <li><ng-container [ngTemplateOutlet]="card" [ngTemplateOutletContext]="{ $implicit: e, showExam: true }" /></li>
                }
              </ul>
            } @else {
              <p class="empty">
                Nothing matches “{{ state().search }}”.
                <button type="button" class="linkbtn" (click)="patch({ search: '' })">Clear search</button>
              </p>
            }
          </section>
        } @else {
          <div class="tabs" role="group" aria-label="Browse mode">
            <button type="button" class="tab" [class.is-on]="state().tab === 'class'" [attr.aria-pressed]="state().tab === 'class'" (click)="patch({ tab: 'class' })">
              <i class="pi pi-calendar" aria-hidden="true"></i><span>Class questions</span>
            </button>
            <button type="button" class="tab" [class.is-on]="state().tab === 'exams'" [attr.aria-pressed]="state().tab === 'exams'" (click)="patch({ tab: 'exams' })">
              <i class="pi pi-pencil" aria-hidden="true"></i><span>Exams</span>
            </button>
          </div>

          @if (state().tab === 'class') {
            @for (group of monthGroups(); track group.key) {
              <section class="group">
                <h2 class="group__title">{{ group.label }}</h2>
                <ul class="cards">
                  @for (e of group.entries; track e.id) {
                    <li><ng-container [ngTemplateOutlet]="card" [ngTemplateOutletContext]="{ $implicit: e, showExam: false }" /></li>
                  }
                </ul>
              </section>
            }
          } @else {
            @for (group of examGroups(); track group.exam.id) {
              <section class="group">
                <h2 class="group__title">{{ group.exam.name }} <span class="group__meta">{{ group.entries.length }} questions</span></h2>
                <ol class="cards cards--exam">
                  @for (e of group.entries; track e.id) {
                    <li><ng-container [ngTemplateOutlet]="card" [ngTemplateOutletContext]="{ $implicit: e, showExam: false }" /></li>
                  }
                </ol>
              </section>
            }
          }
        }
      </div>
    } @else {
      <app-load-state [loading]="data.classroomLoading()" [error]="data.classroomError()" (retry)="data.retryClassroom()" />
    }
  `,
  styles: `
    .page { display: flex; flex-direction: column; gap: 1rem; }
    .page__head { display: flex; align-items: baseline; gap: 0.75rem; }
    .page__title { margin: 0; font-size: 1.5rem; }
    .page__count { color: var(--p-text-muted-color); font-size: 0.9rem; }
    .classroom__lead { margin: -0.5rem 0 0; color: var(--p-text-muted-color); font-size: 0.9rem; max-width: 44rem; }

    .toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
    .toolbar__search {
      display: inline-flex; align-items: center; gap: 0.5rem; flex: 1 1 20rem;
      padding: 0.5rem 0.7rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3));
      border-radius: var(--p-border-radius, 6px); background: var(--p-content-background);
      &:focus-within { border-color: var(--p-primary-color); }
      .pi-search { color: var(--p-text-muted-color); }
      input { flex: 1 1 auto; border: 0; background: transparent; color: var(--p-text-color); font: inherit; outline: none; }
    }
    .toolbar__x { display: inline-flex; border: 0; background: transparent; color: var(--p-text-muted-color); cursor: pointer; padding: 0.2rem; &:hover { color: var(--p-text-color); } }

    .tabs { display: inline-flex; gap: 0.25rem; padding: 0.25rem; border-radius: 999px; background: var(--app-panel); align-self: flex-start; }
    .tab {
      display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.9rem; border: 0; border-radius: 999px;
      background: transparent; color: var(--p-text-muted-color); font: inherit; font-size: 0.9rem; cursor: pointer;
      &:hover { color: var(--p-text-color); }
      &.is-on { background: var(--p-primary-color); color: var(--p-primary-contrast-color, #fff); }
      &:focus-visible { outline: 2px solid var(--p-primary-color); outline-offset: 2px; }
    }

    .group { display: flex; flex-direction: column; gap: 0.6rem; }
    .group__title { margin: 0.5rem 0 0; font-size: 1.05rem; display: flex; align-items: baseline; gap: 0.6rem; }
    .group__meta { color: var(--p-text-muted-color); font-size: 0.8rem; font-weight: 400; }

    .cards { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr)); }
    .cards--exam { counter-reset: q; }
    .cards > li { min-width: 0; }

    .qa {
      height: 100%; display: flex; flex-direction: column; gap: 0.5rem;
      padding: 0.8rem 0.9rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.25));
      border-left: 3px solid var(--p-primary-color); border-radius: var(--p-border-radius, 8px);
      background: var(--app-panel);
    }
    .qa--exam { border-left-style: double; border-left-width: 4px; }
    .qa__meta { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
    .qa__date {
      font-variant-numeric: tabular-nums; font-size: 0.78rem; font-weight: 600; color: var(--p-text-muted-color);
      padding: 0.1rem 0.45rem; border: 1px solid var(--p-content-border-color, rgba(127,127,127,0.3)); border-radius: 999px;
    }
    .qa__badge { font-size: 0.72rem; font-weight: 600; color: var(--p-primary-color); text-transform: uppercase; letter-spacing: 0.03em; }
    .qa__q { margin: 0; font-size: 0.95rem; line-height: 1.4; }

    .qa__a { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4rem 0.5rem; margin-top: auto; padding-top: 0.35rem; border-top: 1px dashed var(--p-content-border-color, rgba(127,127,127,0.25)); }
    .qa__a-label { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--p-text-muted-color); }
    .qa__a-text { font-weight: 700; color: var(--p-primary-color); }
    .qa__a-list { margin: 0; padding-left: 1.2rem; display: flex; flex-direction: column; gap: 0.1rem; }
    .qa__a-list li { font-weight: 700; color: var(--p-primary-color); }

    .empty { padding: 2rem 1rem; text-align: center; color: var(--p-text-muted-color); }
    .linkbtn { border: 0; background: transparent; color: var(--p-primary-color); cursor: pointer; font: inherit; text-decoration: underline; }
  `,
})
export class ClassroomPage {
  protected readonly data = inject(GameDataService);

  protected readonly state = createUrlState<ClassroomState>({
    parse: parseClassroomState,
    serialize: serializeClassroomState,
  });

  protected readonly entries = computed(() => sortByOrder(this.data.data()?.classroom ?? []));
  protected readonly results = computed(() => searchClassroom(this.entries(), this.state().search));
  protected readonly monthGroups = computed(() => groupQuizzesByMonth(this.entries()));
  protected readonly examGroups = computed(() => groupExams(this.entries()));
  protected readonly searching = computed(() => isClassroomSearchActive(this.state()));

  constructor() {
    // On-demand dataset (task 58) — a calculator-only session never fetches it.
    this.data.loadClassroom();
  }

  protected patch(partial: Partial<ClassroomState>): void {
    this.state.update((s) => ({ ...s, ...partial }));
  }
}
