import { describe, it, expect } from "vitest";
import { describeNoteDraft } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

describe("describeNoteDraft", () => {
  it("cannot save an untouched empty note", () => {
    expect(describeNoteDraft("", null)).toEqual({
      length: 0,
      maxLength: MAX_NOTE_LENGTH,
      tooLong: false,
      empty: true,
      unsaved: false,
      canSave: false,
    });
  });

  it("can save a new draft with text in it", () => {
    const state = describeNoteDraft("Generics are like parameters", null);
    expect(state.unsaved).toBe(true);
    expect(state.canSave).toBe(true);
    expect(state.length).toBe(28);
  });

  it("cannot save a draft that matches the saved note", () => {
    const state = describeNoteDraft("same", "same");
    expect(state.unsaved).toBe(false);
    expect(state.canSave).toBe(false);
  });

  it("can save an edit to the saved note", () => {
    const state = describeNoteDraft("same, edited", "same");
    expect(state.unsaved).toBe(true);
    expect(state.canSave).toBe(true);
  });

  it("cannot save a whitespace-only draft", () => {
    const state = describeNoteDraft("   \n ", null);
    expect(state.empty).toBe(true);
    expect(state.canSave).toBe(false);
  });

  it("treats a saved note as saved when the draft only adds surrounding whitespace", () => {
    const state = describeNoteDraft("  same\n", "same");
    expect(state.unsaved).toBe(false);
    expect(state.canSave).toBe(false);
  });

  it("counts the draft as the server will store it, without surrounding whitespace", () => {
    const state = describeNoteDraft(` ${"a".repeat(MAX_NOTE_LENGTH)}\n`, null);
    expect(state.length).toBe(MAX_NOTE_LENGTH);
    expect(state.tooLong).toBe(false);
    expect(state.canSave).toBe(true);
  });

  it("can save a draft exactly at the limit", () => {
    const state = describeNoteDraft("a".repeat(MAX_NOTE_LENGTH), null);
    expect(state.tooLong).toBe(false);
    expect(state.canSave).toBe(true);
  });

  it("cannot save a draft one character over the limit", () => {
    const state = describeNoteDraft("a".repeat(MAX_NOTE_LENGTH + 1), null);
    expect(state.tooLong).toBe(true);
    expect(state.canSave).toBe(false);
  });

  it("marks clearing a saved note as unsaved but not saveable", () => {
    const state = describeNoteDraft("", "old note");
    expect(state.unsaved).toBe(true);
    expect(state.empty).toBe(true);
    expect(state.canSave).toBe(false);
  });
});
