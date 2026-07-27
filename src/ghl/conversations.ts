import { MAX_MERGED_CONVERSATIONS } from "../constants.js";
import type { GHLApiEnv } from "../env.js";
import { ghlFetch } from "./client.js";
import { buildPath } from "./path.js";
import type { Message } from "./types.js";

export interface ConversationHistory {
  contactId: string;
  /** The most recently active thread — kept for callers that only want one id. */
  conversationId?: string;
  /** Every thread the messages were drawn from, most recently active first. */
  conversationIds: string[];
  /** Threads this contact has in total, including any beyond the merge cap. */
  conversationCount: number;
  /** True when the contact has more threads than were merged into `messages`. */
  truncated: boolean;
  messages: Message[];
}

interface ConversationRef {
  id: string;
  lastMessageDate?: string | number;
  dateUpdated?: string | number;
}

/** Newest activity first; anything undated sorts last rather than jumping the queue. */
function activityTime(c: ConversationRef): number {
  const raw = c.lastMessageDate ?? c.dateUpdated;
  if (raw === undefined) return -Infinity;
  const t = typeof raw === "number" ? raw : Date.parse(raw);
  return Number.isFinite(t) ? t : -Infinity;
}

function messageTime(m: Message): number {
  if (!m.dateAdded) return -Infinity;
  const t = Date.parse(m.dateAdded);
  return Number.isFinite(t) ? t : -Infinity;
}

/**
 * A GHL contact routinely has more than one conversation — SMS and email are
 * separate threads. Reading only the first one silently hides half the history,
 * which is worst exactly when the question is "what did we last say to this
 * person". Merge the most recently active threads, newest message first, and
 * report whether anything was left out.
 */
export async function getConversationHistory(
  env: GHLApiEnv,
  contactId: string,
  limit: number,
): Promise<ConversationHistory> {
  const search = await ghlFetch<{ conversations?: ConversationRef[] }>(env, {
    method: "GET",
    path: "/conversations/search",
    query: { locationId: env.GHL_LOCATION_ID, contactId },
  });

  const conversations = (search?.conversations ?? []).filter((c) => typeof c?.id === "string");
  if (conversations.length === 0) {
    return {
      contactId,
      conversationIds: [],
      conversationCount: 0,
      truncated: false,
      messages: [],
    };
  }

  const ordered = [...conversations].sort((a, b) => activityTime(b) - activityTime(a));
  const selected = ordered.slice(0, MAX_MERGED_CONVERSATIONS);

  // Bounded fan-out: at most MAX_MERGED_CONVERSATIONS subrequests, issued
  // together so extra threads cost latency once rather than once each.
  const pages = await Promise.all(
    selected.map(async (c) => {
      const msgs = await ghlFetch<{ messages?: Message[] }>(env, {
        method: "GET",
        path: buildPath("/conversations/{conversationId}/messages", { conversationId: c.id }),
        query: { limit },
      });
      // Tag each message so a merged transcript still shows which thread it came from.
      return (msgs?.messages ?? []).map((m) => ({ ...m, conversationId: c.id }));
    }),
  );

  const messages = pages
    .flat()
    .sort((a, b) => messageTime(b) - messageTime(a))
    .slice(0, limit);

  const firstId = selected[0]?.id;
  return {
    contactId,
    ...(firstId !== undefined ? { conversationId: firstId } : {}),
    conversationIds: selected.map((c) => c.id),
    conversationCount: ordered.length,
    truncated: ordered.length > selected.length,
    messages,
  };
}
