import { describe, it, expect } from "vitest";
import { greet } from "../index";

describe("greet", () => {
  it("greets by name, tidying whitespace", () => {
    expect(greet("  Ada   Lovelace ")).toBe("Hello, Ada Lovelace!");
  });

  it("falls back when the name is blank", () => {
    expect(greet("   ")).toBe("Hello, stranger!");
  });
});
