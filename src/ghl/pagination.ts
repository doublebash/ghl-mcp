import { OPPORTUNITY_MAX_PAGES, OPPORTUNITY_PAGE_HARD_CAP } from "../constants.js";

export interface PageFetcher<T> {
  (page: number): Promise<{ items: T[]; hasMore: boolean }>;
}

export interface FetchAllPagesOptions {
  /** Stop once this many records are collected. */
  hardCap?: number;
  /** Stop after this many upstream requests, whatever the record count. */
  maxPages?: number;
}

/**
 * Walk a paginated upstream endpoint until it runs out, we have enough records,
 * or we have spent our request budget.
 *
 * The page cap is not redundant with the record cap. A record cap alone assumes
 * pages are reasonably full — if the upstream returns two records a page, 500
 * records means 250 sequential round-trips, which burns the Worker's subrequest
 * budget and its wall clock on a single tool call.
 */
export async function fetchAllPages<T>(
  fetcher: PageFetcher<T>,
  options: FetchAllPagesOptions | number = {},
): Promise<T[]> {
  // Numeric form kept so existing callers passing a bare hard cap still work.
  const opts = typeof options === "number" ? { hardCap: options } : options;
  const hardCap = opts.hardCap ?? OPPORTUNITY_PAGE_HARD_CAP;
  const maxPages = opts.maxPages ?? OPPORTUNITY_MAX_PAGES;

  const all: T[] = [];
  let page = 1;
  while (all.length < hardCap && page <= maxPages) {
    const { items, hasMore } = await fetcher(page);
    if (items.length === 0) break;
    all.push(...items);
    if (!hasMore) break;
    page += 1;
  }
  return all.slice(0, hardCap);
}
