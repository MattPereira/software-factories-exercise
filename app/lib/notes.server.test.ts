import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { getNote, listNotes, saveNote } from "./notes.server";
import { approveRefundRequest, raiseRefundRequest } from "./refunds.server";
import { fakeNotifications } from "./notifications.fake.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function minutesLater(minutes: number) {
  return new Date(NOW.getTime() + minutes * 60_000);
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

describe("saving a Note", () => {
  it("creates a Note with the body trimmed", () => {
    expect(saveNote(db, base.user.id, lessonIds[0], "  # not a heading *  ", NOW)).toEqual({
      ok: true,
      note: { body: "# not a heading *", updatedAt: NOW.toISOString() },
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "# not a heading *",
      updatedAt: NOW.toISOString(),
    });
  });

  it("replaces the body and moves the last-edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "First thoughts", NOW);
    saveNote(db, base.user.id, lessonIds[0], "Second thoughts", minutesLater(5));

    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Second thoughts",
      updatedAt: minutesLater(5).toISOString(),
    });
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });

  it("accepts a Note of exactly 2,000 characters", () => {
    expect(saveNote(db, base.user.id, lessonIds[0], "a".repeat(2000), NOW).ok).toBe(true);
  });

  it("refuses a Note over 2,000 characters", () => {
    expect(saveNote(db, base.user.id, lessonIds[0], "a".repeat(2001), NOW)).toEqual({
      ok: false,
      error: "A note must be 2000 characters or fewer.",
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });

  it("refuses an empty Note and keeps the existing one", () => {
    saveNote(db, base.user.id, lessonIds[0], "Something", NOW);

    expect(saveNote(db, base.user.id, lessonIds[0], "   ", minutesLater(1))).toEqual({
      ok: false,
      error: "Write something before saving your note.",
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Something",
      updatedAt: NOW.toISOString(),
    });
  });

  it("never leaves two Notes on the same Lesson", () => {
    saveNote(db, base.user.id, lessonIds[0], "Mine", NOW);

    expect(() =>
      db
        .insert(schema.notes)
        .values({ userId: base.user.id, lessonId: lessonIds[0], body: "Dupe" })
        .run()
    ).toThrow();
  });
});

describe("listing Notes", () => {
  it("lists only the Student's own Notes, last edited first, with Lesson and Course", () => {
    const other = db
      .insert(schema.users)
      .values({ name: "Other", email: "other@example.com", role: UserRole.Student })
      .returning()
      .get();
    saveNote(db, base.user.id, lessonIds[0], "Older", NOW);
    saveNote(db, base.user.id, lessonIds[1], "Newer", minutesLater(5));
    saveNote(db, other.id, lessonIds[2], "Not mine", minutesLater(10));
    saveNote(db, base.user.id, lessonIds[0], "Older, edited", minutesLater(15));

    expect(listNotes(db, base.user.id)).toMatchObject([
      { lessonId: lessonIds[0], body: "Older, edited", lessonTitle: "Lesson 1", courseTitle: "Test Course", courseSlug: "test-course" },
      { lessonId: lessonIds[1], body: "Newer", lessonTitle: "Lesson 2", courseTitle: "Test Course", courseSlug: "test-course" },
    ]);
  });
});

describe("approving a Refund", () => {
  it("keeps the Student's Notes", async () => {
    const admin = db
      .insert(schema.users)
      .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
      .returning()
      .get();
    const purchase = db
      .insert(schema.purchases)
      .values({ userId: base.user.id, courseId: base.course.id, amountPaid: 7900, createdAt: NOW.toISOString() })
      .returning()
      .get();
    db.insert(schema.enrollments).values({ userId: base.user.id, courseId: base.course.id }).run();
    saveNote(db, base.user.id, lessonIds[0], "Keep me", NOW);

    const notifications = fakeNotifications();
    const raised = await raiseRefundRequest(db, purchase.id, base.user.id, "Not for me.", NOW, notifications);
    if (!raised.ok) throw new Error(raised.error);
    const approved = await approveRefundRequest(db, raised.refundRequestId, admin.id, null, NOW, notifications);

    expect(approved.ok).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("Keep me");
  });
});
