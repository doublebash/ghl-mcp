import { OPPORTUNITY_PAGE_HARD_CAP } from "../constants.js";

export interface PageFetcher<T> {
  (page: number): Promise<{ items: T[]; hasMore: boolean }>;
}

export async function fetchAllPages<T>(
  fetcher: PageFetcher<T>,
  hardCap: number = OPPORTUNITY_PAGE_HARD_CAP,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  while (all.length < hardCap) {
    const { items, hasMore } = await fetcher(page);
    if (items.length === 0) break;
    all.push(...items);
    if (!hasMore) break;
    page += 1;
  }
  return all.slice(0, hardCap);
}
