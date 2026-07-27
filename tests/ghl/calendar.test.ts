import { afterEach, describe, expect, it } from "vitest";
import { getUpcomingAppointments } from "../../src/ghl/calendar.js";
import { daysFromNow, stubGhl, TEST_ENV } from "../helpers/stubGhl.js";

let stub: ReturnType<typeof stubGhl>;
afterEach(() => stub?.restore());

describe("getUpcomingAppointments for a single contact", () => {
  // The per-contact GHL endpoint has no date parameters and returns the
  // contact's whole history, so the window has to be enforced client-side.
  const appointments = [
    { id: "past", title: "Last year's shoot", startTime: daysFromNow(-400) },
    { id: "yesterday", title: "Yesterday", startTime: daysFromNow(-1) },
    { id: "soon", title: "Tomorrow", startTime: daysFromNow(1) },
    { id: "later", title: "In three weeks", startTime: daysFromNow(21) },
    { id: "beyond", title: "In six months", startTime: daysFromNow(180) },
    { id: "undated", title: "No start time" },
  ];

  it("excludes past appointments", async () => {
    stub = stubGhl({ "/contacts/c1/appointments": { appointments } });
    const result = await getUpcomingAppointments(TEST_ENV, { contactId: "c1", daysAhead: 30 });

    expect(result.map((a) => a.id)).toEqual(["soon", "later"]);
  });

  it("honours daysAhead rather than ignoring it", async () => {
    stub = stubGhl({ "/contacts/c1/appointments": { appointments } });
    const result = await getUpcomingAppointments(TEST_ENV, { contactId: "c1", daysAhead: 365 });

    expect(result.map((a) => a.id)).toEqual(["soon", "later", "beyond"]);
  });

  it("drops entries with no parseable start time", async () => {
    stub = stubGhl({
      "/contacts/c1/appointments": {
        appointments: [{ id: "junk", startTime: "sometime next week" }, ...appointments],
      },
    });
    const result = await getUpcomingAppointments(TEST_ENV, { contactId: "c1", daysAhead: 30 });

    expect(result.map((a) => a.id)).not.toContain("junk");
    expect(result.map((a) => a.id)).not.toContain("undated");
  });

  it("returns them earliest first", async () => {
    stub = stubGhl({
      "/contacts/c1/appointments": {
        appointments: [
          { id: "c", startTime: daysFromNow(10) },
          { id: "a", startTime: daysFromNow(2) },
          { id: "b", startTime: daysFromNow(5) },
        ],
      },
    });
    const result = await getUpcomingAppointments(TEST_ENV, { contactId: "c1", daysAhead: 30 });

    expect(result.map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("tolerates the endpoint answering with `events` instead of `appointments`", async () => {
    stub = stubGhl({
      "/contacts/c1/appointments": { events: [{ id: "e1", startTime: daysFromNow(3) }] },
    });
    const result = await getUpcomingAppointments(TEST_ENV, { contactId: "c1", daysAhead: 30 });

    expect(result.map((a) => a.id)).toEqual(["e1"]);
  });

  it("returns an empty list, not an error, when the contact has none", async () => {
    stub = stubGhl({ "/contacts/c1/appointments": {} });
    await expect(
      getUpcomingAppointments(TEST_ENV, { contactId: "c1", daysAhead: 30 }),
    ).resolves.toEqual([]);
  });
});

describe("getUpcomingAppointments across the calendar", () => {
  it("asks GHL for the window directly and passes the configured ids", async () => {
    stub = stubGhl({ "/calendars/events": { events: [{ id: "x" }] } });
    await getUpcomingAppointments(TEST_ENV, { daysAhead: 7 });

    const call = stub.only();
    expect(call.query.get("locationId")).toBe("loc123");
    expect(call.query.get("userId")).toBe("user456");

    const start = Number(call.query.get("startTime"));
    const end = Number(call.query.get("endTime"));
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(end - start).toBe(sevenDaysMs);
    expect(start).toBeLessThanOrEqual(Date.now());
  });
});
