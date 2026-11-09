# Hard-delete the Enrollment when a Refund Request is approved

Approving a Refund Request deletes the learner's Enrollment row in the same transaction that marks the request approved, so access ends at approval rather than when the Refund is Issued. We don't soft-delete or keep it for a retention window, because nothing worth recovering lives on the Enrollment: progress, watch history and quiz attempts are keyed by user and lesson, and we deliberately leave them in place. "Recovery" is just a rebuy (or an admin re-enrolling the learner), which creates a fresh Enrollment and resumes the old progress.

## Considered Options

- **Soft delete (`deletedAt`)**: every query on `enrollments` (access, purchase, students list, analytics, ~13 files) would need a filter, and missing one either leaks access or blocks a rebuy with "already enrolled". That cost buys recovery of only `enrolledAt`/`completedAt`.
- **Retain N days, then clean up**: has all the soft-delete costs plus a scheduled job, for no recovery case we could name.

## Consequences

- The kept watch history means a rebuy counts earlier viewing toward the 2-hour refund limit, which stops someone looping buy → watch → refund.
- Refunded learners drop out of the instructor students list and enrollment analytics, including for past date ranges. Refund history lives in `refunds` and `purchases`, not `enrollments`.
- A Failed Refund leaves the learner without access until the payout is retried; the decision stands.
