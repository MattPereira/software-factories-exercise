import { describe, it, expect, vi, afterEach } from "vitest";
import { useTestDb } from "~/test/db";
import { seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { RefundStatus, UserRole } from "~/db/schema";
import {
  RefundDecisionError,
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
