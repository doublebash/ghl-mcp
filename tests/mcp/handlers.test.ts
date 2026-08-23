import { afterEach, describe, expect, it } from "vitest";
import { dispatchToolCall } from "../../src/mcp/tools.js";
import { stubGhl, TEST_ENV } from "../helpers/stubGhl.js";

let stub: ReturnType<typeof stubGhl>;
afterEach(() => stub?.restore());

describe("dispatch", () => {
  it("rejects an unknown tool", async () => {
    await expect(dispatchToolCall(TEST_ENV, "not_a_tool", {})).rejects.toMatchObject({
      userMessage: "unknown tool",
    });
  });

  it("rejects arguments that fail the schema before any upstream call", async () => {
    stub = stubGhl({});
    await expect(
      dispatchToolCall(TEST_ENV, "get_contact", { contactId: "../workflows" }),
    ).rejects.toMatchObject({ status: 400 });

    expect(stub.calls.length).toBe(0);
  });
});

describe("'me' resolves to the configured GHL user", () => {
  it("on add_task's implicit assignee", async () => {
    stub = stubGhl({ "/contacts/c1/tasks": { task: { id: "t1" } } });
    await dispatchToolCall(TEST_ENV, "add_task", {
      contactId: "c1",
      title: "Follow up",
      dueDate: "2026-08-01T09:00:00+12:00",
    });

    expect(stub.only().body).toMatchObject({ assignedTo: "user456", completed: false });
  });

  it("on search_tasks", async () => {
    stub = stubGhl({ "/locations/loc123/tasks/search": { tasks: [] } });
    await dispatchToolCall(TEST_ENV, "search_tasks", { assignedTo: "me", completed: false });

    expect(stub.only().body).toEqual({ assignedTo: ["user456"], completed: false });
  });

  it("on get_opportunities", async () => {
    stub = stubGhl({
      "/opportunities/search": { opportunities: [], meta: { nextPageUrl: null } },
    });
    await dispatchToolCall(TEST_ENV, "get_opportunities", { assignedTo: "me" });

    expect(stub.only().query.get("assigned_to")).toBe("user456");
  });

  it("leaves a real user id untouched", async () => {
    stub = stubGhl({ "/locations/loc123/tasks/search": { tasks: [] } });
    await dispatchToolCall(TEST_ENV, "search_tasks", { assignedTo: "someoneElse99" });

    expect(stub.only().body).toEqual({ assignedTo: ["someoneElse99"] });
  });
});

describe("partial updates send only what was supplied", () => {
  it("update_contact omits fields the caller left out", async () => {
    stub = stubGhl({ "/contacts/c1": { contact: { id: "c1" } } });
    await dispatchToolCall(TEST_ENV, "update_contact", { contactId: "c1", phone: "+64211234567" });

    const call = stub.only();
    expect(call.method).toBe("PUT");
    expect(call.body).toEqual({ phone: "+64211234567" });
  });

  it("update_contact never forwards contactId in the body", async () => {
    stub = stubGhl({ "/contacts/c1": { contact: { id: "c1" } } });
    await dispatchToolCall(TEST_ENV, "update_contact", { contactId: "c1", firstName: "Sam" });

    expect(stub.only().body).not.toHaveProperty("contactId");
  });

  it("update_task omits the completed flag — complete_task owns that", async () => {
    stub = stubGhl({ "/contacts/c1/tasks/t1": { task: { id: "t1" } } });
    await dispatchToolCall(TEST_ENV, "update_task", {
      contactId: "c1",
      taskId: "t1",
      title: "Renamed",
    });

    expect(stub.only().body).toEqual({ title: "Renamed" });
  });

  it("update_opportunity renames stageId to GHL's pipelineStageId", async () => {
    stub = stubGhl({ "/opportunities/o1": { opportunity: { id: "o1" } } });
    await dispatchToolCall(TEST_ENV, "update_opportunity", {
      opportunityId: "o1",
      stageId: "stage9",
    });

    expect(stub.only().body).toEqual({ pipelineStageId: "stage9" });
  });
});

describe("creates carry the configured location", () => {
  it("create_contact attaches locationId and custom fields", async () => {
    stub = stubGhl({ "/contacts/": { contact: { id: "new" } } });
    await dispatchToolCall(TEST_ENV, "create_contact", {
      firstName: "Ada",
      email: "ada@example.com",
      customFields: [{ id: "cf1", field_value: "Referral" }],
    });

    expect(stub.only().body).toEqual({
      firstName: "Ada",
      email: "ada@example.com",
      customFields: [{ id: "cf1", field_value: "Referral" }],
      locationId: "loc123",
    });
  });

  it("create_opportunity defaults status to open and keeps required fields", async () => {
    stub = stubGhl({ "/opportunities/": { opportunity: { id: "o1" } } });
    await dispatchToolCall(TEST_ENV, "create_opportunity", {
      name: "Spring shoot",
      pipelineId: "p1",
      stageId: "s1",
      contactId: "c1",
    });

    expect(stub.only().body).toEqual({
      name: "Spring shoot",
      pipelineId: "p1",
      pipelineStageId: "s1",
      contactId: "c1",
      locationId: "loc123",
      status: "open",
    });
  });
});

describe("list results declare their own completeness", () => {
  it("search_contacts wraps results and defaults the page size", async () => {
    stub = stubGhl({ "/contacts/": { contacts: [{ id: "c1" }, { id: "c2" }] } });
    const result = (await dispatchToolCall(TEST_ENV, "search_contacts", { query: "sam" })) as {
      items: unknown[];
      total: number;
      truncated: boolean;
    };

    expect(result.items.length).toBe(2);
    expect(result.total).toBe(2);
    expect(result.truncated).toBe(false);
    expect(stub.only().query.get("limit")).toBe("25");
  });

  it("search_contacts forwards an explicit limit and skip to GHL", async () => {
    stub = stubGhl({ "/contacts/": { contacts: [] } });
    await dispatchToolCall(TEST_ENV, "search_contacts", { query: "sam", limit: 50, skip: 100 });

    const call = stub.only();
    expect(call.query.get("limit")).toBe("50");
    expect(call.query.get("skip")).toBe("100");
  });

  it("get_opportunities trims a large pipeline and says so", async () => {
    stub = stubGhl({
      "/opportunities/search": {
        opportunities: Array.from({ length: 380 }, (_, i) => ({ id: `o${i}` })),
        meta: { nextPageUrl: null },
      },
    });
    const result = (await dispatchToolCall(TEST_ENV, "get_opportunities", {})) as {
      items: unknown[];
      returned: number;
      total: number;
      truncated: boolean;
      note?: string;
    };

    expect(result.returned).toBe(100);
    expect(result.total).toBe(380);
    expect(result.truncated).toBe(true);
    expect(result.note).toContain("partial");
  });

  it("search_tasks wraps its results too", async () => {
    stub = stubGhl({ "/locations/loc123/tasks/search": { tasks: [{ id: "t1" }] } });
    const result = (await dispatchToolCall(TEST_ENV, "search_tasks", {})) as {
      items: unknown[];
      truncated: boolean;
    };

    expect(result.items.length).toBe(1);
    expect(result.truncated).toBe(false);
  });
});

describe("upstream failures surface as safe errors", () => {
  it("get_contact reports not-found without echoing the GHL body", async () => {
    stub = stubGhl({ "/contacts/missing": () => new Response("{}", { status: 200 }) });

    await expect(
      dispatchToolCall(TEST_ENV, "get_contact", { contactId: "missing" }),
    ).rejects.toMatchObject({ userMessage: "contact not found" });
  });

  it("a 403 from GHL does not leak the response body to the caller", async () => {
    stub = stubGhl({
      "/contacts/c1": () =>
        new Response(JSON.stringify({ message: "token sk-live-secret lacks scope" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
    });

    await expect(
      dispatchToolCall(TEST_ENV, "get_contact", { contactId: "c1" }),
    ).rejects.toMatchObject({ userMessage: "GHL error 403: forbidden" });
  });
});

describe("list_social_accounts", () => {
  const CONFIGURED = [
    { id: "672026bf28227a4ad848c4c9_loc123_110529568590140_page", platform: "facebook", name: "Page" },
    { id: "6760e225ec34a09b7bbe13c3_loc123_UCUUuWuvLIuWlmoztI1CdzBg_profile", platform: "youtube", name: "Channel" },
    { id: "tw-1", platform: "twitter", name: "@x" },
  ];
  const env = { ...TEST_ENV, GHL_SOCIAL_ACCOUNTS: JSON.stringify(CONFIGURED) };

  it("returns a completeness-reporting list without any upstream call", async () => {
    stub = stubGhl({});
    const result = (await dispatchToolCall(env, "list_social_accounts", {})) as {
      items: { id: string; platform: string; supported: boolean }[];
      returned: number;
      total: number;
      truncated: boolean;
    };

    expect(stub.calls).toHaveLength(0);
    expect(result.returned).toBe(3);
    expect(result.total).toBe(3);
    expect(result.truncated).toBe(false);
    expect(result.items.map((a) => a.platform)).toEqual(["facebook", "youtube", "twitter"]);
    // Connected in GHL, but this server has no post_to_twitter tool.
    expect(result.items.find((a) => a.id === "tw-1")?.supported).toBe(false);
  });

  it("surfaces a configuration error rather than an empty list when unset", async () => {
    stub = stubGhl({});
    await expect(
      dispatchToolCall({ ...TEST_ENV, GHL_SOCIAL_ACCOUNTS: "" }, "list_social_accounts", {}),
    ).rejects.toMatchObject({ status: 500 });
  });
});
