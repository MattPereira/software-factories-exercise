import { and, asc, eq } from "drizzle-orm";
import { db } from "~/db";
import {
  courses,
  purchases,
  refunds,
  users,
  RefundStatus,
  UserRole,
} from "~/db/schema";

export function listOpenRefundRequests() {
  return db
    .select({
      id: refunds.id,
      reason: refunds.reason,
      requestedAt: refunds.requestedAt,
      amountPaid: purchases.amountPaid,
      learnerName: users.name,
      learnerEmail: users.email,
      courseTitle: courses.title,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refunds.status, RefundStatus.Open))
    .orderBy(asc(refunds.requestedAt), asc(refunds.id))
    .all();
}

export type RefundDecisionErrorCode = "not-found" | "not-open" | "not-admin";

export class RefundDecisionError extends Error {
  constructor(
    readonly code: RefundDecisionErrorCode,
    message: string
  ) {
    super(message);
    this.name = "RefundDecisionError";
  }
}

export interface DecisionEmail {
  to: string;
  subject: string;
  body: string;
}

function getRefundRequestWithLearner(refundRequestId: number) {
  return db
    .select({
      refundRequest: refunds,
      learnerName: users.name,
      learnerEmail: users.email,
      courseTitle: courses.title,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refunds.id, refundRequestId))
    .get();
}

function buildDeclinedEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
}): DecisionEmail {
  return {
    to: input.learnerEmail,
    subject: `Refund Request declined — ${input.courseTitle}`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `We have looked at your Refund Request for "${input.courseTitle}" and declined it.`,
      "Nothing changes on your account: you still have access to the course.",
      "",
      "If something changes, you may raise a new Refund Request from the course page.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

// No mail transport is wired up yet, so decision emails go to the server log.
function logEmail(email: DecisionEmail) {
  console.log(`[email] to=${email.to} subject=${email.subject}\n${email.body}`);
}

function assertAdmin(userId: number) {
  const user = db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (user?.role !== UserRole.Admin) {
    throw new RefundDecisionError(
      "not-admin",
      "Only admins can decide Refund Requests."
    );
  }
}

export function declineRefundRequest(input: {
  refundRequestId: number;
  adminUserId: number;
  now?: Date;
}) {
  assertAdmin(input.adminUserId);
  const found = getRefundRequestWithLearner(input.refundRequestId);
  if (!found) {
    throw new RefundDecisionError("not-found", "Refund Request not found.");
  }
  if (found.refundRequest.status !== RefundStatus.Open) {
    throw new RefundDecisionError(
      "not-open",
      "This Refund Request has already been decided."
    );
  }
  const now = input.now ?? new Date();

  const refundRequest = db
    .update(refunds)
    .set({
      status: RefundStatus.Declined,
      resolvedAt: now.toISOString(),
      resolvedByUserId: input.adminUserId,
    })
    // Re-checking Open here stops two admins deciding the same request at once.
    .where(
      and(
        eq(refunds.id, input.refundRequestId),
        eq(refunds.status, RefundStatus.Open)
      )
    )
    .returning()
    .get();

  if (!refundRequest) {
    throw new RefundDecisionError(
      "not-open",
      "This Refund Request has already been decided."
    );
  }

  const email = buildDeclinedEmail(found);
  logEmail(email);

  return { refundRequest, email };
}
