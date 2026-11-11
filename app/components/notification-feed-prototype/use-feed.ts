// PROTOTYPE — throwaway. Headless Knock feed client, hand-rolled (no Knock SDK).
import { useCallback, useEffect, useState } from "react";

export interface FeedConfig {
  publicKey: string;
  channelId: string;
  userId: string;
  userToken: string;
}

export type NotificationKind =
  | "refund_approved"
  | "refund_declined"
  | "refund_request_opened"
  | "seat_claimed"
  | "enrollment_created"
  | "discussion_question"
  | "discussion_reply";

export interface NotificationData {
  kind: NotificationKind;
  actorName?: string;
  courseTitle: string;
  lessonTitle?: string;
  snippet?: string;
  amount?: string;
  reason?: string;
  decisionNote?: string;
  seatsLeft?: number;
  url: string;
}

export interface FeedEntry {
  id: string;
  inserted_at: string;
  read_at: string | null;
  seen_at: string | null;
  archived_at: string | null;
  data: NotificationData;
}

interface FeedState {
  entries: FeedEntry[];
  unreadCount: number;
  unseenCount: number;
  loaded: boolean;
  error: string | null;
}

const API = "https://api.knock.app/v1";

export function useFeed(config: FeedConfig | null) {
  const [state, setState] = useState<FeedState>({
    entries: [],
    unreadCount: 0,
    unseenCount: 0,
    loaded: false,
    error: null,
  });

  const headers = config
    ? {
        Authorization: `Bearer ${config.publicKey}`,
        "X-Knock-User-Token": config.userToken,
        "Content-Type": "application/json",
      }
    : undefined;

  const refetch = useCallback(async () => {
    if (!config || !headers) return;
    const res = await fetch(
      `${API}/users/${config.userId}/feeds/${config.channelId}?page_size=50&archived=exclude`,
      { headers }
    );
    if (!res.ok) {
      setState((s) => ({ ...s, loaded: true, error: `Knock ${res.status}` }));
      return;
    }
    const json = await res.json();
    setState({
      entries: json.entries,
      unreadCount: json.meta.unread_count,
      unseenCount: json.meta.unseen_count,
      loaded: true,
      error: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.userId, config?.userToken]);

  useEffect(() => {
    setState((s) => ({ ...s, entries: [], loaded: false }));
    refetch();
    // Polling stands in for Knock's realtime socket in the prototype.
    const timer = setInterval(refetch, 10_000);
    window.addEventListener("focus", refetch);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refetch);
    };
  }, [refetch]);

  async function batch(
    status: "seen" | "read" | "unread" | "archived",
    ids: string[]
  ) {
    if (!headers || ids.length === 0) return;
    const now = new Date().toISOString();
    // Optimistic, then reconcile with Knock's counts.
    setState((s) => {
      const entries = s.entries
        .map((e) => {
          if (!ids.includes(e.id)) return e;
          if (status === "seen") return { ...e, seen_at: e.seen_at ?? now };
          if (status === "read")
            return { ...e, read_at: now, seen_at: e.seen_at ?? now };
          if (status === "unread") return { ...e, read_at: null };
          return { ...e, archived_at: now };
        })
        .filter((e) => !e.archived_at);
      return {
        ...s,
        entries,
        unreadCount: entries.filter((e) => !e.read_at).length,
        unseenCount: entries.filter((e) => !e.seen_at).length,
      };
    });
    await fetch(`${API}/messages/batch/${status}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message_ids: ids }),
    });
    refetch();
  }

  return {
    ...state,
    refetch,
    markSeen: (ids: string[]) => batch("seen", ids),
    markRead: (ids: string[]) => batch("read", ids),
    markUnread: (ids: string[]) => batch("unread", ids),
    archive: (ids: string[]) => batch("archived", ids),
    markAllSeen: () =>
      batch(
        "seen",
        state.entries.filter((e) => !e.seen_at).map((e) => e.id)
      ),
    markAllRead: () =>
      batch(
        "read",
        state.entries.filter((e) => !e.read_at).map((e) => e.id)
      ),
  };
}

export type Feed = ReturnType<typeof useFeed>;

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// One sentence per Notification, built from structured data rather than Knock's rendered template.
export function headline(d: NotificationData): {
  actor?: string;
  text: string;
} {
  switch (d.kind) {
    case "refund_approved":
      return { text: `Your Refund Request for ${d.courseTitle} was approved` };
    case "refund_declined":
      return { text: `Your Refund Request for ${d.courseTitle} was declined` };
    case "refund_request_opened":
      return {
        actor: d.actorName,
        text: `requested a ${d.amount} refund for ${d.courseTitle}`,
      };
    case "seat_claimed":
      return {
        actor: d.actorName,
        text: `claimed a Seat in ${d.courseTitle} · ${d.seatsLeft} left`,
      };
    case "enrollment_created":
      return { actor: d.actorName, text: `enrolled in ${d.courseTitle}` };
    case "discussion_question":
      return { actor: d.actorName, text: `asked a question in ${d.lessonTitle}` };
    case "discussion_reply":
      return {
        actor: d.actorName,
        text: `replied to your question in ${d.lessonTitle}`,
      };
  }
}

export const CATEGORY: Record<NotificationKind, string> = {
  refund_approved: "Refunds",
  refund_declined: "Refunds",
  refund_request_opened: "Refunds",
  seat_claimed: "Team",
  enrollment_created: "Enrollments",
  discussion_question: "Discussions",
  discussion_reply: "Discussions",
};

export const CTA: Record<NotificationKind, string> = {
  refund_approved: "View course",
  refund_declined: "View course",
  refund_request_opened: "Review Refund Request",
  seat_claimed: "Manage team",
  enrollment_created: "View students",
  discussion_question: "Answer question",
  discussion_reply: "View reply",
};
