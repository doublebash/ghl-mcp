import { ghlRequest, GHLEnv } from "./client.js";

export async function getUpcomingAppointments(
  env: GHLEnv,
  options: {
    contactId?: string;
    daysAhead?: number;
  } = {}
): Promise<unknown> {
  const { contactId, daysAhead = 30 } = options;

  // If a contact is specified, use the contact appointments endpoint
  if (contactId) {
    const data = await ghlRequest(
      env,
      "GET",
      `/contacts/${contactId}/appointments`
    ) as { appointments?: unknown[] };

    return data.appointments ?? [];
  }

  // Otherwise fetch upcoming events across the whole calendar
  const now = Date.now();
  const end = now + daysAhead * 24 * 60 * 60 * 1000;

  const params = new URLSearchParams({
    locationId: env.GHL_LOCATION_ID,
    userId: env.GHL_USER_ID,
    startTime: String(now),
    endTime: String(end),
  });

  const data = await ghlRequest(
    env,
    "GET",
    `/calendars/events?${params}`
  ) as { events?: unknown[] };

  return data.events ?? [];
}

export async function addAppointment(
  env: GHLEnv,
  contactId: string,
  title: string,
  startTime: string,
  endTime: string,
  calendarId?: string
): Promise<unknown> {
  const data = await ghlRequest(env, "POST", `/calendars/events/appointments`, {
    calendarId: calendarId ?? env.GHL_CALENDAR_ID,
    locationId: env.GHL_LOCATION_ID,
    contactId,
    startTime,
    endTime,
    title,
    appointmentStatus: "confirmed",
    assignedUserId: env.GHL_USER_ID,
  }) as unknown;

  return data;
}
