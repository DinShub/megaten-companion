import type { ParamMap } from '@angular/router';

import type { ClassroomEntry, ClassroomExamRef } from '../../model';

/**
 * Pure search and grouping for the classroom page (§4.5, task 64). Kept out of the
 * component so the "typing a partial question surfaces its answer" behaviour is a
 * plain unit test rather than a rendering one.
 */

/** Browse mode when not searching: daily class questions, or the ordered exams. */
export type ClassroomTab = 'class' | 'exams';

export interface ClassroomState {
  readonly search: string;
  readonly tab: ClassroomTab;
}

export const DEFAULT_CLASSROOM_STATE: ClassroomState = { search: '', tab: 'class' };

/** Month number → display name, for the chronological browse headers. */
export const MONTH_NAMES: Readonly<Record<number, string>> = {
  1: 'January', 2: 'February', 3: 'March', 4: 'April', 5: 'May', 6: 'June',
  7: 'July', 8: 'August', 9: 'September', 10: 'October', 11: 'November', 12: 'December',
};

export interface MonthGroup {
  readonly key: number;
  readonly label: string;
  readonly entries: readonly ClassroomEntry[];
}

export interface ExamGroup {
  readonly exam: ClassroomExamRef;
  readonly entries: readonly ClassroomEntry[];
}

const byOrder = (a: ClassroomEntry, b: ClassroomEntry): number => a.order - b.order;

const monthOf = (entry: ClassroomEntry): number => Number.parseInt(entry.date.split('/')[0], 10);

/** Every entry in school-year chronological order. */
export function sortByOrder(entries: readonly ClassroomEntry[]): ClassroomEntry[] {
  return [...entries].sort(byOrder);
}

export function isClassroomSearchActive(state: ClassroomState): boolean {
  return state.search.trim().length > 0;
}

/**
 * Match a query against every entry's question, answers, date and exam name. The
 * query is split into terms that must *all* match (AND), so extra words narrow
 * rather than widen — the realistic input is a phrase copied from the question.
 * Results stay in chronological order. An empty query matches nothing (the page
 * shows the browse view instead).
 */
export function searchClassroom(entries: readonly ClassroomEntry[], query: string): ClassroomEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return sortByOrder(entries).filter((entry) => {
    const haystack = `${entry.question} ${entry.answers.join(' ')} ${entry.date} ${entry.exam?.name ?? ''}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/** Daily quiz questions, grouped by month in chronological (school-year) order. */
export function groupQuizzesByMonth(entries: readonly ClassroomEntry[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const entry of sortByOrder(entries)) {
    if (entry.kind !== 'quiz') continue;
    const key = monthOf(entry);
    const last = groups[groups.length - 1];
    if (last && last.key === key) (last.entries as ClassroomEntry[]).push(entry);
    else groups.push({ key, label: MONTH_NAMES[key] ?? `Month ${key}`, entries: [entry] });
  }
  return groups;
}

/** Exam questions, grouped by exam period, periods in chronological order. */
export function groupExams(entries: readonly ClassroomEntry[]): ExamGroup[] {
  const groups: ExamGroup[] = [];
  for (const entry of sortByOrder(entries)) {
    if (entry.kind !== 'exam' || !entry.exam) continue;
    const last = groups[groups.length - 1];
    if (last && last.exam.id === entry.exam.id) (last.entries as ClassroomEntry[]).push(entry);
    else groups.push({ exam: entry.exam, entries: [entry] });
  }
  return groups;
}

const TABS: readonly ClassroomTab[] = ['class', 'exams'];

export function parseClassroomState(params: ParamMap): ClassroomState {
  const tab = params.get('tab');
  return {
    search: params.get('q') ?? '',
    tab: TABS.includes(tab as ClassroomTab) ? (tab as ClassroomTab) : 'class',
  };
}

export function serializeClassroomState(state: ClassroomState): Record<string, string | null> {
  return {
    q: state.search.trim() ? state.search : null,
    tab: state.tab === 'class' ? null : state.tab,
  };
}
