import { ghlRequest, GHLEnv } from "./client.js";

export async function getConversationHistory(
  env: GHLEnv,
  contactId: string,
  limit = 20
): Promise<unknown> {
  // Step 1: find the conversation for this contact
  const params = new URLSearchParams({
    locationId: env.GHL_LOCATION_ID,
    contactId,
  });

  const search = await ghlRequest(
    env,
    "GET",
    `/conversations/search?${params}`
  ) as { conversations?: { id: string }[] };

  const conversations = search.conversations ?? [];

  if (conversations.length === 0) {
    return { contactId, conversations: [], messages: [] };
  }

  // Step 2: fetch messages from the most recent conversation
  const conversationId = conversations[0]!.id;

  const msgParams = new URLSearchParams({ limit: String(limit) });

  const msgs = await ghlRequest(
    env,
    "GET",
    `/conversations/${conversationId}/messages?${msgParams}`
  ) as { messages?: unknown };

  return {
    contactId,
    conversationId,
    messages: msgs.messages ?? [],
  };
}
