import { ToolError } from "@bashco/mcp-toolkit";
import type { GHLApiEnv } from "../env.js";
import { listSocialAccounts, socialFetch } from "./social.js";
import type { SocialAccount } from "./types.js";

/**
 * Social Planner statistics: account-level totals over a period, per platform.
 *
 * Established against the live API on 2026-11-17 (scripts/probe-stats.sh):
 *
 * - Needs socialplanner/statistics.readonly on the private integration.
 * - `profileIds` are the accounts' 24-character profileIds, which appear only in
 *   GHL's accounts listing. The composite account id, its prefix and the
 *   platform-native id all fail ("Invalid connected account ID", or 403 "do not
 *   belong to location"). So profileIds come from GHL_SOCIAL_ACCOUNTS config.
 * - Any range works — 2022 to now returned data. GHL picks the grouping from
 *   the range length: daily for a week, monthly for a year, yearly beyond.
 * - There is no per-post data in the response; GHL's own "top posts" table is
 *   fed by an internal endpoint this token cannot call.
 * - The followers figure grows with the window (2 for a week, 183 for a year),
 *   so it is followers gained in the period, not the follower count. Named
 *   newFollowers here so nobody reads it as audience size.
 */

export const STATS_PLATFORMS = [
  "facebook",
  "instagram",
  "linkedin",
  "google",
  "youtube",
  "tiktok",
  "pinterest",
] as const;
export type StatsPlatform = (typeof STATS_PLATFORMS)[number];

export interface StatsInput {
  fromDate?: string | undefined;
  toDate?: string | undefined;
  compareToPrevious: boolean;
  platforms?: StatsPlatform[] | undefined;
  accountIds?: string[] | undefined;
  includeSeries?: boolean | undefined;
}

interface Range {
  startDate: string;
  endDate: string;
}

/** The window of equal length that ends 1 ms before the current one starts. */
export function previousRange(from: string, to: string): Range {
  const start = Date.parse(from);
  const end = Date.parse(to);
  const prevEnd = start - 1;
  const prevStart = prevEnd - (end - start);
  return { startDate: new Date(prevStart).toISOString(), endDate: new Date(prevEnd).toISOString() };
}

type AccountRef = Pick<SocialAccount, "id" | "platform" | "name">;

function ref(a: SocialAccount): AccountRef {
  return { id: a.id, platform: a.platform, ...(a.name !== undefined ? { name: a.name } : {}) };
}

async function selectAccounts(
  env: GHLApiEnv,
  input: StatsInput,
): Promise<{ withStats: SocialAccount[]; withoutStats: SocialAccount[] }> {
  const accounts = await listSocialAccounts(env);
  let selected = accounts;

  if (input.accountIds !== undefined) {
    const byId = new Map(accounts.map((a) => [a.id, a]));
    selected = input.accountIds.map((id) => {
      const account = byId.get(id);
      if (account === undefined) {
        throw ToolError.validation(
          "unknown social account id — run list_social_accounts for the valid ids",
          `stats: account ${id} is not configured for location ${env.GHL_LOCATION_ID}`,
        );
      }
      return account;
    });
  }
  if (input.platforms !== undefined) {
    const wanted = new Set<string>(input.platforms);
    selected = selected.filter((a) => wanted.has(a.platform));
  }

  const withStats = selected.filter((a) => a.profileId !== undefined);
  const withoutStats = selected.filter((a) => a.profileId === undefined);

  if (withStats.length === 0) {
    throw new ToolError({
      userMessage:
        "none of the selected social accounts has statistics set up — the operator needs to add each " +
        "account's profileId to the GHL_SOCIAL_ACCOUNTS secret (see the README)",
      internalMessage: `stats: no profileId among ${selected.map((a) => a.id).join(", ") || "no accounts"}`,
      status: 400,
    });
  }
  return { withStats, withoutStats };
}

// GHL sends percentages as strings ("-13.70") or as a bare 0.
function percent(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Copies only the entries that hold a value, so absent metrics stay absent rather than 0. */
function defined<T extends Record<string, unknown>>(obj: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function seriesByPlatform(block: Obj | undefined): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const [platform, v] of Object.entries(block ?? {})) {
    if (Array.isArray((v as Obj)?.series)) out[platform] = (v as Obj).series;
  }
  return out;
}

export interface PlatformStats {
  posts?: number;
  impressions?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  newFollowers?: number;
  changePercent?: { posts?: number; impressions?: number; reach?: number; engagement?: number };
}

export interface StatsResult {
  range: { from: string; to: string } | null;
  comparedTo: { from: string; to: string } | null;
  note?: string;
  grouping: string | undefined;
  totals: Record<string, number | undefined>;
  changePercent?: { posts?: number; impressions?: number; reach?: number };
  platforms: Record<string, PlatformStats>;
  series?: Record<string, unknown>;
  demographics?: unknown;
  accountsIncluded: AccountRef[];
  accountsWithoutStats: AccountRef[];
}

export async function getSocialStats(env: GHLApiEnv, input: StatsInput): Promise<StatsResult> {
  const { withStats, withoutStats } = await selectAccounts(env, input);

  let current: Range | undefined;
  let prev: Range | undefined;
  if (input.fromDate !== undefined && input.toDate !== undefined) {
    current = {
      startDate: new Date(input.fromDate).toISOString(),
      endDate: new Date(input.toDate).toISOString(),
    };
    if (input.compareToPrevious) prev = previousRange(current.startDate, current.endDate);
  }

  const data = await socialFetch<{ results?: Obj }>(env, {
    method: "POST",
    path: "/social-media-posting/statistics",
    query: { locationId: env.GHL_LOCATION_ID },
    body: {
      profileIds: withStats.map((a) => a.profileId),
      ...(current !== undefined ? { currentRange: current } : {}),
      ...(prev !== undefined ? { prevRange: prev } : {}),
    },
  });

  const r = data?.results;
  if (typeof r !== "object" || r === null) {
    throw new ToolError({
      userMessage: "GoHighLevel returned no statistics — try again, or check the Social Planner's Statistics page",
      internalMessage: `unexpected statistics response: ${JSON.stringify(data).slice(0, 512)}`,
      status: 502,
    });
  }

  // With no dates, GHL applies its own default, which always compares.
  const compared = current === undefined ? true : prev !== undefined;
  const b: Obj = r.breakdowns ?? {};
  const followers: Obj = r.platformTotals?.followers ?? {};

  const names = new Set<string>([
    ...Object.keys(b.posts?.platforms ?? {}),
    ...Object.keys(b.impressions?.platforms ?? {}),
    ...Object.keys(b.reach?.platforms ?? {}),
    ...Object.keys(b.engagement ?? {}),
    ...Object.keys(followers),
  ]);

  const platforms: Record<string, PlatformStats> = {};
  for (const p of names) {
    const eng: Obj = b.engagement?.[p] ?? {};
    const stats: PlatformStats = defined({
      posts: num(b.posts?.platforms?.[p]?.value),
      impressions: num(b.impressions?.platforms?.[p]?.value),
      reach: num(b.reach?.platforms?.[p]?.value),
      likes: num(eng.likes),
      comments: num(eng.comments),
      shares: num(eng.shares),
      newFollowers: num(followers[p]?.total),
    });
    if (compared) {
      stats.changePercent = defined({
        posts: percent(b.posts?.platforms?.[p]?.change),
        impressions: percent(b.impressions?.platforms?.[p]?.change),
        reach: percent(b.reach?.platforms?.[p]?.change),
        engagement: percent(eng.change),
      });
    }
    platforms[p] = stats;
  }

  const t: Obj = r.totals ?? {};
  const result: StatsResult = {
    range: current ? { from: current.startDate, to: current.endDate } : null,
    comparedTo: prev ? { from: prev.startDate, to: prev.endDate } : null,
    ...(current === undefined
      ? { note: "No dates given: GoHighLevel's default of the last 7 days (excluding today), compared with the 7 days before." }
      : {}),
    grouping: typeof r.grouping === "string" ? r.grouping : undefined,
    totals: {
      posts: num(t.posts),
      impressions: num(t.impressions),
      reach: num(b.reach?.total),
      likes: num(t.likes),
      comments: num(t.comments),
      newFollowers: num(t.followers),
    },
    platforms,
    accountsIncluded: withStats.map(ref),
    accountsWithoutStats: withoutStats.map(ref),
  };

  if (compared) {
    result.changePercent = defined({
      posts: percent(b.posts?.totalChange),
      impressions: percent(b.impressions?.totalChange),
      reach: percent(b.reach?.totalChange),
    });
  }

  if (input.includeSeries) {
    const pp: Obj = r.postPerformance ?? {};
    result.series = {
      labels: r.dayRange ?? [],
      postsByPlatform: pp.posts ?? {},
      impressions: pp.impressions ?? [],
      likes: pp.likes ?? [],
      comments: pp.comments ?? [],
      newFollowersByPlatform: seriesByPlatform(followers),
      impressionsByPlatform: seriesByPlatform(r.platformTotals?.impressions),
      likesByPlatform: seriesByPlatform(r.platformTotals?.likes),
    };
  }

  if (r.demographics !== undefined) result.demographics = r.demographics;
  return result;
}
