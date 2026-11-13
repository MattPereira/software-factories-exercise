import { db as appDb } from "~/db";
import {
  getInstructorAnalytics as compute,
  type AnalyticsViewer,
  type Db,
} from "./lib/instructor-analytics.server";

export type {
  AnalyticsViewer,
  CourseCountryRevenue,
  CourseFunnel,
  CourseProgressSummary,
  FunnelLesson,
  InstructorAnalytics,
  QuizPassRate,
  RefundExposure,
  RevenueSeries,
} from "./lib/instructor-analytics.server";

/**
 * Every figure on the instructor analytics page.
 *
 * Never throws on bad params: an unknown range, tab, instructor or course
 * falls back to its default. `now` is the only clock read, so the same
 * database, params and `now` always produce the same result.
 *
 * `db` defaults to the app database; tests pass their own.
 */
export function getInstructorAnalytics(
  viewer: AnalyticsViewer,
  params: URLSearchParams,
  now: Date,
  db: Db = appDb
) {
  return compute(db, viewer, params, now);
}
