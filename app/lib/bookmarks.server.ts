import { and, desc, eq } from "drizzle-orm";
import { bookmarks, courses, lessons, modules } from "~/db/schema";
import type { Db } from "~/lib/comments.server";

// ─── Bookmarks ───
// A Student's flag on a Lesson. See GLOSSARY.md. Content access is checked by
// the caller; these functions trust the Student and Lesson they are given.

export function isBookmarked(db: Db, userId: number, lessonId: number) {
  return !!db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.lessonId, lessonId)))
    .get();
}

/** Adds the Bookmark if there is none, removes it if there is one. Returns whether the Lesson is now bookmarked. */
export function toggleBookmark(
  db: Db,
  userId: number,
  lessonId: number,
  now: Date
): boolean {
  const removed = db
    .delete(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.lessonId, lessonId)))
    .returning()
    .all();
  if (removed.length > 0) return false;

  // A concurrent toggle may have inserted first; the unique index keeps it to one row.
  db.insert(bookmarks)
    .values({ userId, lessonId, createdAt: now.toISOString() })
    .onConflictDoNothing()
    .run();
  return true;
}

/** The Student's Bookmarks, newest first, each with the Lesson and Course it belongs to. */
export function listBookmarks(db: Db, userId: number) {
  return db
    .select({
      id: bookmarks.id,
      createdAt: bookmarks.createdAt,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      moduleTitle: modules.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(bookmarks)
    .innerJoin(lessons, eq(bookmarks.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.createdAt), desc(bookmarks.id))
    .all();
}
