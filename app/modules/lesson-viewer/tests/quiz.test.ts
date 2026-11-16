import { describe, it, expect, beforeEach, vi } from "vitest";
import * as schema from "~/db/schema";
import type { TestDb } from "~/test/setup";
import type { createLessonViewer } from "../index.server";
import {
  addLesson,
  addModule,
  addQuiz,
  multipleChoice,
  setup,
  trueFalse,
} from "./fixtures";

let db: TestDb;
let base: ReturnType<typeof setup>["base"];
let viewer: ReturnType<typeof createLessonViewer>;
let lessonId: number;

beforeEach(() => {
  ({ db, base, viewer } = setup());
  const mod = addModule(db, base.course.id, { title: "One", position: 1 });
  lessonId = addLesson(db, mod.id, { title: "L1", position: 1 }).id;
});

type Choices = { options: Array<{ id: number; isCorrect: boolean }> };

function optionWhere(question: Choices, isCorrect: boolean) {
  const option = question.options.find((o) => o.isCorrect === isCorrect);
  if (!option) throw new Error(`No ${isCorrect ? "correct" : "wrong"} option`);
  return option.id;
}
const correctOption = (question: Choices) => optionWhere(question, true);
const wrongOption = (question: Choices) => optionWhere(question, false);

describe("finding a quiz", () => {
  it("finds the lesson's quiz by lesson and by id", () => {
    const { quiz } = addQuiz(db, lessonId, [trueFalse(true)]);

    expect(viewer.getQuizByLessonId(lessonId)?.id).toBe(quiz.id);
    expect(viewer.getQuizById(quiz.id)?.lessonId).toBe(lessonId);
    expect(viewer.getQuizByLessonId(9999)).toBeUndefined();
    expect(viewer.getQuizById(9999)).toBeUndefined();
  });

  it("loads questions in position order with their options", () => {
    const { quiz } = addQuiz(db, lessonId, [
      trueFalse(true),
      multipleChoice(2),
    ]);

    const loaded = viewer.getQuizWithQuestions(quiz.id);

    expect(loaded?.title).toBe("Check yourself");
    expect(
      loaded?.questions.map((q) => [q.position, q.options.length])
    ).toEqual([
      [1, 2],
      [2, 3],
    ]);
  });

  it("is null for an unknown quiz", () => {
    expect(viewer.getQuizWithQuestions(9999)).toBeNull();
  });
});

describe("submitQuiz", () => {
  it("scores, grades and records a perfect attempt", () => {
    const { quiz, questions } = addQuiz(db, lessonId, [
      trueFalse(true),
      multipleChoice(1),
    ]);
    const answers = Object.fromEntries(
      questions.map(({ question, options }) => [
        question.id,
        correctOption({ options }),
      ])
    );

    const result = viewer.submitQuiz({
      userId: base.user.id,
      quizId: quiz.id,
      selectedAnswers: answers,
    });

    expect(result).toMatchObject({
      score: 1,
      passed: true,
      grade: "A",
      totalCorrect: 2,
      totalQuestions: 2,
    });
    expect(result?.questionResults).toEqual(
      questions.map(({ question, options }) => ({
        questionId: question.id,
        correct: true,
        selectedOptionId: correctOption({ options }),
        correctOptionId: correctOption({ options }),
      }))
    );
    expect(viewer.getBestAttempt(base.user.id, quiz.id)).toMatchObject({
      id: result?.attemptId,
      score: 1,
      passed: true,
    });
    expect(db.select().from(schema.quizAnswers).all()).toHaveLength(2);
  });

  it("counts a wrong and an unanswered question as incorrect", () => {
    const { quiz, questions } = addQuiz(db, lessonId, [
      trueFalse(true),
      multipleChoice(0),
      trueFalse(false),
    ]);
    const [right, wrong, skipped] = questions;

    const result = viewer.submitQuiz({
      userId: base.user.id,
      quizId: quiz.id,
      selectedAnswers: {
        [right.question.id]: correctOption(right),
        [wrong.question.id]: wrongOption(wrong),
      },
    });

    expect(result).toMatchObject({
      totalCorrect: 1,
      totalQuestions: 3,
      passed: false,
      grade: "F",
    });
    expect(result?.score).toBeCloseTo(1 / 3);
    expect(result?.questionResults[1]).toEqual({
      questionId: wrong.question.id,
      correct: false,
      selectedOptionId: wrongOption(wrong),
      correctOptionId: correctOption(wrong),
    });
    expect(result?.questionResults[2]).toEqual({
      questionId: skipped.question.id,
      correct: false,
      selectedOptionId: null,
      correctOptionId: null,
    });
    // Only answered questions are recorded.
    expect(db.select().from(schema.quizAnswers).all()).toHaveLength(2);
  });

  it.each([
    { total: 10, right: 9, grade: "A", passed: true },
    { total: 10, right: 8, grade: "B", passed: true },
    { total: 10, right: 7, grade: "C", passed: false },
    { total: 10, right: 6, grade: "D", passed: false },
    { total: 10, right: 5, grade: "F", passed: false },
    { total: 5, right: 4, grade: "B", passed: true },
  ])(
    "grades $right of $total right as $grade",
    ({ total, right, grade, passed }) => {
      const { quiz, questions } = addQuiz(
        db,
        lessonId,
        Array.from({ length: total }, () => trueFalse(true))
      );
      const answers = Object.fromEntries(
        questions.map(({ question, options }, index) => [
          question.id,
          index < right ? correctOption({ options }) : wrongOption({ options }),
        ])
      );

      const result = viewer.submitQuiz({
        userId: base.user.id,
        quizId: quiz.id,
        selectedAnswers: answers,
      });

      expect(result).toMatchObject({ grade, passed, score: right / total });
    }
  );

  it("scores a quiz with no questions as zero", () => {
    const { quiz } = addQuiz(db, lessonId, []);

    expect(
      viewer.submitQuiz({
        userId: base.user.id,
        quizId: quiz.id,
        selectedAnswers: {},
      })
    ).toMatchObject({ score: 0, passed: false, grade: "F", totalQuestions: 0 });
  });

  it("marks a question with no correct option as wrong", () => {
    const { quiz, questions } = addQuiz(db, lessonId, [
      {
        type: schema.QuestionType.MultipleChoice,
        options: [{ text: "A", correct: false }],
      },
      {
        type: schema.QuestionType.TrueFalse,
        options: [{ text: "T", correct: false }],
      },
    ]);

    const result = viewer.submitQuiz({
      userId: base.user.id,
      quizId: quiz.id,
      selectedAnswers: Object.fromEntries(
        questions.map(({ question, options }) => [question.id, options[0].id])
      ),
    });

    expect(
      result?.questionResults.map((r) => [r.correct, r.correctOptionId])
    ).toEqual([
      [false, null],
      [false, null],
    ]);
  });

  it("is null, and logs, for an unknown quiz", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      viewer.submitQuiz({
        userId: base.user.id,
        quizId: 9999,
        selectedAnswers: {},
      })
    ).toBeNull();
    expect(log).toHaveBeenCalledWith("quiz not found");
    log.mockRestore();
  });

  it("is null, and logs, when recording the attempt fails", () => {
    const { quiz } = addQuiz(db, lessonId, [trueFalse(true)]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      viewer.submitQuiz({ userId: 9999, quizId: quiz.id, selectedAnswers: {} })
    ).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.any(Error));
    log.mockRestore();
  });
});

describe("getBestAttempt", () => {
  it("is the highest scoring attempt for this Student", () => {
    const { quiz, questions } = addQuiz(db, lessonId, [
      trueFalse(true),
      trueFalse(true),
    ]);
    const [a, b] = questions;
    const submit = (userId: number, selectedAnswers: Record<number, number>) =>
      viewer.submitQuiz({ userId, quizId: quiz.id, selectedAnswers });

    submit(base.user.id, { [a.question.id]: correctOption(a) });
    submit(base.user.id, {
      [a.question.id]: correctOption(a),
      [b.question.id]: correctOption(b),
    });
    submit(base.user.id, {});
    submit(base.instructor.id, {});

    expect(viewer.getBestAttempt(base.user.id, quiz.id)?.score).toBe(1);
    expect(viewer.getBestAttempt(base.instructor.id, quiz.id)?.score).toBe(0);
    expect(viewer.getBestAttempt(base.user.id, 9999)).toBeUndefined();
  });
});
