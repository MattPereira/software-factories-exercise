import { describe, it, expect, beforeEach } from "vitest";
import { LessonProgressStatus } from "~/db/schema";
import type { TestDb } from "~/test/setup";
import type { createLessonViewer } from "../index.server";
import { addCourse, addLesson, addModule, setup, watchTo } from "./fixtures";

let db: TestDb;
let base: ReturnType<typeof setup>["base"];
let viewer: ReturnType<typeof createLessonViewer>;
let studentId: number;
let lessonIds: number[];
const now = new Date("2026-03-01T09:30:00.000Z");

beforeEach(() => {
  ({ db, base, viewer } = setup());
  studentId = base.user.id;
  const mod = addModule(db, base.course.id, { title: "One", position: 1 });
  lessonIds = [1, 2].map(
    (position) => addLesson(db, mod.id, { title: `L${position}`, position }).id
  );
});

describe("lesson progress", () => {
  it("has none before the Student opens the lesson", () => {
    expect(viewer.getLessonProgress(studentId, lessonIds[0])).toBeUndefined();
  });

  it("marks an opened lesson in progress", () => {
    viewer.markLessonInProgress(studentId, lessonIds[0]);

    expect(viewer.getLessonProgress(studentId, lessonIds[0])).toMatchObject({
      status: LessonProgressStatus.InProgress,
      completedAt: null,
    });
  });

  it("completes a lesson nobody opened", () => {
    viewer.markLessonComplete(studentId, lessonIds[0], now);

    const progress = viewer.getLessonProgress(studentId, lessonIds[0]);
    expect(progress?.status).toBe(LessonProgressStatus.Completed);
    expect(progress?.completedAt).toBe(now.toISOString());
  });

  it("completes a lesson in progress without adding a second record", () => {
    const opened = viewer.markLessonInProgress(studentId, lessonIds[0]);
    const completed = viewer.markLessonComplete(studentId, lessonIds[0], now);

    expect(completed.id).toBe(opened.id);
    expect(completed.status).toBe(LessonProgressStatus.Completed);
    expect(completed.completedAt).toBe(now.toISOString());
  });

  it("does not move a completed lesson back to in progress", () => {
    viewer.markLessonComplete(studentId, lessonIds[0], now);
    const reopened = viewer.markLessonInProgress(studentId, lessonIds[0]);

    expect(reopened.status).toBe(LessonProgressStatus.Completed);
  });

  it("keeps an in-progress lesson in progress when reopened", () => {
    const first = viewer.markLessonInProgress(studentId, lessonIds[0]);
    const again = viewer.markLessonInProgress(studentId, lessonIds[0]);

    expect(again.id).toBe(first.id);
    expect(again.status).toBe(LessonProgressStatus.InProgress);
  });

  it("is per Student", () => {
    viewer.markLessonComplete(base.instructor.id, lessonIds[0], now);

    expect(viewer.getLessonProgress(studentId, lessonIds[0])).toBeUndefined();
  });
});

describe("getLessonProgressForCourse", () => {
  it("lists this Student's progress on lessons in the course", () => {
    viewer.markLessonComplete(studentId, lessonIds[0], now);
    viewer.markLessonInProgress(studentId, lessonIds[1]);
    viewer.markLessonComplete(base.instructor.id, lessonIds[1], now);

    const records = viewer.getLessonProgressForCourse(
      studentId,
      base.course.id
    );

    expect(
      records.map((r) => [r.lessonId, r.status]).sort((a, b) => +a[0] - +b[0])
    ).toEqual([
      [lessonIds[0], LessonProgressStatus.Completed],
      [lessonIds[1], LessonProgressStatus.InProgress],
    ]);
  });

  it("ignores progress in another course", () => {
    const other = addCourse(db, base, "other-course");
    const otherModule = addModule(db, other.id, { title: "X", position: 1 });
    const otherLesson = addLesson(db, otherModule.id, {
      title: "X1",
      position: 1,
    });
    viewer.markLessonComplete(studentId, lessonIds[0], now);
    viewer.markLessonComplete(studentId, otherLesson.id, now);

    expect(
      viewer
        .getLessonProgressForCourse(studentId, other.id)
        .map((r) => r.lessonId)
    ).toEqual([otherLesson.id]);
  });

  it("is empty for a course with no modules", () => {
    viewer.markLessonComplete(studentId, lessonIds[0], now);

    expect(viewer.getLessonProgressForCourse(studentId, 9999)).toEqual([]);
  });

  it("is empty for a course with a module but no lessons", () => {
    const empty = addCourse(db, base, "empty-course");
    addModule(db, empty.id, { title: "Empty", position: 1 });
    viewer.markLessonComplete(studentId, lessonIds[0], now);

    expect(viewer.getLessonProgressForCourse(studentId, empty.id)).toEqual([]);
  });
});

describe("video watching", () => {
  it("resumes at zero with no watch events", () => {
    expect(viewer.getLastWatchPosition(studentId, lessonIds[0])).toBe(0);
    expect(viewer.calculateWatchProgress(studentId, lessonIds[0], 600)).toBe(0);
  });

  it("resumes at the most recent position, not the furthest", () => {
    watchTo(db, {
      userId: studentId,
      lessonId: lessonIds[0],
      positionSeconds: 300,
      createdAt: "2026-01-01T10:00:00.000Z",
    });
    watchTo(db, {
      userId: studentId,
      lessonId: lessonIds[0],
      positionSeconds: 120,
      createdAt: "2026-01-01T10:05:00.000Z",
    });
    watchTo(db, {
      userId: base.instructor.id,
      lessonId: lessonIds[0],
      positionSeconds: 50,
      createdAt: "2026-01-01T10:09:00.000Z",
    });

    expect(viewer.getLastWatchPosition(studentId, lessonIds[0])).toBe(120);
  });

  it("measures progress from the furthest position, rounded", () => {
    watchTo(db, {
      userId: studentId,
      lessonId: lessonIds[0],
      positionSeconds: 200,
      createdAt: "2026-01-01T10:00:00.000Z",
    });
    watchTo(db, {
      userId: studentId,
      lessonId: lessonIds[0],
      positionSeconds: 100,
      createdAt: "2026-01-01T10:05:00.000Z",
    });
    watchTo(db, {
      userId: studentId,
      lessonId: lessonIds[1],
      positionSeconds: 600,
      createdAt: "2026-01-01T10:05:00.000Z",
    });

    expect(viewer.calculateWatchProgress(studentId, lessonIds[0], 600)).toBe(
      33
    );
  });

  it("caps progress at 100", () => {
    watchTo(db, {
      userId: studentId,
      lessonId: lessonIds[0],
      positionSeconds: 700,
      createdAt: "2026-01-01T10:00:00.000Z",
    });

    expect(viewer.calculateWatchProgress(studentId, lessonIds[0], 600)).toBe(
      100
    );
  });

  it("is zero for a video with no duration", () => {
    watchTo(db, {
      userId: studentId,
      lessonId: lessonIds[0],
      positionSeconds: 30,
      createdAt: "2026-01-01T10:00:00.000Z",
    });

    expect(viewer.calculateWatchProgress(studentId, lessonIds[0], 0)).toBe(0);
  });
});
