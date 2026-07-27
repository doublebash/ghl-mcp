import type { GHLApiEnv } from "../env.js";
import { ghlFetch } from "./client.js";
import { buildPath } from "./path.js";
import type { Appointment } from "./types.js";

export interface UpcomingOptions {
  contactId?: string;
  daysAhead: number;
}

/**
 * Keep only appointments starting inside [from, to].
 *
 * The per-contact GHL endpoint returns a contact's entire appointment history
 * with no date parameters, so the window has to be applied here — otherwise a
 * tool called "upcoming" hands back appointments from years ago. An entry whose
 * startTime is missing or unparseable is dropped: it cannot be shown to be
 * upcoming, and guessing would put stale rows back in the answer.
 */
function withinWindow(appointments: Appointment[], from: number, to: number): Appointment[] {
  return appointments.filter((a) => {
    if (!a.startTime) return false;
    const start = Date.parse(a.startTime);
    return Number.isFinite(start) && start >= from && start <= to;
  });
}

export async function getUpcomingAppointments(
  env: GHLApiEnv,
  options: UpcomingOptions,
): Promise<Appointment[]> {
  const now = Date.now();
  const end = now + options.daysAhead * 24 * 60 * 60 * 1000;

  if (options.contactId !== undefined) {
    const data = await ghlFetch<{ appointments?: Appointment[]; events?: Appointment[] }>(env, {
      method: "GET",
      path: buildPath("/contacts/{contactId}/appointments", { contactId: options.contactId }),
    });
    const all = data?.appointments ?? data?.events ?? [];
    return withinWindow(all, now, end).sort(
      (a, b) => Date.parse(a.startTime ?? "") - Date.parse(b.startTime ?? ""),
    );
  }

  const data = await ghlFetch<{ events?: Appointment[] }>(env, {
    method: "GET",
    path: "/calendars/events",
    query: {
      locationId: env.GHL_LOCATION_ID,
      userId: env.GHL_USER_ID,
      startTime: String(now),
      endTime: String(end),
    },
  });
  return data?.events ?? [];
}

export async function addAppointment(
  env: GHLApiEnv,
  contactId: string,
  title: string,
  startTime: string,
  endTime: string,
  calendarId?: string,
): Promise<Appointment | unknown> {
  return ghlFetch(env, {
    method: "POST",
    path: "/calendars/events/appointments",
    body: {
      calendarId: calendarId ?? env.GHL_CALENDAR_ID,
      locationId: env.GHL_LOCATION_ID,
      contactId,
      startTime,
      endTime,
      title,
      appointmentStatus: "confirmed",
      assignedUserId: env.GHL_USER_ID,
    },
  });
}
