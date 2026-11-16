import {
  QuestionType,
  quizAnswers,
  quizAttempts,
  quizOptions,
  quizQuestions,
  quizzes,
} from "~/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "./course";

export function getQuizById(db: Db, quizId: number) {
  return db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
}

export function getQuizByLessonId(db: Db, lessonId: number) {
  return db.select().from(quizzes).where(eq(quizzes.lessonId, lessonId)).get();
}

function getQuestions(db: Db, quizId: number) {
  return db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position)
    .all();
}

/** Every option of the given questions in one query, grouped by question. */
function getOptionsByQuestion(db: Db, questionIds: number[]) {
  const byQuestion = new Map<number, (typeof quizOptions.$inferSelect)[]>();
  if (questionIds.length === 0) return byQuestion;

  const options = db
    .select()
    .from(quizOptions)
    .where(inArray(quizOptions.questionId, questionIds))
    .orderBy(quizOptions.id)
    .all();
  for (const option of options) {
    const list = byQuestion.get(option.questionId) ?? [];
    list.push(option);
    byQuestion.set(option.questionId, list);
  }
  return byQuestion;
}

export function getQuizWithQuestions(db: Db, quizId: number) {
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
  if (!quiz) return null;

  const questions = getQuestions(db, quizId);
  const optionsByQuestion = getOptionsByQuestion(
    db,
    questions.map((question) => question.id)
  );
  const questionsWithOptions = questions.map((question) => ({
    ...question,
    options: optionsByQuestion.get(question.id) ?? [],
  }));

  return { ...quiz, questions: questionsWithOptions };
}

export function getBestAttempt(db: Db, userId: number, quizId: number) {
  return db
    .select()
    .from(quizAttempts)
    .where(
      and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId))
    )
    .orderBy(desc(quizAttempts.score))
    .limit(1)
    .get();
}

export function calculateGrade(score: number): string {
  if (score >= 0.9) return "A";
  if (score >= 0.8) return "B";
  if (score >= 0.7) return "C";
  if (score >= 0.6) return "D";
  return "F";
}

export type QuestionResult = {
  questionId: number;
  correct: boolean;
  selectedOptionId: number | null;
  correctOptionId: number | null;
};

export type QuizSubmission = {
  userId: number;
  quizId: number;
  /** Option id chosen for each question id. */
  selectedAnswers: Record<number, number>;
};

const SCORED_QUESTION_TYPES: ReadonlySet<QuestionType> = new Set([
  QuestionType.MultipleChoice,
  QuestionType.TrueFalse,
]);

function scoreQuestions(
  db: Db,
  quizId: number,
  selectedAnswers: Record<number, number>
): QuestionResult[] {
  const questions = getQuestions(db, quizId);
  const optionsByQuestion = getOptionsByQuestion(
    db,
    questions.map((question) => question.id)
  );

  return questions.map((question) => {
    const selected = selectedAnswers[question.id];
    if (!selected) {
      return {
        questionId: question.id,
        correct: false,
        selectedOptionId: null,
        correctOptionId: null,
      };
    }

    const correctOptionId = SCORED_QUESTION_TYPES.has(question.questionType)
      ? (optionsByQuestion.get(question.id)?.find((o) => o.isCorrect)?.id ??
        null)
      : null;

    return {
      questionId: question.id,
      correct: selected === correctOptionId,
      selectedOptionId: selected,
      correctOptionId,
    };
  });
}

function recordAttempt(
  db: Db,
  attempt: { userId: number; quizId: number; score: number; passed: boolean },
  questionResults: QuestionResult[]
) {
  return db.transaction((tx) => {
    const recorded = tx.insert(quizAttempts).values(attempt).returning().get();
    for (const result of questionResults) {
      if (result.selectedOptionId !== null) {
        tx.insert(quizAnswers)
          .values({
            attemptId: recorded.id,
            questionId: result.questionId,
            selectedOptionId: result.selectedOptionId,
          })
          .run();
      }
    }
    return recorded;
  });
}

export function computeResult(
  db: Db,
  { userId, quizId, selectedAnswers }: QuizSubmission
) {
  try {
    const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
    if (!quiz) {
      console.error("quiz not found");
      return null;
    }

    const questionResults = scoreQuestions(db, quizId, selectedAnswers);
    const total = questionResults.length;
    const correct = questionResults.filter((result) => result.correct).length;
    const scoreValue = total > 0 ? correct / total : 0;
    const passed = scoreValue > 0.7;

    const attempt = recordAttempt(
      db,
      { userId, quizId, score: scoreValue, passed },
      questionResults
    );

    return {
      attemptId: attempt.id,
      score: scoreValue,
      passed,
      grade: calculateGrade(scoreValue),
      totalCorrect: correct,
      totalQuestions: total,
      questionResults,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}
