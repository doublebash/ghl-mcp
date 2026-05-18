import type { GHLApiEnv } from "../env.js";
import { ghlFetch } from "./client.js";
import { buildPath } from "./path.js";
import type { Message } from "./types.js";

export interface ConversationHistory {
  contactId: string;
  conversationId?: string;
  messages: Message[];
}

export async function getConversationHistory(
  env: GHLApiEnv,
  contactId: string,
  limit: number,
): Promise<ConversationHistory> {
  const search = await ghlFetch<{ conversations?: { id: string }[] }>(env, {
    method: "GET",
    path: "/conversations/search",
    query: { locationId: env.GHL_LOCATION_ID, contactId },
  });

  const conversations = search?.conversations ?? [];
  if (conversations.length === 0) {
    return { contactId, messages: [] };
  }

  const conversationId = conversations[0]!.id;
  const msgs = await ghlFetch<{ messages?: Message[] }>(env, {
    method: "GET",
    path: buildPath("/conversations/{conversationId}/messages", { conversationId }),
    query: { limit },
  });

  return {
    contactId,
    conversationId,
    messages: msgs?.messages ?? [],
  };
}
