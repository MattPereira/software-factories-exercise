import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDb } from "~/test/db";
import { db } from "~/db";
import { users, UserRole } from "~/db/schema";

useTestDb();

describe("useTestDb", () => {
  it("inserts and reads back a user through the shared db handle", () => {
    db.insert(users)
      .values({ name: "Ada", email: "ada@example.com", role: UserRole.Admin })
      .run();

    const found = db
      .select()
      .from(users)
      .where(eq(users.email, "ada@example.com"))
      .get();

    expect(found).toMatchObject({ name: "Ada", role: UserRole.Admin });
  });

  it("starts each test with an empty database", () => {
    expect(db.select().from(users).all()).toEqual([]);
  });
});
