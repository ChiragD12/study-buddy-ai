/**
 * Server-safe mirror of the Current Affairs topic taxonomy, importance
 * thresholds, and notification-eligibility rule.
 *
 * This intentionally duplicates (rather than imports)
 * `src/shared/types/domain.ts` and the thresholds in
 * `src/ai/context/currentAffairsClassification.ts` — Vercel API functions
 * run as isolated serverless functions and must not depend on the frontend
 * source tree (see the header comment in api/current-affairs/feeds.ts for
 * the same constraint applied to the RSS allowlist). If the topic list or
 * thresholds ever change on the frontend, mirror the change here too.
 */

export const CURRENT_AFFAIRS_TOPICS = [
  "space",
  "defence",
  "sports",
  "science-tech",
  "economy",
  "polity",
  "environment",
  "international",
  "haryana",
  "punjab",
  "history",
  "geography",
  "society",
  "agriculture",
  "government-schemes",
  "reports-indices",
  "awards-honours",
  "important-personalities",
  "disaster-climate",
  "other-general",
] as const;

export type CurrentAffairsTopic = (typeof CURRENT_AFFAIRS_TOPICS)[number];

export function isCurrentAffairsTopic(value: unknown): value is CurrentAffairsTopic {
  return typeof value === "string" && (CURRENT_AFFAIRS_TOPICS as readonly string[]).includes(value);
}

export type GkImportanceLevel = "critical" | "important" | "useful" | "low";

/** Mirrors importanceLevel() in src/ai/context/currentAffairsClassification.ts. */
export function importanceLevel(score: number): GkImportanceLevel {
  if (score >= 90) return "critical";
  if (score >= 75) return "important";
  if (score >= 50) return "useful";
  return "low";
}

/** Mirrors isNotificationEligible() in the same file — notification-worthy
 *  only at "important" or above. */
export function isNotificationEligible(score: number): boolean {
  return score >= 75;
}

export interface CurrentAffairsClassification {
  primaryTopic: CurrentAffairsTopic;
  secondaryTopics?: CurrentAffairsTopic[] | undefined;
  /** 0-100. See importanceLevel() above. */
  importanceScore: number;
  importanceLevel: GkImportanceLevel;
  examRelevant: boolean;
  notificationEligible: boolean;
  /** How the result was produced. A deterministic-filtered item never made an AI call. */
  method: "ai" | "deterministic-filter";
  classifiedAt: string;
}
