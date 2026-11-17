import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { users } from "~/db/schema";
import type {
  Notification,
  Notifications,
  NotificationPerson,
} from "~/lib/notifications.port";

export type {
  Notification,
  Notifications,
  NotificationPerson,
} from "~/lib/notifications.port";

// ─── Notifications port ───
// Cadence's side of sending Notifications (see GLOSSARY.md). Services take a
// `Notifications` as an injected parameter, like `db` and `now`, so tests hand
// in `fakeNotifications()` and never reach Knock.
//
// Adapters:
// - `knockNotifications` (notifications.knock.server.ts): the only code that
//   imports the Knock SDK or knows Knock's workflow, category and channel keys.
// - `fakeNotifications` (notifications.fake.server.ts): records what was sent.
// - `loggingNotifications` (below): logs, used when KNOCK_SECRET_API_KEY is
//   missing. Its feed is empty.

/** The user's row, as the person Notifications know. */
export function toNotificationPerson(
  user: NotificationPerson
): NotificationPerson {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

/** The user as a Notification recipient or actor, or undefined if missing. */
export function findNotificationPerson(
  db: BetterSQLite3Database<typeof schema>,
  userId: number
): NotificationPerson | undefined {
  return db
    .select(NOTIFICATION_PERSON_COLUMNS)
    .from(users)
    .where(eq(users.id, userId))
    .get();
}

/** The `users` columns that make a NotificationPerson, for `select()`. */
export const NOTIFICATION_PERSON_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  avatarUrl: users.avatarUrl,
};

/**
 * Runs Notifications work that must never break what called it. A failure is
 * logged as `[notifications] <failureMessage>: <error message>` and
 * `fallback` is returned instead.
 */
export async function tolerateNotificationFailure<T>(
  failureMessage: string,
  fallback: T,
  run: () => Promise<T>
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(
      `[notifications] ${failureMessage}:`,
      error instanceof Error ? error.message : error
    );
    return fallback;
  }
}

/**
 * Archives the Notifications a comment caused without ever throwing: a
 * failure is logged, so deleting the comment still succeeds.
 */
export async function archiveForCommentSafely(
  notifications: Notifications,
  commentId: number
): Promise<void> {
  await tolerateNotificationFailure(
    `Could not archive Notifications for comment:${commentId}`,
    undefined,
    () => notifications.archiveForComment(commentId)
  );
}

/**
 * Sends a Notification without ever throwing: a failure is logged, so the
 * action that caused it (posting a comment, enrolling, …) still succeeds.
 */
export async function sendSafely(
  notifications: Notifications,
  notification: Notification,
  idempotencyKey: string
): Promise<void> {
  await tolerateNotificationFailure(
    `Could not send ${idempotencyKey}`,
    undefined,
    () => notifications.send(notification, idempotencyKey)
  );
}

// Logging is this fallback's whole job.
/* oxlint-disable no-console */
export function loggingNotifications(): Notifications {
  return {
    async send(notification, idempotencyKey) {
      console.info(
        `[notifications] (no KNOCK_SECRET_API_KEY) ${idempotencyKey} → user ${notification.recipient.id}`,
        notification.data
      );
    },
    async feedCredentials() {
      return null;
    },
    async identifyUser(person) {
      console.info(
        `[notifications] (no KNOCK_SECRET_API_KEY) sync user ${person.id}`
      );
    },
    async getPreferences() {
      return null;
    },
    async mergePreferences(userId, preferences) {
      console.info(
        `[notifications] (no KNOCK_SECRET_API_KEY) preferences for user ${userId}`,
        preferences
      );
    },
    async archiveForComment(commentId) {
      console.info(
        `[notifications] (no KNOCK_SECRET_API_KEY) archive for comment:${commentId}`
      );
    },
  };
}
/* oxlint-enable no-console */

let appNotifications: Notifications | undefined;

/**
 * The adapter the running app uses, resolved on first call (never at import,
 * so tests that inject a fake never load `.env` or reach Knock). Knock when
 * KNOCK_SECRET_API_KEY is set, logging otherwise.
 */
export async function defaultNotifications(): Promise<Notifications> {
  if (!appNotifications) appNotifications = await chooseNotifications();
  return appNotifications;
}

async function chooseNotifications(): Promise<Notifications> {
  // Vite doesn't put non-VITE_ values from .env on process.env.
  if (!process.env.KNOCK_SECRET_API_KEY && existsSync(".env")) {
    process.loadEnvFile(".env");
  }

  const secretKey = process.env.KNOCK_SECRET_API_KEY;
  if (!secretKey) return loggingNotifications();

  return tolerateNotificationFailure(
    "Knock is misconfigured; logging Notifications instead",
    loggingNotifications(),
    async () => {
      const { knockNotifications } = await import(
        "./notifications.knock.server"
      );
      return knockNotifications({
        secretKey,
        publicKey: requireEnv("KNOCK_PUBLIC_API_KEY"),
        signingKey: requireEnv("KNOCK_SIGNING_KEY"),
        feedChannelId: requireEnv("KNOCK_FEED_CHANNEL_ID"),
      });
    }
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set when KNOCK_SECRET_API_KEY is set`);
  }
  return value;
}
