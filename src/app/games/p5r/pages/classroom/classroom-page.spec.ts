import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { GameDataService } from '../../data/game-data.service';
import type { ClassroomEntry } from '../../model';
import { ClassroomPage } from './classroom-page';

const SRC = 'https://example.test/source';

const CLASSROOM: ClassroomEntry[] = [
  { id: 'quiz-04-12-1', kind: 'quiz', date: '4/12', order: 1, exam: null, question: "What does the Devil's Dictionary define as the hindering factor in the progress of the human race?", answers: ['Villains'], source: SRC },
  { id: 'quiz-05-07-1', kind: 'quiz', date: '5/7', order: 2, exam: null, question: 'What is the literal translation of the phrase "femme fatale"?', answers: ['Fatal woman'], source: SRC },
  { id: 'exam-05-11-1', kind: 'exam', date: '5/11', order: 3, exam: { id: 'may-midterms', name: 'May Midterms' }, question: 'The idiom "favoring the magistrate": which figure defeated Yoshitsune?', answers: ['Minamoto no Yoritomo', 'Yoritomo won', 'The weak'], source: SRC },
];

function stubService() {
  return {
    classroomReady: signal(true),
    classroomLoading: signal(false),
    classroomError: signal<string | null>(null),
    loadClassroom: () => {},
    retryClassroom: () => {},
    data: signal({ classroom: CLASSROOM }),
  } as unknown as GameDataService;
}

function mount() {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: GameDataService, useValue: stubService() }],
  });
  const fixture = TestBed.createComponent(ClassroomPage);
  fixture.detectChanges();
  return fixture;
}

describe('ClassroomPage (task 64)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows the daily questions and their answers immediately — no spoiler gating', () => {
    const el = mount().nativeElement as HTMLElement;
    const text = el.textContent ?? '';
    expect(text).toContain('literal translation of the phrase "femme fatale"');
    // Answer is visible without any click.
    expect(text).toContain('Fatal woman');
    expect(text).toContain('Villains');
  });

  it('surfaces an answer by typing part of the question', () => {
    const fixture = mount();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input[type="text"]') as HTMLInputElement;

    input.value = 'femme';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const text = el.textContent ?? '';
    expect(text).toContain('Fatal woman'); // the match
    expect(text).not.toContain('Villains'); // the non-match is filtered out
  });

  it('exposes the exams in their own ordered view', () => {
    const fixture = mount();
    const el = fixture.nativeElement as HTMLElement;

    // The exam question is not in the default (class) browse view…
    expect(el.textContent ?? '').not.toContain('Minamoto no Yoritomo');

    const examsTab = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Exams'));
    expect(examsTab).toBeTruthy();
    examsTab!.click();
    fixture.detectChanges();

    const text = el.textContent ?? '';
    expect(text).toContain('May Midterms');
    expect(text).toContain('Minamoto no Yoritomo');
    // The chained follow-up answers render too.
    expect(text).toContain('The weak');
  });
});
