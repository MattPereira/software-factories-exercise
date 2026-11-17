import { noteDraftState, type NoteDraftState } from "./lib/draft";

export type { NoteDraftState };

/**
 * What the Lesson Note composer shows for a draft: its length against the
 * limit, whether it has unsaved changes, and whether Save is enabled.
 */
export function describeNoteDraft(
  draft: string,
  savedBody: string | null
): NoteDraftState {
  return noteDraftState(draft, savedBody);
}
