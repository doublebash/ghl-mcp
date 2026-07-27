import { afterEach, describe, expect, it } from "vitest";
import { getConversationHistory } from "../../src/ghl/conversations.js";
import { stubGhl, TEST_ENV } from "../helpers/stubGhl.js";

let stub: ReturnType<typeof stubGhl>;
afterEach(() => stub?.restore());

const at = (iso: string) => new Date(iso).toISOString();

describe("getConversationHistory", () => {
  it("merges a contact's SMS and email threads instead of reading only one", async () => {
    stub = stubGhl({
      "/conversations/search": {
        conversations: [
          { id: "sms", lastMessageDate: at("2026-07-20T10:00:00Z") },
          { id: "email", lastMessageDate: at("2026-07-25T10:00:00Z") },
        ],
      },
      "/conversations/sms/messages": {
        messages: [{ id: "m-sms", body: "text me", dateAdded: at("2026-07-20T10:00:00Z") }],
      },
      "/conversations/email/messages": {
        messages: [{ id: "m-email", body: "emailed you", dateAdded: at("2026-07-25T10:00:00Z") }],
      },
    });

    const result = await getConversationHistory(TEST_ENV, "c1", 20);

    expect(result.messages.map((m) => m.id)).toEqual(["m-email", "m-sms"]);
    expect(result.conversationCount).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("orders threads by most recent activity and reports the newest as conversationId", async () => {
    stub = stubGhl({
      "/conversations/search": {
        conversations: [
          { id: "stale", lastMessageDate: at("2025-01-01T00:00:00Z") },
          { id: "fresh", lastMessageDate: at("2026-07-26T00:00:00Z") },
        ],
      },
      "/conversations/stale/messages": { messages: [] },
      "/conversations/fresh/messages": { messages: [] },
    });

    const result = await getConversationHistory(TEST_ENV, "c1", 20);

    expect(result.conversationId).toBe("fresh");
    expect(result.conversationIds).toEqual(["fresh", "stale"]);
  });

  it("tags each message with the thread it came from", async () => {
    stub = stubGhl({
      "/conversations/search": { conversations: [{ id: "sms" }, { id: "email" }] },
      "/conversations/sms/messages": { messages: [{ id: "a" }] },
      "/conversations/email/messages": { messages: [{ id: "b" }] },
    });

    const result = await getConversationHistory(TEST_ENV, "c1", 20);
    const byId = Object.fromEntries(result.messages.map((m) => [m.id, m.conversationId]));

    expect(byId).toEqual({ a: "sms", b: "email" });
  });

  it("caps the fan-out at 3 threads and flags the rest as truncated", async () => {
    stub = stubGhl({
      "/conversations/search": {
        conversations: ["a", "b", "c", "d", "e"].map((id, i) => ({
          id,
          lastMessageDate: at(`2026-07-0${i + 1}T00:00:00Z`),
        })),
      },
      "/conversations/e/messages": { messages: [] },
      "/conversations/d/messages": { messages: [] },
      "/conversations/c/messages": { messages: [] },
    });

    const result = await getConversationHistory(TEST_ENV, "c1", 20);

    // 1 search + 3 message fetches, not 1 + 5.
    expect(stub.calls.length).toBe(4);
    expect(result.conversationIds).toEqual(["e", "d", "c"]);
    expect(result.conversationCount).toBe(5);
    expect(result.truncated).toBe(true);
  });

  it("applies the limit across the merged timeline, keeping the newest", async () => {
    stub = stubGhl({
      "/conversations/search": { conversations: [{ id: "x" }, { id: "y" }] },
      "/conversations/x/messages": {
        messages: [
          { id: "old", dateAdded: at("2026-01-01T00:00:00Z") },
          { id: "newest", dateAdded: at("2026-07-26T00:00:00Z") },
        ],
      },
      "/conversations/y/messages": {
        messages: [{ id: "middle", dateAdded: at("2026-05-01T00:00:00Z") }],
      },
    });

    const result = await getConversationHistory(TEST_ENV, "c1", 2);

    expect(result.messages.map((m) => m.id)).toEqual(["newest", "middle"]);
  });

  it("returns an empty history without fetching messages when there are no threads", async () => {
    stub = stubGhl({ "/conversations/search": { conversations: [] } });
    const result = await getConversationHistory(TEST_ENV, "c1", 20);

    expect(result).toEqual({
      contactId: "c1",
      conversationIds: [],
      conversationCount: 0,
      truncated: false,
      messages: [],
    });
    expect(stub.calls.length).toBe(1);
  });

  it("ignores malformed conversation entries with no id", async () => {
    stub = stubGhl({
      "/conversations/search": { conversations: [{ notAnId: true }, { id: "real" }] },
      "/conversations/real/messages": { messages: [{ id: "m" }] },
    });

    const result = await getConversationHistory(TEST_ENV, "c1", 20);
    expect(result.conversationIds).toEqual(["real"]);
  });
});
