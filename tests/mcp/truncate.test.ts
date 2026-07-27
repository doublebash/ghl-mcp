import { describe, expect, it } from "vitest";
import { truncateList } from "../../src/mcp/truncate.js";

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${i}` }));

describe("truncateList", () => {
  it("passes a small list through untouched and marks it complete", () => {
    const result = truncateList(items(3), "things", "hint", 100);

    expect(result.items.length).toBe(3);
    expect(result.returned).toBe(3);
    expect(result.total).toBe(3);
    expect(result.truncated).toBe(false);
    expect(result.note).toBeUndefined();
  });

  it("does not truncate a list sitting exactly on the limit", () => {
    const result = truncateList(items(100), "things", "hint", 100);

    expect(result.truncated).toBe(false);
    expect(result.returned).toBe(100);
  });

  it("trims past the limit and keeps the true total", () => {
    const result = truncateList(items(380), "opportunities", "hint", 100);

    expect(result.items.length).toBe(100);
    expect(result.returned).toBe(100);
    expect(result.total).toBe(380);
    expect(result.truncated).toBe(true);
  });

  it("keeps the first N, so upstream ordering still means something", () => {
    const result = truncateList(items(150), "things", "hint", 2);
    expect(result.items.map((i) => i.id)).toEqual(["i0", "i1"]);
  });

  // The note is the whole point: a bare `truncated: true` is easy to skip past,
  // whereas an explicit instruction is read as part of the result.
  it("states both counts and warns against treating it as complete", () => {
    const result = truncateList(items(380), "opportunities", "Filter by pipelineId.", 100);

    expect(result.note).toContain("100");
    expect(result.note).toContain("380");
    expect(result.note).toContain("opportunities");
    expect(result.note?.toLowerCase()).toContain("partial");
    expect(result.note).toContain("Filter by pipelineId.");
  });

  it("handles an empty list without claiming truncation", () => {
    const result = truncateList([], "things", "hint");
    expect(result).toEqual({ items: [], returned: 0, total: 0, truncated: false });
  });
});
