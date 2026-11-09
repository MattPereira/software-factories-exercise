import { describe, it, expect, vi, afterEach } from "vitest";
import { useTestDb } from "~/test/db";
import { seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { RefundStatus, UserRole } from "~/db/schema";
import {
  RefundDecisionError,
  approveRefundRequest,
  declineRefundRequest,
  listOpenRefundRequests,
} from "./refund-decisions.server";

const getDb = useTestDb();

afterEach(() => {
  vi.restoreAllMocks();
});

function expectDecisionError(run: () => unknown, code: string) {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(RefundDecisionError);
  expect((thrown as RefundDecisionError).code).toBe(code);
}

function seedAdmin() {
  return getDb()
    .insert(schema.users)
    .values({ name: "Ada Admin", email: "ada@example.com", role: UserRole.Admin })
    .returning()
    .get();
}

function seedEnrollment(userId: number, courseId: number) {
  return getDb()
    .insert(schema.enrollments)
    .values({ userId, courseId })
    .returning()
    .get();
}

function seedPurchase(userId: number, courseId: number, amountPaid = 7900) {
  return getDb()
    .insert(schema.purchases)
    .values({ userId, courseId, amountPaid })
    .returning()
    .get();
}

function seedRefundRequest(
  purchaseId: number,
  overrides: Partial<typeof schema.refunds.$inferInsert> = {}
) {
  return getDb()
    .insert(schema.refunds)
    .values({
      purchaseId,
      reason: "Not what I expected from the course.",
      ...overrides,
    })
    .returning()
    .get();
}

describe("listOpenRefundRequests", () => {
  it("lists Open Refund Requests oldest first with learner, course and amount", () => {
    const { user, course } = seedBaseData(getDb());
    const purchase = seedPurchase(user.id, course.id, 7900);
    seedRefundRequest(purchase.id, {
      reason: "Newer request",
      requestedAt: "2026-11-05T10:00:00.000Z",
    });
    seedRefundRequest(purchase.id, {
      reason: "Older request",
      requestedAt: "2026-11-01T10:00:00.000Z",
    });
    seedRefundRequest(purchase.id, {
      reason: "Already declined",
      status: RefundStatus.Declined,
      requestedAt: "2026-10-01T10:00:00.000Z",
    });

    const rows = listOpenRefundRequests();

    expect(rows.map((r) => r.reason)).toEqual([
      "Older request",
      "Newer request",
    ]);
    expect(rows[0]).toMatchObject({
      learnerName: "Test User",
      learnerEmail: "test@example.com",
      courseTitle: "Test Course",
      amountPaid: 7900,
      requestedAt: "2026-11-01T10:00:00.000Z",
    });
  });

  it("returns nothing when there are no Open Refund Requests", () => {
    seedBaseData(getDb());
    expect(listOpenRefundRequests()).toEqual([]);
  });
});

describe("declineRefundRequest", () => {
  function seedOpenRequest() {
    const base = seedBaseData(getDb());
    const admin = seedAdmin();
    const purchase = seedPurchase(base.user.id, base.course.id, 7900);
    const enrollment = seedEnrollment(base.user.id, base.course.id);
    const request = seedRefundRequest(purchase.id);
    return { ...base, admin, purchase, enrollment, request };
  }

  it("makes it a Declined Refund Request resolved by the admin, with no amount refunded", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { admin, request } = seedOpenRequest();
    const now = new Date("2026-11-09T12:00:00.000Z");

    const { refundRequest } = declineRefundRequest({
      refundRequestId: request.id,
      adminUserId: admin.id,
      now,
    });

    expect(refundRequest).toMatchObject({
      id: request.id,
      status: RefundStatus.Declined,
      resolvedAt: "2026-11-09T12:00:00.000Z",
      resolvedByUserId: admin.id,
      amountRefunded: null,
    });
    expect(listOpenRefundRequests()).toEqual([]);
  });

  it("leaves the learner's Enrollment in place", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { admin, request, enrollment, user } = seedOpenRequest();

    declineRefundRequest({ refundRequestId: request.id, adminUserId: admin.id });

    const remaining = getDb().select().from(schema.enrollments).all();
    expect(remaining).toEqual([enrollment]);
    expect(remaining[0].userId).toBe(user.id);
  });

  it("logs a declined email telling the learner access is unchanged and they may ask again", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { admin, request } = seedOpenRequest();

    const { email } = declineRefundRequest({
      refundRequestId: request.id,
      adminUserId: admin.id,
    });

    expect(email.to).toBe("test@example.com");
    expect(email.subject).toBe("Refund Request declined — Test Course");
    expect(email.body).toContain("declined");
    expect(email.body).toContain("still have access");
    expect(email.body).toContain("new Refund Request");
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("[email] to=test@example.com")
    );
  });

  it("fails clearly when the Refund Request does not exist", () => {
    const admin = seedAdmin();

    expectDecisionError(
      () => declineRefundRequest({ refundRequestId: 999, adminUserId: admin.id }),
      "not-found"
    );
  });

  it("fails clearly when the Refund Request is no longer Open", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { admin, request } = seedOpenRequest();
    declineRefundRequest({ refundRequestId: request.id, adminUserId: admin.id });

    expectDecisionError(
      () =>
        declineRefundRequest({ refundRequestId: request.id, adminUserId: admin.id }),
      "not-open"
    );
  });

  it("refuses a non-admin and leaves the request Open", () => {
    const { user, instructor, request } = seedOpenRequest();

    for (const nonAdmin of [user, instructor]) {
      expectDecisionError(
        () =>
          declineRefundRequest({
            refundRequestId: request.id,
            adminUserId: nonAdmin.id,
          }),
        "not-admin"
      );
    }
    expectDecisionError(
      () => declineRefundRequest({ refundRequestId: request.id, adminUserId: 999 }),
      "not-admin"
    );
    expect(listOpenRefundRequests().map((r) => r.id)).toEqual([request.id]);
  });
});

describe("approveRefundRequest", () => {
  function seedOpenRequest() {
    const base = seedBaseData(getDb());
    const admin = seedAdmin();
    const purchase = seedPurchase(base.user.id, base.course.id, 7900);
    const enrollment = seedEnrollment(base.user.id, base.course.id);
    const request = seedRefundRequest(purchase.id);
    return { ...base, admin, purchase, enrollment, request };
  }

  it("makes it an Approved Refund Request resolved by the admin, refunding the full amount paid", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { admin, request } = seedOpenRequest();
    const now = new Date("2026-11-09T12:00:00.000Z");

    const { refundRequest } = approveRefundRequest({
      refundRequestId: request.id,
      adminUserId: admin.id,
      now,
    });

    expect(refundRequest).toMatchObject({
      id: request.id,
      status: RefundStatus.Approved,
      resolvedAt: "2026-11-09T12:00:00.000Z",
      resolvedByUserId: admin.id,
      amountRefunded: 7900,
    });
    expect(listOpenRefundRequests()).toEqual([]);
  });

  it("ends the learner's Enrollment in the refunded course so they lose access", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { admin, request } = seedOpenRequest();

    approveRefundRequest({ refundRequestId: request.id, adminUserId: admin.id });

    expect(getDb().select().from(schema.enrollments).all()).toEqual([]);
  });

  it("leaves the learner's other Enrollments and other learners' Enrollments alone", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { admin, request, user, instructor, category, course } =
      seedOpenRequest();
    const otherCourse = getDb()
      .insert(schema.courses)
      .values({
        title: "Other Course",
        slug: "other-course",
        description: "Another course",
        salesCopy: "Another course",
        instructorId: instructor.id,
        categoryId: category.id,
        status: schema.CourseStatus.Published,
      })
      .returning()
      .get();
    const otherCourseEnrollment = seedEnrollment(user.id, otherCourse.id);
    const otherLearner = getDb()
      .insert(schema.users)
      .values({ name: "Bo", email: "bo@example.com", role: UserRole.Student })
      .returning()
      .get();
    const otherLearnerEnrollment = seedEnrollment(otherLearner.id, course.id);

    approveRefundRequest({ refundRequestId: request.id, adminUserId: admin.id });

    expect(getDb().select().from(schema.enrollments).all()).toEqual([
      otherCourseEnrollment,
      otherLearnerEnrollment,
    ]);
  });

  function seedLearnerProgress(userId: number, courseId: number) {
    const db = getDb();
    const mod = db
      .insert(schema.modules)
      .values({ courseId, title: "Module 1", position: 1 })
      .returning()
      .get();
    const lesson = db
      .insert(schema.lessons)
      .values({ moduleId: mod.id, title: "Lesson 1", position: 1 })
      .returning()
      .get();
    const quiz = db
      .insert(schema.quizzes)
      .values({ lessonId: lesson.id, title: "Quiz 1", passingScore: 0.5 })
      .returning()
      .get();
    const question = db
      .insert(schema.quizQuestions)
      .values({
        quizId: quiz.id,
        questionText: "Is this kept?",
        questionType: schema.QuestionType.TrueFalse,
        position: 1,
      })
      .returning()
      .get();
    const option = db
      .insert(schema.quizOptions)
      .values({ questionId: question.id, optionText: "Yes", isCorrect: true })
      .returning()
      .get();
    db.insert(schema.lessonProgress)
      .values({
        userId,
        lessonId: lesson.id,
        status: schema.LessonProgressStatus.Completed,
        completedAt: "2026-11-02T10:00:00.000Z",
      })
      .run();
    db.insert(schema.videoWatchEvents)
      .values({
        userId,
        lessonId: lesson.id,
        eventType: "pause",
        positionSeconds: 3600,
      })
      .run();
    const attempt = db
      .insert(schema.quizAttempts)
      .values({ userId, quizId: quiz.id, score: 1, passed: true })
      .returning()
      .get();
    db.insert(schema.quizAnswers)
      .values({
        attemptId: attempt.id,
        questionId: question.id,
        selectedOptionId: option.id,
      })
      .run();
  }

  function snapshotProgress() {
    const db = getDb();
    return {
      lessonProgress: db.select().from(schema.lessonProgress).all(),
      videoWatchEvents: db.select().from(schema.videoWatchEvents).all(),
      quizAttempts: db.select().from(schema.quizAttempts).all(),
      quizAnswers: db.select().from(schema.quizAnswers).all(),
    };
  }

  it("keeps lesson progress, video watch events, quiz attempts and quiz answers", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { admin, request, user, course } = seedOpenRequest();
    seedLearnerProgress(user.id, course.id);
    const before = snapshotProgress();
    expect(before.lessonProgress).toHaveLength(1);
    expect(before.videoWatchEvents).toHaveLength(1);
    expect(before.quizAttempts).toHaveLength(1);
    expect(before.quizAnswers).toHaveLength(1);

    approveRefundRequest({ refundRequestId: request.id, adminUserId: admin.id });

    expect(snapshotProgress()).toEqual(before);
  });

  it("lets the learner enroll again afterwards and pick up their earlier progress", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { admin, request, user, course } = seedOpenRequest();
    seedLearnerProgress(user.id, course.id);
    const before = snapshotProgress();

    approveRefundRequest({ refundRequestId: request.id, adminUserId: admin.id });
    seedPurchase(user.id, course.id, 7900);
    const fresh = seedEnrollment(user.id, course.id);

    expect(getDb().select().from(schema.enrollments).all()).toEqual([fresh]);
    expect(snapshotProgress()).toEqual(before);
  });

  it("logs an approved email with the Refund amount, that access has ended, and that progress is kept", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { admin, request } = seedOpenRequest();

    const { email } = approveRefundRequest({
      refundRequestId: request.id,
      adminUserId: admin.id,
    });

    expect(email.to).toBe("test@example.com");
    expect(email.subject).toBe("Refund Request approved — Test Course");
    expect(email.body).toContain("$79.00");
    expect(email.body).toContain("no longer have access");
    expect(email.body).toContain("progress is kept");
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("[email] to=test@example.com")
    );
  });

  it("fails clearly when the Refund Request does not exist", () => {
    const admin = seedAdmin();

    expectDecisionError(
      () => approveRefundRequest({ refundRequestId: 999, adminUserId: admin.id }),
      "not-found"
    );
  });

  it("fails clearly when the Refund Request is already Approved or Declined", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { admin, request, purchase } = seedOpenRequest();
    approveRefundRequest({ refundRequestId: request.id, adminUserId: admin.id });
    const declined = seedRefundRequest(purchase.id, {
      status: RefundStatus.Declined,
    });

    for (const decided of [request, declined]) {
      expectDecisionError(
        () =>
          approveRefundRequest({
            refundRequestId: decided.id,
            adminUserId: admin.id,
          }),
        "not-open"
      );
    }
  });

  it("refuses a non-admin, leaving the request Open and the Enrollment in place", () => {
    const { user, instructor, request, enrollment } = seedOpenRequest();

    for (const nonAdminId of [user.id, instructor.id, 999]) {
      expectDecisionError(
        () =>
          approveRefundRequest({
            refundRequestId: request.id,
            adminUserId: nonAdminId,
          }),
        "not-admin"
      );
    }
    expect(listOpenRefundRequests().map((r) => r.id)).toEqual([request.id]);
    expect(getDb().select().from(schema.enrollments).all()).toEqual([
      enrollment,
    ]);
  });
});
