import { describe, it, expect, beforeEach } from "vitest";
import { UserRole } from "~/db/schema";
import type { TestDb } from "~/test/setup";
import type { createLessonViewer } from "../index.server";
import { addComment, addLesson, addModule, addUser, setup } from "./fixtures";

let db: TestDb;
let base: ReturnType<typeof setup>["base"];
let viewer: ReturnType<typeof createLessonViewer>;
let lessonId: number;
let otherLessonId: number;

const T = (minute: number) =>
  `2026-01-01T10:${String(minute).padStart(2, "0")}:00.000Z`;

beforeEach(() => {
  ({ db, base, viewer } = setup());
  const mod = addModule(db, base.course.id, { title: "One", position: 1 });
  lessonId = addLesson(db, mod.id, { title: "L1", position: 1 }).id;
  otherLessonId = addLesson(db, mod.id, { title: "L2", position: 2 }).id;
});

describe("getCommentById", () => {
  it("finds a comment and nothing for an unknown id", () => {
    const comment = addComment(db, {
      lessonId,
      userId: base.user.id,
      body: "Hi",
      createdAt: T(0),
    });

    expect(viewer.getCommentById(comment.id)?.lessonId).toBe(lessonId);
    expect(viewer.getCommentById(9999)).toBeUndefined();
  });
});

describe("getLessonThread", () => {
  it("is empty for a lesson that is not in a course", () => {
    expect(viewer.getLessonThread(9999)).toEqual([]);
  });

  it("lists this lesson's questions oldest first, ties by id", () => {
    addComment(db, {
      lessonId,
      userId: base.user.id,
      body: "Later",
      createdAt: T(5),
    });
    addComment(db, {
      lessonId,
      userId: base.user.id,
      body: "First",
      createdAt: T(1),
    });
    addComment(db, {
      lessonId,
      userId: base.user.id,
      body: "Second",
      createdAt: T(1),
    });
    addComment(db, {
      lessonId: otherLessonId,
      userId: base.user.id,
      body: "Elsewhere",
      createdAt: T(0),
    });

    expect(viewer.getLessonThread(lessonId).map((c) => c.body)).toEqual([
      "First",
      "Second",
      "Later",
    ]);
  });

  it("describes each comment and its author", () => {
    const admin = addUser(db, "Ada", UserRole.Admin);
    addComment(db, {
      lessonId,
      userId: admin.id,
      body: "Hello",
      createdAt: T(1),
      editedAt: T(2),
    });

    expect(viewer.getLessonThread(lessonId)).toEqual([
      {
        id: expect.any(Number),
        body: "Hello",
        createdAt: T(1),
        editedAt: T(2),
        deleted: false,
        author: {
          id: admin.id,
          name: "Ada",
          avatarUrl: null,
          isInstructor: false,
          isPlatformAdmin: true,
        },
        replies: [],
      },
    ]);
  });

  it("marks the owning Instructor", () => {
    addComment(db, {
      lessonId,
      userId: base.instructor.id,
      body: "Answer",
      createdAt: T(1),
    });
    addComment(db, {
      lessonId,
      userId: base.user.id,
      body: "Question",
      createdAt: T(2),
    });

    expect(
      viewer
        .getLessonThread(lessonId)
        .map((c) => [c.author.isInstructor, c.author.isPlatformAdmin])
    ).toEqual([
      [true, false],
      [false, false],
    ]);
  });

  it("nests replies under their question and drops deleted replies", () => {
    const question = addComment(db, {
      lessonId,
      userId: base.user.id,
      body: "Q",
      createdAt: T(1),
    });
    addComment(db, {
      lessonId,
      userId: base.instructor.id,
      body: "A",
      parentId: question.id,
      createdAt: T(2),
    });
    addComment(db, {
      lessonId,
      userId: base.user.id,
      body: "Gone",
      parentId: question.id,
      createdAt: T(3),
      deletedAt: T(4),
    });

    const threads = viewer.getLessonThread(lessonId);
    const [thread] = threads;

    expect(threads).toHaveLength(1);
    expect(thread.body).toBe("Q");
    expect(thread.replies.map((r) => [r.body, r.author.isInstructor])).toEqual([
      ["A", true],
    ]);
  });

  it("drops a reply to a reply, which only one level of nesting allows", () => {
    const question = addComment(db, {
      lessonId,
      userId: base.user.id,
      body: "Q",
      createdAt: T(1),
    });
    const reply = addComment(db, {
      lessonId,
      userId: base.user.id,
      body: "R",
      parentId: question.id,
      createdAt: T(2),
    });
    addComment(db, {
      lessonId,
      userId: base.user.id,
      body: "RR",
      parentId: reply.id,
      createdAt: T(3),
    });

    const threads = viewer.getLessonThread(lessonId);

    expect(threads.map((c) => [c.body, c.replies.map((r) => r.body)])).toEqual([
      ["Q", ["R"]],
    ]);
  });

  it("keeps a deleted question with replies, blanking its body", () => {
    const question = addComment(db, {
      lessonId,
      userId: base.user.id,
      body: "Secret",
      createdAt: T(1),
      editedAt: T(2),
      deletedAt: T(3),
    });
    addComment(db, {
      lessonId,
      userId: base.instructor.id,
      body: "A",
      parentId: question.id,
      createdAt: T(2),
    });

    const [thread] = viewer.getLessonThread(lessonId);

    expect(thread).toMatchObject({ body: "", editedAt: null, deleted: true });
    expect(thread.replies).toHaveLength(1);
  });

  it("drops a deleted question with no replies left", () => {
    const question = addComment(db, {
      lessonId,
      userId: base.user.id,
      body: "Q",
      createdAt: T(1),
      deletedAt: T(3),
    });
    addComment(db, {
      lessonId,
      userId: base.user.id,
      body: "R",
      parentId: question.id,
      createdAt: T(2),
      deletedAt: T(3),
    });

    expect(viewer.getLessonThread(lessonId)).toEqual([]);
  });
});

describe("renderThread", () => {
  it("renders bodies to HTML, through the replies, and blanks deleted ones", async () => {
    const question = addComment(db, {
      lessonId,
      userId: base.user.id,
      body: "**Q**",
      createdAt: T(1),
      deletedAt: T(3),
    });
    addComment(db, {
      lessonId,
      userId: base.instructor.id,
      body: "*A*",
      parentId: question.id,
      createdAt: T(2),
    });

    const [rendered] = await viewer.renderThread(
      viewer.getLessonThread(lessonId)
    );

    expect(rendered.bodyHtml).toBe("");
    expect(rendered.replies[0].bodyHtml).toContain("<em>A</em>");
  });

  it("renders a live question", async () => {
    addComment(db, {
      lessonId,
      userId: base.user.id,
      body: "**Q**",
      createdAt: T(1),
    });

    const [rendered] = await viewer.renderThread(
      viewer.getLessonThread(lessonId)
    );

    expect(rendered.bodyHtml).toContain("<strong>Q</strong>");
  });
});
