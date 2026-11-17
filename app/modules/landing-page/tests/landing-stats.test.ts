import { describe, it, expect } from "vitest";
import { landingStats } from "../index";

describe("landingStats", () => {
  it("lists courses, categories and pace, in that order", () => {
    const stats = landingStats({ totalCourses: 4, totalCategories: 5 });
    expect(stats).toEqual([
      { key: "courses", value: "4", label: "published courses" },
      { key: "categories", value: "5", label: "categories" },
      { key: "pace", value: "Self-paced", label: "learn on your schedule" },
    ]);
  });

  it("uses the singular label for a count of one", () => {
    const [courses, categories] = landingStats({
      totalCourses: 1,
      totalCategories: 1,
    });
    expect(courses.label).toBe("published course");
    expect(categories.label).toBe("category");
  });

  it("uses the plural label for a count of zero", () => {
    const [courses, categories] = landingStats({
      totalCourses: 0,
      totalCategories: 0,
    });
    expect(courses).toMatchObject({ value: "0", label: "published courses" });
    expect(categories).toMatchObject({ value: "0", label: "categories" });
  });
});
