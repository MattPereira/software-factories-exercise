import * as schema from "~/db/schema";
import { markdown } from "~/lib/text";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import { createLessonViewer } from "../index.server";

// The lesson viewer only reads courses, modules, lessons, comments and quizzes;
// instructors author them elsewhere, so tests insert them directly.

export function setup() {
  const db = createTestDb();
  const base = seedBaseData(db);
  return { db, base, viewer: createLessonViewer(db) };
}

/** A second course by the same instructor, in the same category. */
export function addCourse(
  db: TestDb,
  base: ReturnType<typeof seedBaseData>,
  slug: string
) {
  return db
    .insert(schema.courses)
    .values({
      title: slug,
      slug,
      description: slug,
      salesCopy: markdown(slug),
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
}

export function addModule(
  db: TestDb,
  courseId: number,
  { title, position }: { title: string; position: number }
) {
  return db
    .insert(schema.modules)
    .values({ courseId, title, position })
    .returning()
    .get();
}

export function addLesson(
  db: TestDb,
  moduleId: number,
  { title, position }: { title: string; position: number }
) {
  return db
    .insert(schema.lessons)
    .values({ moduleId, title, position })
    .returning()
    .get();
}

export function addUser(
  db: TestDb,
  name: string,
  role: schema.UserRole = schema.UserRole.Student
) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

export function addComment(
  db: TestDb,
  values: {
    lessonId: number;
    userId: number;
    body: string;
    parentId?: number;
    createdAt: string;
    editedAt?: string;
    deletedAt?: string;
  }
) {
  return db
    .insert(schema.comments)
    .values({ ...values, body: markdown(values.body) })
    .returning()
    .get();
}

export function watchTo(
  db: TestDb,
  {
    userId,
    lessonId,
    positionSeconds,
    createdAt,
  }: {
    userId: number;
    lessonId: number;
    positionSeconds: number;
    createdAt: string;
  }
) {
  db.insert(schema.videoWatchEvents)
    .values({
      userId,
      lessonId,
      eventType: "progress",
      positionSeconds,
      createdAt,
    })
    .run();
}

type QuestionSpec = {
  type: schema.QuestionType;
  options: Array<{ text: string; correct: boolean }>;
};

/** A quiz whose questions are in the given order; returns option ids too. */
export function addQuiz(
  db: TestDb,
  lessonId: number,
  questions: QuestionSpec[]
) {
  const quiz = db
    .insert(schema.quizzes)
    .values({ lessonId, title: "Check yourself", passingScore: 0.7 })
    .returning()
    .get();

  const added = questions.map((spec, index) => {
    const question = db
      .insert(schema.quizQuestions)
      .values({
        quizId: quiz.id,
        questionText: `Question ${index + 1}`,
        questionType: spec.type,
        position: index + 1,
      })
      .returning()
      .get();
    const options = spec.options.map((option) =>
      db
        .insert(schema.quizOptions)
        .values({
          questionId: question.id,
          optionText: option.text,
          isCorrect: option.correct,
        })
        .returning()
        .get()
    );
    return { question, options };
  });

  return { quiz, questions: added };
}

export function trueFalse(answer: boolean): QuestionSpec {
  return {
    type: schema.QuestionType.TrueFalse,
    options: [
      { text: "True", correct: answer },
      { text: "False", correct: !answer },
    ],
  };
}

export function multipleChoice(correctIndex: number): QuestionSpec {
  return {
    type: schema.QuestionType.MultipleChoice,
    options: ["A", "B", "C"].map((text, index) => ({
      text,
      correct: index === correctIndex,
    })),
  };
}
