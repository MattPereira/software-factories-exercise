// PROTOTYPE — throwaway. Fires sample catalogue Notifications at Knock (Development)
// through the `prototype-notification` workflow so the Notification Feed has something in it.
import Database from "better-sqlite3";

process.loadEnvFile(".env");
const KEY = process.env.KNOCK_API_KEY!;
const WORKFLOW = "prototype-notification";
const db = new Database("data.db", { readonly: true });

const user = (id: number) =>
  db.prepare("select id, name, email from users where id = ?").get(id) as {
    id: number;
    name: string;
    email: string;
  };
const lesson = (id: number) =>
  db
    .prepare(
      "select l.id, l.title, c.slug, c.title as courseTitle from lessons l join modules m on m.id = l.module_id join courses c on c.id = m.course_id where l.id = ?"
    )
    .get(id) as { id: number; title: string; slug: string; courseTitle: string };
const comment = (id: number) =>
  (db.prepare("select body from comments where id = ?").get(id) as { body: string }).body
    .replace(/\s+/g, " ")
    .slice(0, 140);

const ts = { title: "Introduction to TypeScript", slug: "introduction-to-typescript" };
const tw = { title: "Design Systems with Tailwind", slug: "design-systems-with-tailwind" };
const l3 = lesson(3), l5 = lesson(5), l8 = lesson(8);

// [recipientId, data]; oldest first so newest lands on top of the feed.
const sends: [number, Record<string, unknown>][] = [
  // Alex Rivera — Platform Admin
  [1, { kind: "refund_request_opened", actorName: user(6).name, courseTitle: tw.title, amount: "$49.00", reason: "The course wasn't what I expected from the description.", url: "/admin/refunds" }],
  [1, { kind: "refund_request_opened", actorName: user(8).name, courseTitle: ts.title, amount: "$79.00", reason: "I bought it by mistake on the wrong account.", url: "/admin/refunds" }],
  [1, { kind: "discussion_question", actorName: user(9).name, courseTitle: l5.courseTitle, lessonTitle: l5.title, snippet: comment(5), url: `/courses/${l5.slug}/lessons/${l5.id}` }],
  // Sarah Chen — Instructor
  [2, { kind: "enrollment_created", actorName: user(11).name, courseTitle: tw.title, url: "/instructor/3/students" }],
  [2, { kind: "discussion_question", actorName: user(9).name, courseTitle: l5.courseTitle, lessonTitle: l5.title, snippet: comment(5), url: `/courses/${l5.slug}/lessons/${l5.id}` }],
  [2, { kind: "discussion_question", actorName: user(7).name, courseTitle: l8.courseTitle, lessonTitle: l8.title, snippet: comment(4), url: `/courses/${l8.slug}/lessons/${l8.id}` }],
  [2, { kind: "enrollment_created", actorName: user(12).name, courseTitle: ts.title, url: "/instructor/1/students" }],
  // Emma Wilson — Student
  [5, { kind: "refund_approved", courseTitle: tw.title, decisionNote: "Refunded in full. Sorry it wasn't the right fit!", url: `/courses/${tw.slug}` }],
  [5, { kind: "discussion_reply", actorName: user(2).name, courseTitle: l3.courseTitle, lessonTitle: l3.title, snippet: comment(2), url: `/courses/${l3.slug}/lessons/${l3.id}` }],
  // Liam Thompson — Student
  [8, { kind: "refund_declined", courseTitle: ts.title, decisionNote: "You've completed most of the course, so this is outside the refund window. You can ask again if something's wrong.", url: `/courses/${ts.slug}` }],
  // Bossy McBossface — Team Admin
  [10, { kind: "seat_claimed", actorName: user(13).name, courseTitle: ts.title, seatsLeft: 3, url: "/team" }],
  [10, { kind: "seat_claimed", actorName: user(14).name, courseTitle: ts.title, seatsLeft: 2, url: "/team" }],
];

for (const [recipientId, data] of sends) {
  const r = user(recipientId);
  const res = await fetch(`https://api.knock.app/v1/workflows/${WORKFLOW}/trigger`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipients: [{ id: String(r.id), name: r.name, email: r.email }],
      data,
    }),
  });
  console.log(res.status, r.name, data.kind, res.ok ? "" : await res.text());
  if (!res.ok) process.exit(1);
  await new Promise((ok) => setTimeout(ok, 400));
}
