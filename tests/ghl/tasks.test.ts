import { afterEach, describe, expect, it } from "vitest";
import { searchTasks, updateNote } from "../../src/ghl/contacts.js";
import { stubGhl, TEST_ENV } from "../helpers/stubGhl.js";

let stub: ReturnType<typeof stubGhl>;
afterEach(() => stub?.restore());

const SEARCH_PATH = "/locations/loc123/tasks/search";

describe("searchTasks request shape", () => {
  it("posts to the location namespace and wraps id filters in arrays", async () => {
    stub = stubGhl({ [SEARCH_PATH]: { tasks: [] } });
    await searchTasks(TEST_ENV, { contactId: "c1", assignedTo: "user456", completed: false });

    const call = stub.only();
    expect(call.method).toBe("POST");
    expect(call.body).toEqual({
      completed: false,
      contactId: ["c1"],
      assignedTo: ["user456"],
    });
  });

  it("omits filters the caller did not set", async () => {
    stub = stubGhl({ [SEARCH_PATH]: { tasks: [] } });
    await searchTasks(TEST_ENV, { query: "invoice" });

    expect(stub.only().body).toEqual({ query: "invoice" });
  });

  it("does not send due-date filters upstream — GHL has no such parameter", async () => {
    stub = stubGhl({ [SEARCH_PATH]: { tasks: [] } });
    await searchTasks(TEST_ENV, {
      dueDateFrom: "2026-07-01T00:00:00Z",
      dueDateTo: "2026-07-31T00:00:00Z",
    });

    expect(stub.only().body).toEqual({});
  });
});

describe("searchTasks response normalisation", () => {
  it("maps Mongo-style _id onto id", async () => {
    stub = stubGhl({
      [SEARCH_PATH]: { tasks: [{ _id: "abc", title: "Call back" }] },
    });

    const [task] = await searchTasks(TEST_ENV, {});
    expect(task?.id).toBe("abc");
  });

  it("leaves an existing id alone", async () => {
    stub = stubGhl({
      [SEARCH_PATH]: { tasks: [{ id: "real", _id: "shadow" }] },
    });

    const [task] = await searchTasks(TEST_ENV, {});
    expect(task?.id).toBe("real");
  });

  it("returns an empty array when GHL omits `tasks`", async () => {
    stub = stubGhl({ [SEARCH_PATH]: {} });
    await expect(searchTasks(TEST_ENV, {})).resolves.toEqual([]);
  });
});

describe("searchTasks client-side due-date window", () => {
  const tasks = [
    { id: "early", dueDate: "2026-07-01T00:00:00Z" },
    { id: "mid", dueDate: "2026-07-15T00:00:00Z" },
    { id: "late", dueDate: "2026-08-20T00:00:00Z" },
    { id: "undated" },
  ];

  it("returns everything, including undated tasks, when no window is given", async () => {
    stub = stubGhl({ [SEARCH_PATH]: { tasks } });
    const result = await searchTasks(TEST_ENV, {});

    expect(result.map((t) => t.id)).toEqual(["early", "mid", "late", "undated"]);
  });

  it("narrows to the window and drops undated tasks", async () => {
    stub = stubGhl({ [SEARCH_PATH]: { tasks } });
    const result = await searchTasks(TEST_ENV, {
      dueDateFrom: "2026-07-10T00:00:00Z",
      dueDateTo: "2026-07-31T00:00:00Z",
    });

    expect(result.map((t) => t.id)).toEqual(["mid"]);
  });

  it("treats a lone dueDateFrom as an open-ended window", async () => {
    stub = stubGhl({ [SEARCH_PATH]: { tasks } });
    const result = await searchTasks(TEST_ENV, { dueDateFrom: "2026-07-10T00:00:00Z" });

    expect(result.map((t) => t.id)).toEqual(["mid", "late"]);
  });

  it("skips tasks whose stored dueDate is unparseable", async () => {
    stub = stubGhl({
      [SEARCH_PATH]: { tasks: [{ id: "bad", dueDate: "whenever" }, ...tasks] },
    });
    const result = await searchTasks(TEST_ENV, { dueDateFrom: "2026-01-01T00:00:00Z" });

    expect(result.map((t) => t.id)).not.toContain("bad");
  });
});

describe("updateNote", () => {
  it("sends only the body, leaving the original author intact", async () => {
    stub = stubGhl({ "/contacts/c1/notes/n1": { note: { id: "n1", body: "edited" } } });
    await updateNote(TEST_ENV, "c1", "n1", "edited");

    const call = stub.only();
    expect(call.method).toBe("PUT");
    expect(call.body).toEqual({ body: "edited" });
    expect(call.body).not.toHaveProperty("userId");
  });
});
