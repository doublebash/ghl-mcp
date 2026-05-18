import { describe, expect, it } from "vitest";
import { toolSchemas, type ToolName } from "../../src/mcp/schemas.js";
import { toolDefinitions } from "../../src/mcp/tools.js";

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
  "add_note",
  "list_notes",
  "update_note",
  "delete_note",
  "update_contact",
  "create_contact",
  "get_contact",
];

describe("tool catalogue", () => {
  it("declares the expected 20 tools", () => {
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
