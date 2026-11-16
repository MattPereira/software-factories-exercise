import { db } from "~/db";
import {
  flattenCourseLessons,
  getCourseWithDetails,
  getLessonById,
  getModuleById,
  getUserById,
  type Db,
} from "./lib/course";
import {
  calculateWatchProgress,
  getLastWatchPosition,
  getLessonProgress,
  getLessonProgressForCourse,
  markLessonComplete,
  markLessonInProgress,
} from "./lib/progress";
import { getCommentById, getLessonThread, renderThread } from "./lib/thread";
import {
  computeResult,
  getBestAttempt,
  getQuizById,
  getQuizByLessonId,
  getQuizWithQuestions,
  type QuizSubmission,
} from "./lib/quiz";

export type { FlatLesson } from "./lib/course";
export type { RenderedComment, ThreadComment } from "./lib/thread";
export type { QuestionResult, QuizSubmission } from "./lib/quiz";

/**
 * What the Lesson page reads and writes, bound to a database. The app uses
 * `lessonViewer`; tests build their own against a test database.
 */
export function createLessonViewer(database: Db) {
  return {
    /** The course with its instructor, category, modules and lessons. */
    getCourseWithDetails: (courseId: number) =>
      getCourseWithDetails(database, courseId),
    getLessonById: (lessonId: number) => getLessonById(database, lessonId),
    getModuleById: (moduleId: number) => getModuleById(database, moduleId),
    getUserById: (userId: number) => getUserById(database, userId),
    /** Every lesson in the course, in module then lesson order. */
    flattenCourseLessons,

    getLessonProgress: (userId: number, lessonId: number) =>
      getLessonProgress(database, userId, lessonId),
    getLessonProgressForCourse: (userId: number, courseId: number) =>
      getLessonProgressForCourse(database, userId, courseId),
    markLessonComplete: (userId: number, lessonId: number, now: Date) =>
      markLessonComplete(database, { userId, lessonId, now }),
    /** Records a view; never moves a completed lesson back to in progress. */
    markLessonInProgress: (userId: number, lessonId: number) =>
      markLessonInProgress(database, userId, lessonId),
    getLastWatchPosition: (userId: number, lessonId: number) =>
      getLastWatchPosition(database, userId, lessonId),
    /** Furthest watched position as a whole percentage, capped at 100. */
    calculateWatchProgress: (
      userId: number,
      lessonId: number,
      videoDurationSeconds: number
    ) =>
      calculateWatchProgress(database, {
        userId,
        lessonId,
        videoDurationSeconds,
      }),

    getCommentById: (commentId: number) => getCommentById(database, commentId),
    /** The lesson's Discussion, with replies nested under their question. */
    getLessonThread: (lessonId: number) => getLessonThread(database, lessonId),
    renderThread,

    getQuizById: (quizId: number) => getQuizById(database, quizId),
    getQuizByLessonId: (lessonId: number) =>
      getQuizByLessonId(database, lessonId),
    getQuizWithQuestions: (quizId: number) =>
      getQuizWithQuestions(database, quizId),
    getBestAttempt: (userId: number, quizId: number) =>
      getBestAttempt(database, userId, quizId),
    /** Scores a submission and records the attempt; null if it fails. */
    submitQuiz: (submission: QuizSubmission) =>
      computeResult(database, submission),
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const lessonViewer = /* @__PURE__ */ createLessonViewer(db);
