// PROTOTYPE — throwaway. Variant A: bell in the sidebar header, popover list.
// Badge = unseen count; opening the popover marks everything seen. Click = read + navigate.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Bell } from "lucide-react";
import { cn } from "~/lib/utils";
import { headline, timeAgo, type Feed } from "./use-feed";
import { KindIcon } from "./kind-icon";

export const name = "Bell + popover";

export function VariantA({ feed }: { feed: Feed }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    feed.markAllSeen();
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent"
        title="Notifications"
      >
        <Bell className="size-5" />
        {feed.unseenCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {feed.unseenCount > 9 ? "9+" : feed.unseenCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-40 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {feed.unreadCount > 0 && (
              <button
                onClick={feed.markAllRead}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            {feed.entries.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                {feed.loaded ? "You're all caught up" : "Loading…"}
              </div>
            )}
            {feed.entries.map((e) => {
              const h = headline(e.data);
              return (
                <button
                  key={e.id}
                  onClick={() => {
                    feed.markRead([e.id]);
                    setOpen(false);
                    navigate(e.data.url);
                  }}
                  className={cn(
                    "flex w-full gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/60",
                    !e.read_at && "bg-primary/5"
                  )}
                >
                  <KindIcon kind={e.data.kind} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm leading-snug">
                      {h.actor && <span className="font-semibold">{h.actor} </span>}
                      {h.text}
                    </div>
                    {(e.data.snippet || e.data.decisionNote) && (
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {e.data.snippet ?? e.data.decisionNote}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {timeAgo(e.inserted_at)}
                    </div>
                  </div>
                  {!e.read_at && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
