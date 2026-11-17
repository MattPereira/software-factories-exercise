import { buildLandingStats, type CatalogueCounts } from "./lib/stats";

export type { LandingStat, CatalogueCounts } from "./lib/stats";

export function landingStats(counts: CatalogueCounts) {
  return buildLandingStats(counts);
}
