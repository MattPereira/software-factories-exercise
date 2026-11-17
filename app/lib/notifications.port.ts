import type {
  FeedCredentials,
  NotificationData,
  NotificationKind,
} from "~/lib/notification-feed";
import type { NotificationPreferences } from "~/lib/notification-preferences";

// The Notifications port's types, apart from notifications.server.ts so the
// Knock adapter can import them without a cycle back through the module that
// loads it.

/** Someone a Notification is about or for, as Cadence knows them. */
export type NotificationPerson = {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
};

/**
 * Every Notification Cadence sends. `kind` names the Notification; its `data`
 * shape lives in notification-feed.ts, shared with the browser, which uses it
 * to write the row's copy and find its click target (`url`). `actor` is who
 * caused it; leave it out for Notifications Cadence sends itself.
 */
export type Notification = {
  [K in NotificationKind]: {
    kind: K;
    recipient: NotificationPerson;
    actor?: NotificationPerson;
    data: NotificationData<K>;
  };
}[NotificationKind];

export type Notifications = {
  /**
   * Sends one Notification. The idempotency key makes a retry with the same
   * key a no-op, e.g. `discussion-reply:<commentId>`.
   */
  send(notification: Notification, idempotencyKey: string): Promise<void>;

  /**
   * Credentials the browser needs to read `userId`'s Notification Feed live,
   * or null when there is no feed to read.
   */
  feedCredentials(userId: number): Promise<FeedCredentials | null>;

  /** Creates or updates the person's profile: name, email and avatar. */
  identifyUser(person: NotificationPerson): Promise<void>;

  /** The person's stored preference set, or null when they have none. */
  getPreferences(userId: number): Promise<NotificationPreferences | null>;

  /**
   * Changes only the category × channel switches given. Everything else the
   * person's stored set holds, including categories, channels and workflows
   * Cadence doesn't know about, is kept.
   */
  mergePreferences(
    userId: number,
    preferences: NotificationPreferences
  ): Promise<void>;

  /**
   * Archives every Notification whose `data.commentId` is `commentId`, i.e.
   * the ones that comment caused, so they leave their recipients' feeds.
   * Notifications that only mention it (a reply's `questionId`) stay.
   */
  archiveForComment(commentId: number): Promise<void>;
};
