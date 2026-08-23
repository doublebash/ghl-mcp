import { describe, expect, it } from "vitest";
import { SERVER_VERSION } from "../../src/constants.js";
import { toolSchemas, type ToolName } from "../../src/mcp/schemas.js";
import { toolDefinitions } from "../../src/mcp/tools.js";
import { daysFromNow } from "../helpers/stubGhl.js";
import pkg from "../../package.json";

const expectedTools: ToolName[] = [
  "search_contacts",
  "get_opportunities",
  "get_opportunity",
  "create_opportunity",
  "update_opportunity",
  "list_workflows",
  "trigger_workflow",
  "get_pipelines",
  "get_upcoming_appointments",
  "get_conversation_history",
  "add_appointment",
  "add_tag",
  "add_task",
  "complete_task",
  "search_tasks",
  "list_tasks",
  "get_task",
  "update_task",
  "delete_task",
  "add_note",
  "list_notes",
  "update_note",
  "delete_note",
  "update_contact",
  "create_contact",
  "get_contact",
  "list_social_accounts",
  "post_to_facebook",
  "post_to_instagram",
  "post_to_youtube",
  "post_to_linkedin",
  "post_to_tiktok",
  "schedule_social_post",
  "list_social_posts",
  "get_social_post",
  "update_social_post",
  "delete_social_post",
];

describe("server metadata", () => {
  // These drifted apart once already — constants said 2.3.0 while package.json
  // said 2.1.0, so the version Claude saw at initialize was not the one shipped.
  it("reports the same version from constants and package.json", () => {
    expect(SERVER_VERSION).toBe(pkg.version);
  });
});

describe("tool catalogue", () => {
  it("declares the expected 37 tools", () => {
    expect(toolDefinitions.length).toBe(expectedTools.length);
    const names = toolDefinitions.map((t) => t.name);
    for (const name of expectedTools) {
      expect(names).toContain(name);
    }
  });

  it("every tool has a non-empty description and an inputSchema with type object", () => {
    for (const t of toolDefinitions) {
      expect(t.description.length).toBeGreaterThan(20);
      const s = t.inputSchema as { type?: string; properties?: unknown };
      expect(s.type).toBe("object");
      expect(s.properties).toBeDefined();
    }
  });
});

describe("argument validation", () => {
  it("rejects a non-string query on search_contacts", () => {
    const result = toolSchemas.search_contacts.safeParse({ query: 42 });
    expect(result.success).toBe(false);
  });

  it("rejects a path-traversal contactId on get_contact", () => {
    const result = toolSchemas.get_contact.safeParse({ contactId: "../workflows" });
    expect(result.success).toBe(false);
  });

  it("rejects an out-of-range daysAhead", () => {
    const result = toolSchemas.get_upcoming_appointments.safeParse({ daysAhead: 1e9 });
    expect(result.success).toBe(false);
  });

  it("rejects a bad opportunity status", () => {
    const result = toolSchemas.update_opportunity.safeParse({
      opportunityId: "abc123",
      status: "Closed",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty tags array on add_tag", () => {
    const result = toolSchemas.add_tag.safeParse({ contactId: "abc123", tags: [] });
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed update_contact", () => {
    const result = toolSchemas.update_contact.safeParse({
      contactId: "abc123",
      firstName: "Test",
      email: "test@example.com",
    });
    expect(result.success).toBe(true);
  });
});

describe("date validation", () => {
  // A non-date used to pass the schema, reach Date.parse as NaN, and filter
  // every result away — the caller saw "no tasks" instead of "that isn't a date".
  it("rejects prose where a date-time is required", () => {
    for (const value of ["next Tuesday", "soon", "2026-13-45T99:99:99Z"]) {
      expect(toolSchemas.search_tasks.safeParse({ dueDateFrom: value }).success).toBe(false);
      expect(
        toolSchemas.add_task.safeParse({ contactId: "c1", title: "x", dueDate: value }).success,
      ).toBe(false);
    }
  });

  it("accepts ISO 8601 with an offset, with Z, and a bare date", () => {
    for (const value of ["2026-08-01T09:00:00+12:00", "2026-08-01T09:00:00Z", "2026-08-01"]) {
      expect(toolSchemas.search_tasks.safeParse({ dueDateFrom: value }).success).toBe(true);
    }
  });

  it("rejects an appointment that ends before it starts", () => {
    const result = toolSchemas.add_appointment.safeParse({
      contactId: "c1",
      title: "Shoot",
      startTime: "2026-08-01T11:00:00+12:00",
      endTime: "2026-08-01T10:00:00+12:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a zero-length appointment", () => {
    const result = toolSchemas.add_appointment.safeParse({
      contactId: "c1",
      title: "Shoot",
      startTime: "2026-08-01T10:00:00+12:00",
      endTime: "2026-08-01T10:00:00+12:00",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a normal appointment", () => {
    const result = toolSchemas.add_appointment.safeParse({
      contactId: "c1",
      title: "Shoot",
      startTime: "2026-08-01T10:00:00+12:00",
      endTime: "2026-08-01T11:30:00+12:00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a backwards due-date window on search_tasks", () => {
    const result = toolSchemas.search_tasks.safeParse({
      dueDateFrom: "2026-08-01T00:00:00Z",
      dueDateTo: "2026-07-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("custom fields", () => {
  it("accepts the GHL [{ id, field_value }] shape", () => {
    const result = toolSchemas.create_contact.safeParse({
      firstName: "Ada",
      customFields: [{ id: "cf1", field_value: "Referral" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a custom field with a traversal id", () => {
    const result = toolSchemas.update_contact.safeParse({
      contactId: "c1",
      customFields: [{ id: "../evil", field_value: "x" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("social posting schemas", () => {
  const media = [{ url: "https://example.com/a.jpg" }];
  // A real account id from the Phase 0 spike: 78 characters, which the standard
  // GHL id pattern (max 64) would reject outright.
  const REAL_ID = "6760e225ec34a09b7bbe13c3_fLBMWEE3c8MDKYcRUrkT_UCUUuWuvLIuWlmoztI1CdzBg_profile";

  it("accepts real account ids, which run past the 64-char GHL id limit", () => {
    expect(REAL_ID.length).toBeGreaterThan(64);
    expect(
      toolSchemas.post_to_facebook.safeParse({
        accountIds: [REAL_ID],
        summary: "hi",
        status: "draft",
      }).success,
    ).toBe(true);
  });

  it("still rejects an account id carrying path traversal", () => {
    expect(
      toolSchemas.post_to_facebook.safeParse({
        accountIds: ["../../accounts"],
        summary: "hi",
        status: "draft",
      }).success,
    ).toBe(false);
  });

  it("requires an explicit status on every posting tool", () => {
    expect(toolSchemas.post_to_facebook.safeParse({ accountIds: ["fb-1"], summary: "hi" }).success).toBe(false);
    expect(
      toolSchemas.post_to_facebook.safeParse({ accountIds: ["fb-1"], summary: "hi", status: "draft" }).success,
    ).toBe(true);
  });

  // Scheduling is schedule_social_post's job, so the posting tools cannot express it.
  it("does not accept 'scheduled' as an authoring status", () => {
    expect(
      toolSchemas.post_to_facebook.safeParse({ accountIds: ["fb-1"], summary: "hi", status: "scheduled" }).success,
    ).toBe(false);
  });

  it("rejects media urls that are not https", () => {
    for (const url of ["http://example.com/a.jpg", "data:image/png;base64,AAAA", "/local/a.jpg"]) {
      expect(
        toolSchemas.post_to_instagram.safeParse({
          accountIds: ["ig-1"],
          summary: "hi",
          status: "draft",
          postType: "post",
          media: [{ url }],
        }).success,
      ).toBe(false);
    }
  });

  it("requires media on instagram, youtube and tiktok but not facebook or linkedin", () => {
    expect(
      toolSchemas.post_to_instagram.safeParse({
        accountIds: ["ig-1"], summary: "hi", status: "draft", postType: "post",
      }).success,
    ).toBe(false);
    expect(toolSchemas.post_to_facebook.safeParse({ accountIds: ["fb-1"], summary: "hi", status: "draft" }).success).toBe(true);
    expect(toolSchemas.post_to_linkedin.safeParse({ accountIds: ["li-1"], summary: "hi", status: "draft" }).success).toBe(true);
  });

  it("requires exactly one video and a bounded title for youtube", () => {
    const base = { accountIds: ["yt-1"], status: "draft" as const, privacy: "private" as const };
    expect(toolSchemas.post_to_youtube.safeParse({ ...base, title: "t", media }).success).toBe(true);
    expect(toolSchemas.post_to_youtube.safeParse({ ...base, title: "t", media: [...media, ...media] }).success).toBe(false);
    expect(toolSchemas.post_to_youtube.safeParse({ ...base, media }).success).toBe(false);
    expect(toolSchemas.post_to_youtube.safeParse({ ...base, title: "x".repeat(101), media }).success).toBe(false);
  });

  it("requires youtube privacy to be stated, never defaulted", () => {
    expect(
      toolSchemas.post_to_youtube.safeParse({ accountIds: ["yt-1"], status: "draft", title: "t", media }).success,
    ).toBe(false);
  });

  it("rejects an empty account list", () => {
    expect(toolSchemas.post_to_facebook.safeParse({ accountIds: [], summary: "hi", status: "draft" }).success).toBe(false);
  });

  it("requires every tiktok interaction setting to be explicit", () => {
    expect(
      toolSchemas.post_to_tiktok.safeParse({
        accountIds: ["tt-1"], summary: "hi", status: "draft", media, privacyLevel: "SELF_ONLY",
      }).success,
    ).toBe(false);
    expect(
      toolSchemas.post_to_tiktok.safeParse({
        accountIds: ["tt-1"], summary: "hi", status: "draft", media,
        privacyLevel: "SELF_ONLY", allowComments: false, allowDuet: false, allowStitch: false,
      }).success,
    ).toBe(true);
  });
});

describe("social lifecycle schemas", () => {
  it("rejects a schedule date in the past", () => {
    expect(
      toolSchemas.schedule_social_post.safeParse({ postId: "p1", scheduleDate: daysFromNow(-1) }).success,
    ).toBe(false);
  });

  it("rejects an unparseable schedule date", () => {
    expect(
      toolSchemas.schedule_social_post.safeParse({ postId: "p1", scheduleDate: "next tuesday" }).success,
    ).toBe(false);
  });

  it("accepts a future ISO 8601 schedule date", () => {
    expect(
      toolSchemas.schedule_social_post.safeParse({ postId: "p1", scheduleDate: daysFromNow(1) }).success,
    ).toBe(true);
  });

  it("requires at least one editable field on update_social_post", () => {
    expect(toolSchemas.update_social_post.safeParse({ postId: "p1" }).success).toBe(false);
    expect(toolSchemas.update_social_post.safeParse({ postId: "p1", summary: "new" }).success).toBe(true);
  });

  // Rescheduling belongs to schedule_social_post; an edit must not move the time.
  it("gives update_social_post no way to express a schedule", () => {
    const result = toolSchemas.update_social_post.safeParse({
      postId: "p1",
      summary: "new",
      scheduleDate: daysFromNow(1),
    });
    expect(result.success).toBe(true);
    if (result.success) expect("scheduleDate" in result.data).toBe(false);
  });

  it("bounds the list limit", () => {
    expect(toolSchemas.list_social_posts.safeParse({ limit: 0 }).success).toBe(false);
    expect(toolSchemas.list_social_posts.safeParse({ limit: 500 }).success).toBe(false);
    expect(toolSchemas.list_social_posts.safeParse({}).success).toBe(true);
    expect(toolSchemas.list_social_posts.safeParse({ status: "draft", platform: "tiktok" }).success).toBe(true);
  });

  it("rejects a post id carrying path traversal", () => {
    expect(toolSchemas.get_social_post.safeParse({ postId: "../accounts" }).success).toBe(false);
    expect(toolSchemas.delete_social_post.safeParse({ postId: "../accounts" }).success).toBe(false);
  });
});
