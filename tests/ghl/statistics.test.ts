import { afterEach, describe, expect, it } from "vitest";
import { ToolError } from "@bashco/mcp-toolkit";
import { getSocialStats, previousRange } from "../../src/ghl/statistics.js";
import { stubGhl, TEST_ENV } from "../helpers/stubGhl.js";

let stub: ReturnType<typeof stubGhl>;
afterEach(() => stub?.restore());

const STATS = "POST /social-media-posting/statistics";

// profileId is the 24-character id the statistics endpoint wants. It is NOT the
// prefix of the composite account id — the 2026-11-17 probe sent that prefix and
// GHL answered 403 "accounts do not belong to location".
const ACCOUNTS = [
  { id: "fb-1", platform: "facebook", name: "Page", profileId: "aaaaaaaaaaaaaaaaaaaaaaa1" },
  { id: "ig-1", platform: "instagram", name: "@ig", profileId: "aaaaaaaaaaaaaaaaaaaaaaa2" },
  { id: "li-page", platform: "linkedin", name: "Company", profileId: "aaaaaaaaaaaaaaaaaaaaaaa3" },
  { id: "li-me", platform: "linkedin", name: "Me", profileId: "aaaaaaaaaaaaaaaaaaaaaaa4" },
  { id: "gbp-1", platform: "google", name: "Listing", profileId: "aaaaaaaaaaaaaaaaaaaaaaa5" },
  { id: "tt-1", platform: "tiktok", name: "TikTok" }, // no profileId configured
];
const env = { ...TEST_ENV, GHL_SOCIAL_ACCOUNTS: JSON.stringify(ACCOUNTS) };

// Trimmed from a real 1-year response (tests/fixtures/social/stats-1y.json, gitignored).
const RESPONSE = {
  results: {
    dayRange: ["Nov 17 - 30", "Dec"],
    grouping: "monthly",
    totals: { posts: 63, likes: 168, followers: 183, impressions: 6358, comments: 23 },
    postPerformance: {
      posts: { facebook: [1, 2], instagram: [3, 4] },
      impressions: [10, 20],
      likes: [1, 2],
      comments: [0, 1],
    },
    breakdowns: {
      posts: {
        total: 63,
        totalChange: "-13.70",
        platforms: { facebook: { value: 25, change: "8.70" }, instagram: { value: 15, change: "-62.50" } },
      },
      impressions: {
        total: 6358,
        totalChange: "-83.10",
        platforms: { facebook: { value: 842, change: "-95.99" }, instagram: { value: 4574, change: "-72.05" } },
      },
      reach: {
        total: 3390,
        totalChange: "-88.11",
        platforms: { facebook: { value: 615, change: "-96.39" }, instagram: { value: 2120, change: "-81.32" } },
      },
      engagement: {
        facebook: { likes: 3, comments: 0, shares: 0, change: "-93.88" },
        instagram: { likes: 160, comments: 22, shares: 6, change: "-2.08" },
      },
    },
    platformTotals: {
      followers: { facebook: { total: 20, series: [10, 10] }, instagram: { total: 163, series: [80, 83] } },
      impressions: { facebook: { total: 842, series: [400, 442] } },
      likes: { instagram: { total: 160, series: [70, 90] } },
    },
    demographics: {
      gender: { totals: { male: { total: 3, percentage: 37.5 }, female: { total: 4, percentage: 50 } } },
      age: { totals: { "25-34": 4 } },
    },
  },
};

describe("previousRange", () => {
  it("is the window of equal length ending just before the current one", () => {
    const prev = previousRange("2026-01-01T00:00:00.000Z", "2026-01-31T00:00:00.000Z");
    expect(prev).toEqual({
      startDate: "2025-12-01T23:59:59.999Z",
      endDate: "2025-12-31T23:59:59.999Z",
    });
  });
});

describe("getSocialStats", () => {
  it("sends every configured profileId, the location as a query parameter, and the date ranges", async () => {
    stub = stubGhl({ [STATS]: RESPONSE });
    await getSocialStats(env, {
      fromDate: "2025-11-17T00:00:00.000Z",
      toDate: "2026-11-16T23:59:59.999Z",
      compareToPrevious: true,
    });

    const call = stub.only();
    expect(call.query.get("locationId")).toBe("loc123");
    expect(call.body).toEqual({
      profileIds: [
        "aaaaaaaaaaaaaaaaaaaaaaa1",
        "aaaaaaaaaaaaaaaaaaaaaaa2",
        "aaaaaaaaaaaaaaaaaaaaaaa3",
        "aaaaaaaaaaaaaaaaaaaaaaa4",
        "aaaaaaaaaaaaaaaaaaaaaaa5",
      ],
      currentRange: { startDate: "2025-11-17T00:00:00.000Z", endDate: "2026-11-16T23:59:59.999Z" },
      prevRange: { startDate: "2024-11-17T00:00:00.000Z", endDate: "2025-11-16T23:59:59.999Z" },
    });
  });

  it("omits prevRange when comparison is off, so GHL makes none", async () => {
    stub = stubGhl({ [STATS]: RESPONSE });
    await getSocialStats(env, {
      fromDate: "2026-01-01T00:00:00.000Z",
      toDate: "2026-02-01T00:00:00.000Z",
      compareToPrevious: false,
    });
    expect(stub.only().body).not.toHaveProperty("prevRange");
  });

  it("sends no ranges at all when no dates are given, leaving GHL's last-7-days default", async () => {
    stub = stubGhl({ [STATS]: RESPONSE });
    await getSocialStats(env, { compareToPrevious: true });
    const body = stub.only().body as Record<string, unknown>;
    expect(body).not.toHaveProperty("currentRange");
    expect(body).not.toHaveProperty("prevRange");
  });

  it("narrows to one platform's accounts", async () => {
    stub = stubGhl({ [STATS]: RESPONSE });
    await getSocialStats(env, { platforms: ["linkedin"], compareToPrevious: false });
    expect((stub.only().body as { profileIds: string[] }).profileIds).toEqual([
      "aaaaaaaaaaaaaaaaaaaaaaa3",
      "aaaaaaaaaaaaaaaaaaaaaaa4",
    ]);
  });

  // The two LinkedIn accounts (company page and personal profile) are only
  // separable by account id; platform alone lumps them together.
  it("narrows to specific accounts by their list_social_accounts id", async () => {
    stub = stubGhl({ [STATS]: RESPONSE });
    await getSocialStats(env, { accountIds: ["li-page"], compareToPrevious: false });
    expect((stub.only().body as { profileIds: string[] }).profileIds).toEqual([
      "aaaaaaaaaaaaaaaaaaaaaaa3",
    ]);
  });

  it("rejects an account id that is not configured", async () => {
    stub = stubGhl({});
    const err = await getSocialStats(env, { accountIds: ["nope"], compareToPrevious: false }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).userMessage).toContain("list_social_accounts");
    expect(stub.calls).toHaveLength(0);
  });

  it("explains, without calling GHL, when the selection has no profileId configured", async () => {
    stub = stubGhl({});
    const err = await getSocialStats(env, { platforms: ["tiktok"], compareToPrevious: false }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).userMessage).toContain("profileId");
    expect(stub.calls).toHaveLength(0);
  });

  it("reshapes the response into totals, per-platform figures and the accounts covered", async () => {
    stub = stubGhl({ [STATS]: RESPONSE });
    const result = await getSocialStats(env, {
      fromDate: "2025-11-17T00:00:00.000Z",
      toDate: "2026-11-16T23:59:59.999Z",
      compareToPrevious: true,
    });

    expect(result.grouping).toBe("monthly");
    expect(result.range).toEqual({ from: "2025-11-17T00:00:00.000Z", to: "2026-11-16T23:59:59.999Z" });
    expect(result.comparedTo).toEqual({
      from: "2024-11-17T00:00:00.000Z",
      to: "2025-11-16T23:59:59.999Z",
    });
    expect(result.totals).toEqual({
      posts: 63,
      impressions: 6358,
      reach: 3390,
      likes: 168,
      comments: 23,
      newFollowers: 183,
    });
    expect(result.changePercent).toEqual({ posts: -13.7, impressions: -83.1, reach: -88.11 });
    expect(result.platforms.instagram).toEqual({
      posts: 15,
      impressions: 4574,
      reach: 2120,
      likes: 160,
      comments: 22,
      shares: 6,
      newFollowers: 163,
      changePercent: { posts: -62.5, impressions: -72.05, reach: -81.32, engagement: -2.08 },
    });
    expect(result.accountsIncluded.map((a) => a.id)).toEqual(["fb-1", "ig-1", "li-page", "li-me", "gbp-1"]);
    expect(result.accountsWithoutStats).toEqual([{ id: "tt-1", platform: "tiktok", name: "TikTok" }]);
    expect(result).not.toHaveProperty("series");
  });

  it("leaves changePercent out when there was no comparison", async () => {
    stub = stubGhl({ [STATS]: RESPONSE });
    const result = await getSocialStats(env, { compareToPrevious: false, fromDate: "2026-01-01", toDate: "2026-02-01" });
    expect(result.comparedTo).toBeNull();
    expect(result).not.toHaveProperty("changePercent");
    expect(result.platforms.instagram).not.toHaveProperty("changePercent");
  });

  it("includes the time series only when asked", async () => {
    stub = stubGhl({ [STATS]: RESPONSE });
    const result = await getSocialStats(env, { compareToPrevious: false, includeSeries: true });
    expect(result.series).toEqual({
      labels: ["Nov 17 - 30", "Dec"],
      postsByPlatform: { facebook: [1, 2], instagram: [3, 4] },
      impressions: [10, 20],
      likes: [1, 2],
      comments: [0, 1],
      newFollowersByPlatform: { facebook: [10, 10], instagram: [80, 83] },
      impressionsByPlatform: { facebook: [400, 442] },
      likesByPlatform: { instagram: [70, 90] },
    });
  });

  it("passes demographics through", async () => {
    stub = stubGhl({ [STATS]: RESPONSE });
    const result = await getSocialStats(env, { compareToPrevious: false });
    expect(result.demographics).toEqual(RESPONSE.results.demographics);
  });

  it("treats a response with no results as an upstream fault, not as zero activity", async () => {
    stub = stubGhl({ [STATS]: { message: "ok" } });
    await expect(getSocialStats(env, { compareToPrevious: false })).rejects.toBeInstanceOf(ToolError);
  });
});
