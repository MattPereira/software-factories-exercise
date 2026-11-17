import { useState } from "react";
import { useFetcher } from "react-router";
import { Lock, NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatRelativeTime } from "~/lib/utils";
import { describeNoteDraft, type NoteDraftState } from "~/modules/note-draft";

export type LessonNoteData = { body: string; updatedAt: string } | null;

// Shares its card, heading and composer layout with CommentThread so the two
// read as one family on the Lesson page.
export function LessonNote({ note }: { note: LessonNoteData }) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [draft, setDraft] = useState(note?.body ?? "");
  const isSaving = fetcher.state !== "idle";
  const error = fetcher.data?.error;
  const state = describeNoteDraft(draft, note?.body ?? null);

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <NotebookPen className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">Your notes</h2>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            <Lock className="size-3" />
            Private
          </span>
        </div>

        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            rows={4}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Jot down what you want to remember from this lesson..."
            aria-label="Your notes"
          />

          <NoteFooter
            state={state}
            isSaving={isSaving}
            error={error}
            updatedAt={note?.updatedAt ?? null}
          />

          <p className="text-xs text-muted-foreground">
            Only you can read your notes. Find them again on your Saved page.
          </p>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function NoteStatus({
  error,
  unsaved,
  updatedAt,
}: {
  error: string | undefined;
  unsaved: boolean;
  updatedAt: string | null;
}) {
  if (error) return <span className="text-xs text-destructive">{error}</span>;
  if (unsaved)
    return (
      <span className="text-xs text-muted-foreground">Unsaved changes</span>
    );
  if (!updatedAt) return null;
  return (
    <span suppressHydrationWarning className="text-xs text-muted-foreground">
      Saved {formatRelativeTime(updatedAt)}
    </span>
  );
}

function NoteFooter({
  state: { canSave, unsaved, length, maxLength, tooLong },
  isSaving,
  error,
  updatedAt,
}: {
  state: NoteDraftState;
  isSaving: boolean;
  error: string | undefined;
  updatedAt: string | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" size="sm" disabled={isSaving || !canSave}>
        {isSaving ? "Saving..." : "Save note"}
      </Button>
      <NoteStatus error={error} unsaved={unsaved} updatedAt={updatedAt} />
      <span
        className={cn(
          "ml-auto text-xs",
          tooLong ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {length} / {maxLength}
      </span>
    </div>
  );
}
