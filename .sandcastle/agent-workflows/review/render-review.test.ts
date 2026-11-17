import { describe, expect, it } from "vitest";
import { renderReview } from "./render-review";
import type { Review } from "./review-schema";

const review = (overrides: Partial<Review> = {}): Review => ({
  standards: { verdict: "PASS", reason: "Meets the standards." },
  spec: { verdict: "PASS", reason: "Does what the ticket asks." },
  fixed: [],
  left: [],
  followUps: [],
  missingRules: [],
  evidence: [],
  ...overrides,
});

const everywhere = () => true;

describe("renderReview", () => {
  it("starts with the Standards heading the workflow greps for", () => {
    const { verdict } = renderReview(review(), everywhere);

    expect(verdict.startsWith("## Standards: PASS\n")).toBe(true);
    expect(verdict).toContain("## Spec: PASS");
  });

  it("writes a left finding once, as an inline comment, not in the verdict", () => {
    const { verdict, comments } = renderReview(
      review({
        spec: { verdict: "CHANGES REQUESTED", reason: "Partly done." },
        left: [
          {
            axis: "spec",
            rule: "more integrated with the bit at the bottom",
            path: "app/a.tsx",
            line: 160,
            body: "Still under the video.",
          },
        ],
      }),
      everywhere
    );

    expect(comments).toEqual([
      {
        path: "app/a.tsx",
        line: 160,
        body: "**Spec: more integrated with the bit at the bottom**\n\nStill under the video.",
      },
    ]);
    expect(verdict).not.toContain("Still under the video.");
    expect(verdict).toContain("1 finding left as inline comments.");
    expect(verdict).toContain("Partly done. (0 fixed, 1 left)");
  });

  it("moves a finding off the diff into the verdict instead of dropping it", () => {
    const { verdict, comments } = renderReview(
      review({
        left: [
          {
            axis: "standards",
            rule: "Middle Man (judgement call)",
            path: "app/b.ts",
            line: 3,
            body: "Only forwards.",
          },
        ],
      }),
      () => false
    );

    expect(comments).toEqual([]);
    expect(verdict).toContain(
      "- `app/b.ts:3`: **Standards: Middle Man (judgement call)**\n\nOnly forwards."
    );
    expect(verdict).not.toContain("inline comments");
  });

  it("lists fixes per axis as table rows, escaping pipes and newlines", () => {
    const { verdict } = renderReview(
      review({
        fixed: [
          {
            axis: "standards",
            rule: "Do not read from the database in a loop",
            summary: "One query per question\nnow one `a | b` IN query.",
            commit: "470de70",
          },
        ],
      }),
      everywhere
    );

    expect(verdict).toContain(
      "| **Do not read from the database in a loop**: One query per question now one `a \\| b` IN query. | 470de70 |"
    );
    expect(verdict).toContain("Meets the standards. (1 fixed, 0 left)");
  });

  it("renders the sketch, missing rules and evidence only when present", () => {
    const bare = renderReview(review(), everywhere).verdict;
    expect(bare).not.toContain("## Rules this review wanted");
    expect(bare).not.toContain("## Evidence");

    const { verdict } = renderReview(
      review({
        standards: {
          verdict: "PASS",
          reason: "Fine.",
          sketch: "```diff\n-loop\n+IN\n```",
        },
        missingRules: [{ rule: "A rule", example: "Here." }],
        evidence: [{ caption: "after", path: "/tmp/evidence/after.png" }],
      }),
      everywhere
    );

    expect(verdict).toContain(
      "Fine. (0 fixed, 0 left)\n\n```diff\n-loop\n+IN\n```"
    );
    expect(verdict).toContain(
      "## Rules this review wanted and could not find\n\n- **A rule**: Here."
    );
    expect(verdict).toContain(
      "## Evidence\n\n![after](/tmp/evidence/after.png)"
    );
  });
});
