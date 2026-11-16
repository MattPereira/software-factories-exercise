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
  const length = draft.length;
  const tooLong = length > MAX_NOTE_LENGTH;
  // The save-note action rejects a blank body, so a blank draft cannot be saved.
  const empty = draft.trim().length === 0;
  const unsaved = draft !== (savedBody ?? "");

  return {
    length,
    maxLength: MAX_NOTE_LENGTH,
    tooLong,
    empty,
    unsaved,
    canSave: unsaved && !empty && !tooLong,
  };
}
