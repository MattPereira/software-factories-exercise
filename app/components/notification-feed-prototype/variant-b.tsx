// PROTOTYPE — throwaway. Variant B: "Notifications" nav item, right-hand drawer.
// No separate "seen": badge = unread. Unread/All tabs, day groups, hover actions (read toggle, archive).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Archive, Bell, Check, Mail, X } from "lucide-react";
import { cn } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";
import { headline, timeAgo, type Feed, type FeedEntry } from "./use-feed";
import { KindIcon } from "./kind-icon";

export const name = "Nav item + drawer";

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function VariantB({ feed }: { feed: Feed }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const shown = feed.entries.filter((e) => tab === "all" || !e.read_at);
  const groups = new Map<string, FeedEntry[]>();
  for (const e of shown) {
    const k = dayLabel(e.inserted_at);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        Notifications
        {feed.unreadCount > 0 && (
          <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
            {feed.unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setOpen(false)}>
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-[26rem] flex-col bg-background shadow-2xl"
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-base font-semibold">Notifications</h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={feed.markAllRead}
                  className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  Mark all read
                </button>
                <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-muted">
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="flex gap-4 border-b px-5 text-sm">
              {(["unread", "all"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "-mb-px border-b-2 py-2 capitalize",
                    tab === t ? "border-primary font-semibold" : "border-transparent text-muted-foreground"
                  )}
                >
                  {t}
                  {t === "unread" && feed.unreadCount > 0 && ` (${feed.unreadCount})`}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {shown.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
                  <Check className="size-6" />
                  {feed.loaded ? "Nothing unread" : "Loading…"}
                </div>
              )}
              {[...groups].map(([day, entries]) => (
                <section key={day}>
                  <div className="sticky top-0 bg-muted/80 px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {day}
                  </div>
                  {entries.map((e) => {
                    const h = headline(e.data);
                    return (
                      <div
                        key={e.id}
                        onClick={() => {
                          feed.markRead([e.id]);
                          setOpen(false);
                          navigate(e.data.url);
                        }}
                        className="group relative flex cursor-pointer gap-3 border-b px-5 py-4 hover:bg-muted/50"
                      >
                        {!e.read_at && <span className="absolute left-0 top-0 h-full w-1 bg-primary" />}
                        {e.data.actorName ? (
                          <div className="relative">
                            <UserAvatar name={e.data.actorName} avatarUrl={null} className="size-10" />
                            <KindIcon kind={e.data.kind} className="absolute -bottom-1 -right-1 size-5 ring-2 ring-background [&_svg]:size-3" />
                          </div>
                        ) : (
                          <KindIcon kind={e.data.kind} className="size-10" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className={cn("text-sm", !e.read_at && "font-medium")}>
                            {h.actor && <span className="font-semibold">{h.actor} </span>}
                            {h.text}
                          </div>
                          {e.data.snippet && (
                            <blockquote className="mt-2 line-clamp-2 border-l-2 pl-2 text-xs text-muted-foreground">
                              {e.data.snippet}
                            </blockquote>
                          )}
                          {e.data.decisionNote && (
                            <div className="mt-2 rounded bg-muted px-2 py-1 text-xs">
                              “{e.data.decisionNote}”
                            </div>
                          )}
                          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="rounded bg-muted px-1.5 py-0.5">{e.data.courseTitle}</span>
                            {timeAgo(e.inserted_at)}
                          </div>
                        </div>
                        <div className="absolute right-3 top-3 hidden gap-1 group-hover:flex">
                          <button
                            title={e.read_at ? "Mark unread" : "Mark read"}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              e.read_at ? feed.markUnread([e.id]) : feed.markRead([e.id]);
                            }}
                            className="rounded border bg-background p-1 hover:bg-muted"
                          >
                            {e.read_at ? <Mail className="size-3.5" /> : <Check className="size-3.5" />}
                          </button>
                          <button
                            title="Archive"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              feed.archive([e.id]);
                            }}
                            className="rounded border bg-background p-1 hover:bg-muted"
                          >
                            <Archive className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
