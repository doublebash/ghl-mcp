import { MAX_RESULT_ITEMS } from "../constants.js";

/**
 * A list result that states its own completeness.
 *
 * A bare array is dangerous here: a caller that asks for stalled deals and gets
 * back 100 of 380 has no way to know it saw a quarter of the pipeline, and will
 * happily summarise it as the whole thing. Wrapping the array forces the count
 * and the truncation flag into the response the model actually reads.
 */
export interface TruncatedList<T> {
  items: T[];
  /** How many items are being returned. */
  returned: number;
  /** How many matched in total, before any trimming. */
  total: number;
  truncated: boolean;
  /** Present only when truncated — plain-language instruction, not just a flag. */
  note?: string;
}

export function truncateList<T>(
  items: T[],
  what: string,
  narrowingHint: string,
  limit: number = MAX_RESULT_ITEMS,
): TruncatedList<T> {
  const total = items.length;
  if (total <= limit) {
    return { items, returned: total, total, truncated: false };
  }
  const kept = items.slice(0, limit);
  return {
    items: kept,
    returned: kept.length,
    total,
    truncated: true,
    note:
      `Showing the first ${kept.length} of ${total} ${what}. ` +
      `This is a partial list — do not describe it as complete or draw totals from it. ` +
      narrowingHint,
  };
}
