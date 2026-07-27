import { afterEach, describe, expect, it } from "vitest";
import { getOpportunities } from "../../src/ghl/opportunities.js";
import { fetchAllPages } from "../../src/ghl/pagination.js";
import { daysFromNow, stubGhl, TEST_ENV } from "../helpers/stubGhl.js";

let stub: ReturnType<typeof stubGhl>;
afterEach(() => stub?.restore());

const SEARCH = "/opportunities/search";

/** A page of `n` opportunities, with a nextPageUrl unless it's the last. */
function page(ids: string[], hasNext: boolean, extra: Record<string, unknown> = {}) {
  return {
    opportunities: ids.map((id) => ({ id, ...extra })),
    meta: { nextPageUrl: hasNext ? "https://example.com/next" : null },
  };
}

describe("pagination", () => {
  it("walks every page until nextPageUrl is null", async () => {
    stub = stubGhl({
      [SEARCH]: (call) => {
        const p = Number(call.query.get("page"));
        if (p === 1) return page(["a", "b"], true);
        if (p === 2) return page(["c"], true);
        return page(["d"], false);
      },
    });

    const result = await getOpportunities(TEST_ENV);
    expect(result.map((o) => o.id)).toEqual(["a", "b", "c", "d"]);
    expect(stub.calls.length).toBe(3);
  });

  it("stops on an empty page even if GHL still claims there is a next one", async () => {
    stub = stubGhl({
      [SEARCH]: (call) =>
        Number(call.query.get("page")) === 1 ? page(["a"], true) : page([], true),
    });

    const result = await getOpportunities(TEST_ENV);
    expect(result.map((o) => o.id)).toEqual(["a"]);
    expect(stub.calls.length).toBe(2);
  });

  it("honours the hard cap rather than paging forever", async () => {
    let fetched = 0;
    const all = await fetchAllPages<{ id: number }>(async () => {
      fetched += 1;
      return { items: [{ id: fetched }], hasMore: true };
    }, 5);

    expect(all.length).toBe(5);
    expect(fetched).toBe(5);
  });

  // A record cap alone assumes pages are reasonably full. With tiny pages it
  // would allow hundreds of sequential round-trips inside one tool call.
  it("stops at the page budget even when far short of the record cap", async () => {
    let requests = 0;
    const all = await fetchAllPages<{ id: number }>(
      async () => {
        requests += 1;
        return { items: [{ id: requests }], hasMore: true };
      },
      { hardCap: 500, maxPages: 25 },
    );

    expect(requests).toBe(25);
    expect(all.length).toBe(25);
  });

  it("still accepts a bare numeric hard cap from older callers", async () => {
    const all = await fetchAllPages<{ id: number }>(
      async (page) => ({ items: [{ id: page }], hasMore: page < 3 }),
      10,
    );
    expect(all.map((o) => o.id)).toEqual([1, 2, 3]);
  });

  it("passes filters through as GHL's snake_case query parameters", async () => {
    stub = stubGhl({ [SEARCH]: page([], false) });
    await getOpportunities(TEST_ENV, {
      pipelineId: "pipe1",
      stageId: "stage2",
      status: "open",
      assignedTo: "user456",
    });

    const call = stub.only();
    expect(call.query.get("location_id")).toBe("loc123");
    expect(call.query.get("pipeline_id")).toBe("pipe1");
    expect(call.query.get("pipeline_stage_id")).toBe("stage2");
    expect(call.query.get("status")).toBe("open");
    expect(call.query.get("assigned_to")).toBe("user456");
  });
});

describe("client-side value filters", () => {
  const deals = {
    opportunities: [
      { id: "small", monetaryValue: 100 },
      { id: "medium", monetaryValue: 5000 },
      { id: "large", monetaryValue: 50000 },
      { id: "unvalued" },
    ],
    meta: { nextPageUrl: null },
  };

  it("filters by minValue, treating a missing value as zero", async () => {
    stub = stubGhl({ [SEARCH]: deals });
    const result = await getOpportunities(TEST_ENV, { minValue: 1000 });

    expect(result.map((o) => o.id)).toEqual(["medium", "large"]);
  });

  it("filters by a min/max band", async () => {
    stub = stubGhl({ [SEARCH]: deals });
    const result = await getOpportunities(TEST_ENV, { minValue: 1000, maxValue: 10000 });

    expect(result.map((o) => o.id)).toEqual(["medium"]);
  });
});

describe("staleDays", () => {
  it("keeps only deals whose last activity predates the cutoff", async () => {
    stub = stubGhl({
      [SEARCH]: {
        opportunities: [
          { id: "quiet", lastActivityDate: daysFromNow(-120) },
          { id: "active", lastActivityDate: daysFromNow(-3) },
        ],
        meta: { nextPageUrl: null },
      },
    });

    const result = await getOpportunities(TEST_ENV, { staleDays: 90 });
    expect(result.map((o) => o.id)).toEqual(["quiet"]);
  });

  it("falls back through updatedAt and createdAt", async () => {
    stub = stubGhl({
      [SEARCH]: {
        opportunities: [
          { id: "by-updated", updatedAt: daysFromNow(-120) },
          { id: "by-created", createdAt: daysFromNow(-200) },
          { id: "recent-update", updatedAt: daysFromNow(-1) },
        ],
        meta: { nextPageUrl: null },
      },
    });

    const result = await getOpportunities(TEST_ENV, { staleDays: 90 });
    expect(result.map((o) => o.id)).toEqual(["by-updated", "by-created"]);
  });

  it("excludes deals with no date at all rather than calling them stale", async () => {
    stub = stubGhl({
      [SEARCH]: {
        opportunities: [{ id: "undated" }, { id: "quiet", lastActivityDate: daysFromNow(-120) }],
        meta: { nextPageUrl: null },
      },
    });

    const result = await getOpportunities(TEST_ENV, { staleDays: 90 });
    expect(result.map((o) => o.id)).toEqual(["quiet"]);
  });

  it("excludes deals whose date is unparseable", async () => {
    stub = stubGhl({
      [SEARCH]: {
        opportunities: [{ id: "junk", lastActivityDate: "ages ago" }],
        meta: { nextPageUrl: null },
      },
    });

    await expect(getOpportunities(TEST_ENV, { staleDays: 90 })).resolves.toEqual([]);
  });
});
