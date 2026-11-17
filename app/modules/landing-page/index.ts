import { buildLandingStats, type CatalogueCounts } from "./lib/stats";

export type { LandingStat, CatalogueCounts } from "./lib/stats";

/**
 * The stats strip on the landing page, worked out from catalogue counts.
 */
export function landingStats(counts: CatalogueCounts) {
  return buildLandingStats(counts);
}
