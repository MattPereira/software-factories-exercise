import { describe, it, expect, beforeEach } from "vitest";
import type { TestDb } from "~/test/setup";
import type { createLessonViewer } from "../index.server";
import { addLesson, addModule, setup } from "./fixtures";

let db: TestDb;
let base: ReturnType<typeof setup>["base"];
let viewer: ReturnType<typeof createLessonViewer>;

beforeEach(() => {
  ({ db, base, viewer } = setup());
});

describe("getCourseWithDetails", () => {
  it("is null for a course that does not exist", () => {
    expect(viewer.getCourseWithDetails(9999)).toBeNull();
  });

  it("joins the instructor and category", () => {
    expect(viewer.getCourseWithDetails(base.course.id)).toMatchObject({
      id: base.course.id,
      title: "Test Course",
      slug: "test-course",
      instructorName: "Test Instructor",
      categoryName: "Programming",
    });
  });

  it("has no modules for an empty course", () => {
    expect(viewer.getCourseWithDetails(base.course.id)?.modules).toEqual([]);
  });

  it("orders modules and their lessons by position", () => {
    const second = addModule(db, base.course.id, { title: "Two", position: 2 });
    const first = addModule(db, base.course.id, { title: "One", position: 1 });
    addLesson(db, second.id, { title: "2b", position: 2 });
    addLesson(db, first.id, { title: "1a", position: 1 });
    addLesson(db, second.id, { title: "2a", position: 1 });

    const course = viewer.getCourseWithDetails(base.course.id);

    expect(
      course?.modules.map((m) => [m.title, m.lessons.map((l) => l.title)])
    ).toEqual([
      ["One", ["1a"]],
      ["Two", ["2a", "2b"]],
    ]);
  });
});

describe("lookups by id", () => {
  it("finds a lesson, its module and a user", () => {
    const mod = addModule(db, base.course.id, { title: "One", position: 1 });
    const lesson = addLesson(db, mod.id, { title: "Hello", position: 1 });

    expect(viewer.getLessonById(lesson.id)?.title).toBe("Hello");
    expect(viewer.getModuleById(mod.id)?.title).toBe("One");
    expect(viewer.getUserById(base.instructor.id)?.name).toBe(
      "Test Instructor"
    );
  });

  it("finds nothing for unknown ids", () => {
    expect(viewer.getLessonById(9999)).toBeUndefined();
    expect(viewer.getModuleById(9999)).toBeUndefined();
    expect(viewer.getUserById(9999)).toBeUndefined();
  });
});

describe("flattenCourseLessons", () => {
  it("lists every lesson in module order with its module", () => {
    expect(
      viewer.flattenCourseLessons({
        modules: [
          {
            id: 1,
            title: "One",
            lessons: [
              { id: 10, title: "1a", moduleId: 1 },
              { id: 11, title: "1b", moduleId: 1 },
            ],
          },
          { id: 2, title: "Empty", lessons: [] },
          {
            id: 3,
            title: "Three",
            lessons: [{ id: 30, title: "3a", moduleId: 3 }],
          },
        ],
      })
    ).toEqual([
      { id: 10, title: "1a", moduleId: 1, moduleTitle: "One" },
      { id: 11, title: "1b", moduleId: 1, moduleTitle: "One" },
      { id: 30, title: "3a", moduleId: 3, moduleTitle: "Three" },
    ]);
  });
});
