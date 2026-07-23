import { convertToParamMap } from '@angular/router';

import type { ClassroomEntry } from '../../model';
import {
  groupExams,
  groupQuizzesByMonth,
  isClassroomSearchActive,
  parseClassroomState,
  searchClassroom,
  serializeClassroomState,
} from './classroom-filter';

const SRC = 'https://example.test/source';

// A deliberately out-of-order slice spanning three months and two exam periods;
// `order` carries the true chronology (January is last despite month 1).
const ENTRIES: ClassroomEntry[] = [
  { id: 'exam-07-13-1', kind: 'exam', date: '7/13', order: 5, exam: { id: 'july-finals', name: 'July Finals' }, question: 'If angle C is 28 degrees, what is the measure of B and E?', answers: ['64 degrees'], source: SRC },
  { id: 'quiz-04-12-1', kind: 'quiz', date: '4/12', order: 1, exam: null, question: "What does the Devil's Dictionary define as the hindering factor in the progress of the human race?", answers: ['Villains'], source: SRC },
  { id: 'exam-05-11-1', kind: 'exam', date: '5/11', order: 3, exam: { id: 'may-midterms', name: 'May Midterms' }, question: 'The idiom "favoring the magistrate": which figure defeated Yoshitsune?', answers: ['Minamoto no Yoritomo', 'Yoritomo won', 'The weak'], source: SRC },
  { id: 'quiz-01-27-1', kind: 'quiz', date: '1/27', order: 6, exam: null, question: "How far did the study suggest one person's happiness can spread?", answers: ['To friends of friends of friends'], source: SRC },
  { id: 'quiz-05-07-1', kind: 'quiz', date: '5/7', order: 2, exam: null, question: 'What is the literal translation of the phrase "femme fatale"?', answers: ['Fatal woman'], source: SRC },
  { id: 'exam-05-12-1', kind: 'exam', date: '5/12', order: 4, exam: { id: 'may-midterms', name: 'May Midterms' }, question: 'Which brain function is responsible for the illusion?', answers: ['Cognition'], source: SRC },
];

describe('searchClassroom (task 64)', () => {
  it('surfaces an answer from a partial question in one lookup', () => {
    const hits = searchClassroom(ENTRIES, 'femme fatale');
    expect(hits).toHaveLength(1);
    expect(hits[0].answers[0]).toBe('Fatal woman');
  });

  it('is case-insensitive', () => {
    expect(searchClassroom(ENTRIES, 'FEMME')).toHaveLength(1);
  });

  it('matches answer text too, so you can confirm from the answer side', () => {
    const hits = searchClassroom(ENTRIES, 'yoritomo');
    expect(hits).toHaveLength(1);
    expect(hits[0].date).toBe('5/11');
  });

  it('ANDs its terms — extra words narrow rather than widen', () => {
    expect(searchClassroom(ENTRIES, 'magistrate')).toHaveLength(1);
    expect(searchClassroom(ENTRIES, 'magistrate nonsense')).toHaveLength(0);
  });

  it('returns results in chronological order regardless of input order', () => {
    const orders = searchClassroom(ENTRIES, 'the').map((e) => e.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('treats an empty or whitespace query as no search', () => {
    expect(searchClassroom(ENTRIES, '')).toHaveLength(0);
    expect(searchClassroom(ENTRIES, '   ')).toHaveLength(0);
    expect(isClassroomSearchActive({ search: '  ', tab: 'class' })).toBe(false);
    expect(isClassroomSearchActive({ search: 'x', tab: 'class' })).toBe(true);
  });
});

describe('groupQuizzesByMonth (task 64)', () => {
  it('groups only the daily questions, months in school-year order', () => {
    const groups = groupQuizzesByMonth(ENTRIES);
    expect(groups.map((g) => g.label)).toEqual(['April', 'May', 'January']);
    expect(groups.every((g) => g.entries.every((e) => e.kind === 'quiz'))).toBe(true);
    expect(groups.flatMap((g) => g.entries.map((e) => e.date))).toEqual(['4/12', '5/7', '1/27']);
  });
});

describe('groupExams (task 64)', () => {
  it('groups exam questions by period, periods in chronological order', () => {
    const groups = groupExams(ENTRIES);
    expect(groups.map((g) => g.exam.name)).toEqual(['May Midterms', 'July Finals']);
    const may = groups[0];
    expect(may.entries.map((e) => e.date)).toEqual(['5/11', '5/12']);
  });
});

describe('classroom URL state', () => {
  it('round-trips a search and tab, dropping defaults', () => {
    expect(serializeClassroomState({ search: '', tab: 'class' })).toEqual({ q: null, tab: null });
    expect(serializeClassroomState({ search: 'nero', tab: 'exams' })).toEqual({ q: 'nero', tab: 'exams' });
    const parsed = parseClassroomState(convertToParamMap({ q: 'nero', tab: 'exams' }));
    expect(parsed).toEqual({ search: 'nero', tab: 'exams' });
  });

  it('falls back to the class tab for an unknown tab param', () => {
    expect(parseClassroomState(convertToParamMap({ tab: 'bogus' })).tab).toBe('class');
  });
});
