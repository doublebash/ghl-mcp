import { ghlRequest, GHLEnv } from "./client.js";

export interface ContactSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  tags: string[];
}

export async function searchContacts(
  env: GHLEnv,
  query: string
): Promise<ContactSummary[]> {
  const params = new URLSearchParams({
    locationId: env.GHL_LOCATION_ID,
    query,
  });

  const data = await ghlRequest(env, "GET", `/contacts/?${params}`) as {
    contacts?: ContactSummary[];
  };

  return data.contacts ?? [];
}

export async function getContact(
  env: GHLEnv,
  contactId: string
): Promise<unknown> {
  const data = await ghlRequest(env, "GET", `/contacts/${contactId}`) as {
    contact?: unknown;
  };

  if (!data.contact) throw new Error(`Contact not found: ${contactId}`);
  return data.contact;
}

export async function addTag(
  env: GHLEnv,
  contactId: string,
  tags: string[]
): Promise<unknown> {
  const data = await ghlRequest(env, "POST", `/contacts/${contactId}/tags`, {
    tags,
  }) as unknown;

  return data;
}

export async function addTask(
  env: GHLEnv,
  contactId: string,
  title: string,
  dueDate: string,
  body?: string
): Promise<unknown> {
  const data = await ghlRequest(env, "POST", `/contacts/${contactId}/tasks`, {
    title,
    body: body ?? "",
    dueDate,
    completed: false,
    assignedTo: env.GHL_USER_ID,
  }) as { task?: unknown };

  return data.task ?? data;
}

export async function addNote(
  env: GHLEnv,
  contactId: string,
  body: string
): Promise<unknown> {
  const data = await ghlRequest(env, "POST", `/contacts/${contactId}/notes`, {
    body,
    userId: env.GHL_USER_ID,
  }) as { note?: unknown };

  return data.note ?? data;
}

export async function updateContact(
  env: GHLEnv,
  contactId: string,
  input: Partial<CreateContactInput>
): Promise<unknown> {
  const data = await ghlRequest(env, "PUT", `/contacts/${contactId}`, input) as {
    contact?: unknown;
  };

  if (!data.contact) throw new Error(`Failed to update contact: ${contactId}`);
  return data.contact;
}

export interface CreateContactInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  source?: string;
  tags?: string[];
  customFields?: { id: string; field_value: string }[];
}

export async function createContact(
  env: GHLEnv,
  input: CreateContactInput
): Promise<unknown> {
  const body = {
    ...input,
    locationId: env.GHL_LOCATION_ID,
  };

  const data = await ghlRequest(env, "POST", `/contacts/`, body) as {
    contact?: unknown;
  };

  if (!data.contact) throw new Error("Failed to create contact — no contact returned");
  return data.contact;
}
