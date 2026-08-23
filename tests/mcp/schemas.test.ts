import { describe, expect, it } from "vitest";
import { SERVER_VERSION } from "../../src/constants.js";
import { toolSchemas, type ToolName } from "../../src/mcp/schemas.js";
import { toolDefinitions } from "../../src/mcp/tools.js";
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
];

describe("server metadata", () => {
  // These drifted apart once already — constants said 2.3.0 while package.json
  // said 2.1.0, so the version Claude saw at initialize was not the one shipped.
  it("reports the same version from constants and package.json", () => {
    expect(SERVER_VERSION).toBe(pkg.version);
  });
});

describe("tool catalogue", () => {
  it("declares the expected 27 tools", () => {
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
