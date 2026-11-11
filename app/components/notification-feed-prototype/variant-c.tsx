// PROTOTYPE — throwaway. Variant C: "Inbox" nav item opens a two-pane inbox over the main area.
// Category filters, list on the left, full detail + one primary action on the right. Selecting = read.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, Inbox, X } from "lucide-react";
import { cn } from "~/lib/utils";
import { CATEGORY, CTA, headline, timeAgo, type Feed } from "./use-feed";
import { KindIcon } from "./kind-icon";

export const name = "Inbox takeover";

export function VariantC({ feed }: { feed: Feed }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const categories = ["All", ...new Set(feed.entries.map((e) => CATEGORY[e.data.kind]))];
  const shown = feed.entries.filter((e) => filter === "All" || CATEGORY[e.data.kind] === filter);
  const selected = feed.entries.find((e) => e.id === selectedId) ?? null;

  function select(id: string) {
    setSelectedId(id);
    const e = feed.entries.find((x) => x.id === id);
    if (e && !e.read_at) feed.markRead([id]);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Inbox className="size-4" />
        Inbox
        {feed.unreadCount > 0 && (
          <span className="ml-auto text-xs font-semibold text-primary">{feed.unreadCount} new</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-y-0 left-56 right-0 z-40 flex flex-col bg-background">
          <header className="flex h-14 items-center justify-between border-b px-6">
            <div className="flex items-center gap-2">
              <Inbox className="size-5" />
              <h1 className="text-lg font-semibold">Inbox</h1>
              <span className="text-sm text-muted-foreground">{feed.unreadCount} unread</span>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-md p-1.5 hover:bg-muted" title="Close (Esc)">
              <X className="size-5" />
            </button>
          </header>
          <div className="flex min-h-0 flex-1">
            <div className="flex w-[22rem] flex-col border-r">
              <div className="flex flex-wrap gap-1.5 border-b p-3">
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFilter(c)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs",
                      filter === c ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto">
                {shown.length === 0 && (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    {feed.loaded ? "Inbox zero" : "Loading…"}
                  </div>
                )}
                {shown.map((e) => {
                  const h = headline(e.data);
                  return (
                    <button
                      key={e.id}
                      onClick={() => select(e.id)}
                      className={cn(
                        "flex w-full items-start gap-2 border-b px-4 py-3 text-left",
                        selectedId === e.id ? "bg-muted" : "hover:bg-muted/50"
                      )}
                    >
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", !e.read_at ? "bg-primary" : "bg-transparent")} />
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                          <span>{CATEGORY[e.data.kind]}</span>
                          <span>{timeAgo(e.inserted_at)}</span>
                        </div>
                        <div className={cn("truncate text-sm", !e.read_at && "font-semibold")}>
                          {h.actor ? `${h.actor} ${h.text}` : h.text}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-10">
              {!selected ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Select a Notification
                </div>
              ) : (
                <article className="mx-auto max-w-xl">
                  <div className="flex items-center gap-3">
                    <KindIcon kind={selected.data.kind} className="size-12 [&_svg]:size-6" />
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">
                        {CATEGORY[selected.data.kind]} · {new Date(selected.inserted_at).toLocaleString()}
                      </div>
                      <h2 className="text-xl font-semibold">
                        {(() => {
                          const h = headline(selected.data);
                          return h.actor ? `${h.actor} ${h.text}` : h.text;
                        })()}
                      </h2>
                    </div>
                  </div>
                  <dl className="mt-8 grid grid-cols-[8rem_1fr] gap-y-3 text-sm">
                    <dt className="text-muted-foreground">Course</dt>
                    <dd>{selected.data.courseTitle}</dd>
                    {selected.data.lessonTitle && (<><dt className="text-muted-foreground">Lesson</dt><dd>{selected.data.lessonTitle}</dd></>)}
                    {selected.data.amount && (<><dt className="text-muted-foreground">Amount</dt><dd>{selected.data.amount}</dd></>)}
                    {selected.data.reason && (<><dt className="text-muted-foreground">Reason</dt><dd>{selected.data.reason}</dd></>)}
                    {selected.data.seatsLeft !== undefined && (<><dt className="text-muted-foreground">Seats left</dt><dd>{selected.data.seatsLeft}</dd></>)}
                  </dl>
                  {selected.data.snippet && (
                    <blockquote className="mt-6 rounded-lg border bg-muted/40 p-4 text-sm">{selected.data.snippet}</blockquote>
                  )}
                  {selected.data.decisionNote && (
                    <div className="mt-6 rounded-lg border p-4 text-sm">
                      <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Note from Cadence</div>
                      {selected.data.decisionNote}
                    </div>
                  )}
                  <div className="mt-8 flex gap-2">
                    <button
                      onClick={() => {
                        setOpen(false);
                        navigate(selected.data.url);
                      }}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      {CTA[selected.data.kind]} <ArrowRight className="size-4" />
                    </button>
                    <button
                      onClick={() => feed.markUnread([selected.id])}
                      className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
                    >
                      Mark unread
                    </button>
                  </div>
                </article>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
