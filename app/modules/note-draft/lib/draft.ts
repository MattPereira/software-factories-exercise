import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraftState = {
  length: number;
  maxLength: number;
  tooLong: boolean;
  empty: boolean;
  /** The draft differs from what the server last saved. */
  unsaved: boolean;
  canSave: boolean;
};

export function noteDraftState(
  draft: string,
  savedBody: string | null
): NoteDraftState {
  // The save-note action trims before it validates and stores, so judge the
  // draft as the server will see it.
  const stored = draft.trim();
  const length = stored.length;
  const tooLong = length > MAX_NOTE_LENGTH;
  const empty = length === 0;
  const unsaved = stored !== (savedBody ?? "");

  return {
    length,
    maxLength: MAX_NOTE_LENGTH,
    tooLong,
    empty,
    unsaved,
    canSave: unsaved && !empty && !tooLong,
  };
}
