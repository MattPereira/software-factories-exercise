import { and, asc, eq } from "drizzle-orm";
import { db } from "~/db";
import {
  courses,
  enrollments,
  purchases,
  refunds,
  users,
  RefundStatus,
  UserRole,
} from "~/db/schema";
import { formatPrice } from "~/lib/utils";

// Refund Request joined to its purchase, learner and course.
function selectRefundRequests() {
  return db
    .select({
      refundRequest: refunds,
      learnerName: users.name,
      learnerEmail: users.email,
      courseTitle: courses.title,
      learnerId: purchases.userId,
      courseId: purchases.courseId,
      amountPaid: purchases.amountPaid,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id));
}

export function listOpenRefundRequests() {
  return selectRefundRequests()
    .where(eq(refunds.status, RefundStatus.Open))
    .orderBy(asc(refunds.requestedAt), asc(refunds.id))
    .all()
    .map((row) => ({
      id: row.refundRequest.id,
      reason: row.refundRequest.reason,
      requestedAt: row.refundRequest.requestedAt,
      amountPaid: row.amountPaid,
      learnerName: row.learnerName,
      learnerEmail: row.learnerEmail,
      courseTitle: row.courseTitle,
    }));
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

type FoundRefundRequest = NonNullable<
  ReturnType<typeof getRefundRequestWithLearner>
>;

function getRefundRequestWithLearner(refundRequestId: number) {
  return selectRefundRequests().where(eq(refunds.id, refundRequestId)).get();
}

function buildDecisionEmail(
  found: FoundRefundRequest,
  subject: string,
  paragraphs: string[][]
): DecisionEmail {
  return {
    to: found.learnerEmail,
    subject: `${subject} — ${found.courseTitle}`,
    body: [
      `Hi ${found.learnerName},`,
      ...paragraphs.flatMap((lines) => ["", ...lines]),
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

function buildDeclinedEmail(found: FoundRefundRequest) {
  return buildDecisionEmail(found, "Refund Request declined", [
    [
      `We have looked at your Refund Request for "${found.courseTitle}" and declined it.`,
      "Nothing changes on your account: you still have access to the course.",
    ],
    [
      "If something changes, you may raise a new Refund Request from the course page.",
    ],
  ]);
}

function buildApprovedEmail(found: FoundRefundRequest) {
  return buildDecisionEmail(found, "Refund Request approved", [
    [
      `We have approved your Refund Request for "${found.courseTitle}".`,
      `Your Refund is for ${formatPrice(found.amountPaid)}, the full amount you paid.`,
    ],
    [
      "Your Enrollment has ended, so you no longer have access to the course content.",
      "Your progress is kept: if you buy the course again, you will pick up where you left off.",
    ],
  ]);
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

function alreadyDecided() {
  return new RefundDecisionError(
    "not-open",
    "This Refund Request has already been decided."
  );
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Shared guard order (admin -> found -> Open), then a transaction whose update
// re-checks Open so two admins cannot decide the same request at once.
function decideRefundRequest(
  refundRequestId: number,
  adminUserId: number,
  now: Date,
  decision: {
    status: RefundStatus.Approved | RefundStatus.Declined;
    amountRefunded: (found: FoundRefundRequest) => number | null;
    alsoInTransaction?: (tx: Tx, found: FoundRefundRequest) => void;
    buildEmail: (found: FoundRefundRequest) => DecisionEmail;
  }
) {
  assertAdmin(adminUserId);
  const found = getRefundRequestWithLearner(refundRequestId);
  if (!found) {
    throw new RefundDecisionError("not-found", "Refund Request not found.");
  }
  if (found.refundRequest.status !== RefundStatus.Open) {
    throw alreadyDecided();
  }

  const refundRequest = db.transaction((tx) => {
    const updated = tx
      .update(refunds)
      .set({
        status: decision.status,
        resolvedAt: now.toISOString(),
        resolvedByUserId: adminUserId,
        amountRefunded: decision.amountRefunded(found),
      })
      .where(
        and(eq(refunds.id, refundRequestId), eq(refunds.status, RefundStatus.Open))
      )
      .returning()
      .get();

    if (updated) decision.alsoInTransaction?.(tx, found);
    return updated;
  });

  if (!refundRequest) throw alreadyDecided();

  const email = decision.buildEmail(found);
  logEmail(email);

  return { refundRequest, email };
}

export function declineRefundRequest(
  refundRequestId: number,
  adminUserId: number,
  now = new Date()
) {
  return decideRefundRequest(refundRequestId, adminUserId, now, {
    status: RefundStatus.Declined,
    amountRefunded: () => null,
    buildEmail: buildDeclinedEmail,
  });
}

export function approveRefundRequest(
  refundRequestId: number,
  adminUserId: number,
  now = new Date()
) {
  return decideRefundRequest(refundRequestId, adminUserId, now, {
    status: RefundStatus.Approved,
    amountRefunded: (found) => found.amountPaid,
    // Same transaction as the status update so access never ends without the
    // Refund being recorded, or the other way round. Hard delete (ADR 0001):
    // progress, watch events and quiz attempts are keyed by user, not
    // Enrollment, so they survive for a later re-purchase.
    alsoInTransaction: (tx, found) => {
      tx.delete(enrollments)
        .where(
          and(
            eq(enrollments.userId, found.learnerId),
            eq(enrollments.courseId, found.courseId)
          )
        )
        .run();
    },
    buildEmail: buildApprovedEmail,
  });
}
