import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { claudeAgent, required, writeJson } from "../shared/common";
import { extractionPrompt } from "../shared/extraction-prompt";
import { runWithExtraction } from "../shared/run-with-extraction";
import { diffLines } from "./diff-lines";
import { renderReview } from "./render-review";
import { reviewSchema } from "./review-schema";

const BASE_REF = required("BASE_REF");

// The agent fixes and commits, then hands back the whole review as structured
// output. This script renders the verdict and the inline comments from it.
// The workflow pushes the commits, posts both, and marks the PR ready.
const result = await runWithExtraction({
  name: "review",
  agent: claudeAgent(),
  sandbox: noSandbox(),
  logging: { type: "stdout" },
  promptFile: path.join(import.meta.dirname, "prompt.md"),
  promptArgs: {
    PR_NUMBER: required("PR_NUMBER"),
    BRANCH: required("BRANCH"),
    BASE_REF,
  },
  output: sandcastle.Output.object({ tag: "review", schema: reviewSchema }),
  extractionPrompt: extractionPrompt("review", reviewSchema),
});

const git = (...args: string[]): string =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// The diff after the agent's commits: the comments land on that.
const hunks = diffLines(git("diff", `origin/${BASE_REF}...HEAD`));
const { verdict, comments } = renderReview(
  result.output,
  (file, line) => hunks.get(file)?.has(line) ?? false
);

// The workflow posts this file; the "mark ready" step greps it for
// `## Standards:`.
fs.writeFileSync("/tmp/review-verdict.md", verdict);

// The workflow files each one as an issue and links it from the verdict.
writeJson("review-follow-ups.json", result.output.followUps);

// The request body for POST /repos/{owner}/{repo}/pulls/{n}/reviews.
writeJson("review-comments.json", {
  commit_id: git("rev-parse", "HEAD").trim(),
  event: "COMMENT",
  body: "The findings this review left for you, on their lines. The verdict is in its own comment.",
  comments: comments.map((comment) => ({ ...comment, side: "RIGHT" })),
});
