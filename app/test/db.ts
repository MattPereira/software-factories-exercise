import { afterEach, beforeEach } from "vitest";
import { setDbOverride } from "~/db";
import { createTestDb } from "~/test/setup";

/**
 * Call once at the top level of a test file. Before each test, the app's
 * shared `db` handle (from "~/db") is pointed at a fresh in-memory SQLite
 * database built from the real migrations; after each test it is discarded.
 *
 * Returns a getter for the current test's database, for seeding.
 */
export function useTestDb() {
  let current: ReturnType<typeof createTestDb> | undefined;

  beforeEach(() => {
    current = createTestDb();
    setDbOverride(current);
  });

  afterEach(() => {
    setDbOverride(undefined);
    current?.$client.close();
    current = undefined;
  });

  return () => {
    if (!current) throw new Error("useTestDb: no test database outside a test");
    return current;
  };
}
