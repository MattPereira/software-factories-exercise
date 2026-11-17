import { z } from "zod/v4";

const axis = z.enum(["standards", "spec"]);

const axisVerdict = z.strictObject({
  verdict: z.enum(["PASS", "CHANGES REQUESTED"]),
  reason: z.string().min(1).describe("One sentence."),
  sketch: z
    .string()
    .optional()
    .describe(
      "At most one fenced code block (pseudocode, call tree, component tree, file tree, Mermaid, or diff) showing the shape a fix changed. Omit unless a fix changed the shape of the code."
    ),
});

// review.ts renders the verdict comment and the inline comments from this, so
// each finding is written once and lands in exactly one place.
export const reviewSchema = z
  .strictObject({
    standards: axisVerdict,
    spec: axisVerdict.describe(
      'With no spec available, PASS with the reason "No spec available".'
    ),
    fixed: z
      .array(
        z.strictObject({
          axis,
          rule: z
            .string()
            .min(1)
            .describe(
              "The CODING_STANDARDS.md heading, the smell name, or the spec line quoted short."
            ),
          summary: z
            .string()
            .min(1)
            .describe("What was wrong and what the fix did, in one sentence."),
          commit: z.string().min(7).describe("The short SHA of the fix."),
        })
      )
      .describe("One entry per finding you fixed. Empty is fine."),
    left: z
      .array(
        z.strictObject({
          axis,
          rule: z
            .string()
            .min(1)
            .describe(
              "The CODING_STANDARDS.md heading, the smell name, or the spec line quoted short. Mark judgement calls: `(judgement call)`."
            ),
          path: z
            .string()
            .min(1)
            .describe("The file, relative to the repository root."),
          line: z
            .number()
            .int()
            .positive()
            .describe(
              "A line in the file as it is now, inside a hunk of the diff against the base."
            ),
          body: z
            .string()
            .min(1)
            .describe(
              "The finding, in Markdown: what is wrong and what to do instead. The rule is printed above it, so do not restate it."
            ),
        })
      )
      .describe(
        "One entry per finding you left unfixed. Each becomes an inline comment. Empty is fine."
      ),
    followUps: z
      .array(
        z.strictObject({
          title: z.string().min(1).describe("The issue title."),
          body: z
            .string()
            .min(1)
            .describe(
              "The issue body, in Markdown: where (file and line), what is wrong, and what to do."
            ),
        })
      )
      .describe(
        "Findings in code this PR moved without changing, or bugs outside the ticket. The workflow files each as an issue. Empty is fine."
      ),
    missingRules: z
      .array(
        z.strictObject({
          rule: z
            .string()
            .min(1)
            .describe("The rule, as a heading would read."),
          example: z
            .string()
            .min(1)
            .describe("Where this diff needed it, in one or two sentences."),
        })
      )
      .describe(
        "Anything you wanted to fail the change for that no standard covers. The retro reads this list. Empty is fine."
      ),
    evidence: z
      .array(
        z.strictObject({
          caption: z.string().min(1),
          path: z
            .string()
            .regex(/^\/tmp\/evidence\/[^/]+\.png$/)
            .describe("A PNG you saved in /tmp/evidence/."),
        })
      )
      .describe(
        "Screenshots of what your own fixes changed in the UI. The PR body already carries the implementer's before and after. Empty is fine."
      ),
  })
  .describe("The review: verdicts, findings, and evidence.");

export type Review = z.infer<typeof reviewSchema>;
