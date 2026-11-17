export type LandingStat = {
  key: "courses" | "categories" | "pace";
  value: string;
  label: string;
};

export type CatalogueCounts = {
  totalCourses: number;
  totalCategories: number;
};

function plural(count: number, singular: string, pluralForm: string) {
  return count === 1 ? singular : pluralForm;
}

export function buildLandingStats({
  totalCourses,
  totalCategories,
}: CatalogueCounts): LandingStat[] {
  return [
    {
      key: "courses",
      value: String(totalCourses),
      label: plural(totalCourses, "published course", "published courses"),
    },
    {
      key: "categories",
      value: String(totalCategories),
      label: plural(totalCategories, "category", "categories"),
    },
    { key: "pace", value: "Self-paced", label: "learn on your schedule" },
  ];
}
