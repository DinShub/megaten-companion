/**
 * Classroom & exam answers (§4.5, Phase 10). A straight reference dataset: every
 * in-class question and every exam question, the correct answer, and the in-game
 * date. Search over {@link ClassroomEntry.question} is the primary lookup — "the
 * game just asked me this" — so answers are shown immediately, never spoiler-gated.
 *
 * The dataset has no machine-readable upstream; it is transcribed from a
 * user-supplied reference and carries that URL per record for attribution (§8.3).
 */

/** The exam period an exam question belongs to, shared by every question in it. */
export interface ClassroomExamRef {
  /** Slug, e.g. `may-midterms`. */
  readonly id: string;
  /** Display name, e.g. "May Midterms". */
  readonly name: string;
}

export interface ClassroomEntry {
  readonly id: string;
  /** A daily in-class question, or one asked during an exam period. */
  readonly kind: 'quiz' | 'exam';
  /**
   * In-game month/day, e.g. "5/12". The game's calendar year is deliberately
   * vague, so none is asserted — {@link order} carries the chronology instead.
   */
  readonly date: string;
  /**
   * Chronological index in school-year order (April → the third semester's
   * January, which no numeric month sort recovers). Drives display order.
   */
  readonly order: number;
  /** The exam period, for exam questions; `null` for daily quizzes. */
  readonly exam: ClassroomExamRef | null;
  /** Full question text — the primary search target. */
  readonly question: string;
  /**
   * Correct answer(s), in the order the game asks them. Usually one; some prompts
   * chain several sub-answers.
   */
  readonly answers: readonly string[];
  /** The reference this answer was sourced from, for attribution (§8.3, §13). */
  readonly source: string;
}
