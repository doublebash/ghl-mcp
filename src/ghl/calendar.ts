import type { GHLApiEnv } from "../env.js";
import { ghlFetch } from "./client.js";
import { buildPath } from "./path.js";
import type { Appointment } from "./types.js";

export interface UpcomingOptions {
  contactId?: string;
  daysAhead: number;
}

export async function getUpcomingAppointments(
  env: GHLApiEnv,
  options: UpcomingOptions,
): Promise<Appointment[]> {
  if (options.contactId !== undefined) {
    const data = await ghlFetch<{ appointments?: Appointment[] }>(env, {
      method: "GET",
      path: buildPath("/contacts/{contactId}/appointments", { contactId: options.contactId }),
    });
    return data?.appointments ?? [];
  }

  const now = Date.now();
  const end = now + options.daysAhead * 24 * 60 * 60 * 1000;
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
