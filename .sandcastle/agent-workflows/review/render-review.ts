import type { Review } from "./review-schema";

type Axis = "standards" | "spec";
type Left = Review["left"][number];

export type InlineComment = { path: string; line: number; body: string };

const AXIS_TITLE: Record<Axis, string> = {
  standards: "Standards",
  spec: "Spec",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// A table cell cannot hold a newline or an unescaped pipe.
const cell = (text: string) =>
  text.replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|");

const commentBody = ({ axis, rule, body }: Left) =>
  `**${AXIS_TITLE[axis]}: ${rule}**\n\n${body}`;

const renderAxis = (
  review: Review,
  axis: Axis,
  { inline, offDiff }: { inline: Left[]; offDiff: Left[] }
): string[] => {
  const { verdict, reason, sketch } = review[axis];
  const fixed = review.fixed.filter((f) => f.axis === axis);
  const leftInline = inline.filter((l) => l.axis === axis).length;
  const leftOff = offDiff.filter((l) => l.axis === axis);

  const counts = `${fixed.length} fixed, ${leftInline + leftOff.length} left`;
  const out = [
    `## ${AXIS_TITLE[axis]}: ${verdict}`,
    "",
    `${reason} (${counts})`,
  ];

  if (sketch) out.push("", sketch.trim());

  if (fixed.length > 0) {
    out.push("", "| Fixed | Commit |", "| --- | --- |");
    for (const f of fixed) {
      out.push(`| **${cell(f.rule)}**: ${cell(f.summary)} | ${f.commit} |`);
    }
  }

  if (leftInline > 0) {
    out.push("", `${plural(leftInline, "finding")} left as inline comments.`);
  }

  // GitHub rejects an inline comment off the diff, so these live here instead.
  for (const l of leftOff) {
    out.push("", `- \`${l.path}:${l.line}\`: ${commentBody(l)}`);
  }

  return out;
};

export const renderReview = (
  review: Review,
  onDiff: (path: string, line: number) => boolean
): { verdict: string; comments: InlineComment[] } => {
  const inline = review.left.filter((l) => onDiff(l.path, l.line));
  const offDiff = review.left.filter((l) => !onDiff(l.path, l.line));

  const out = [
    ...renderAxis(review, "standards", { inline, offDiff }),
    "",
    ...renderAxis(review, "spec", { inline, offDiff }),
  ];

  if (review.missingRules.length > 0) {
    out.push("", "## Rules this review wanted and could not find", "");
    for (const m of review.missingRules) {
      out.push(`- **${m.rule}**: ${m.example}`);
    }
  }

  if (review.evidence.length > 0) {
    out.push("", "## Evidence", "");
    for (const shot of review.evidence) {
      out.push(`![${shot.caption}](${shot.path})`);
    }
  }

  return {
    verdict: `${out.join("\n")}\n`,
    comments: inline.map((l) => ({
      path: l.path,
      line: l.line,
      body: commentBody(l),
    })),
  };
};
