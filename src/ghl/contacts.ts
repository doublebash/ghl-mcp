import type { GHLApiEnv } from "../env.js";
import { ToolError } from "@bashco/mcp-toolkit";
import { ghlFetch } from "./client.js";
import { buildPath } from "./path.js";
import type { Contact, ContactSummary, Note, Task } from "./types.js";

export interface CreateContactInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  source?: string;
  tags?: string[];
  assignedTo?: string;
  customFields?: { id: string; field_value: string }[];
}

export async function searchContacts(env: GHLApiEnv, query: string): Promise<ContactSummary[]> {
  const data = await ghlFetch<{ contacts?: ContactSummary[] }>(env, {
    method: "GET",
    path: "/contacts/",
    query: { locationId: env.GHL_LOCATION_ID, query },
  });
  return data?.contacts ?? [];
}

export async function getContact(env: GHLApiEnv, contactId: string): Promise<Contact> {
  const data = await ghlFetch<{ contact?: Contact }>(env, {
    method: "GET",
    path: buildPath("/contacts/{contactId}", { contactId }),
  });
  if (!data?.contact) throw ToolError.notFound("contact", contactId);
  return data.contact;
}

export async function addTag(env: GHLApiEnv, contactId: string, tags: string[]): Promise<unknown> {
  return ghlFetch(env, {
    method: "POST",
    path: buildPath("/contacts/{contactId}/tags", { contactId }),
    body: { tags },
  });
}

export async function addTask(
  env: GHLApiEnv,
  contactId: string,
  title: string,
  dueDate: string,
  body?: string,
): Promise<Task | unknown> {
  const data = await ghlFetch<{ task?: Task }>(env, {
    method: "POST",
    path: buildPath("/contacts/{contactId}/tasks", { contactId }),
    body: {
      title,
      body: body ?? "",
      dueDate,
      completed: false,
      assignedTo: env.GHL_USER_ID,
    },
  });
  return data?.task ?? data;
}

export async function completeTask(
  env: GHLApiEnv,
  contactId: string,
  taskId: string,
  completed: boolean,
): Promise<Task | unknown> {
  const data = await ghlFetch<{ task?: Task }>(env, {
    method: "PUT",
    path: buildPath("/contacts/{contactId}/tasks/{taskId}/completed", { contactId, taskId }),
    body: { completed },
  });
  return data?.task ?? data;
}

export async function listTasks(env: GHLApiEnv, contactId: string): Promise<Task[]> {
  const data = await ghlFetch<{ tasks?: Task[] }>(env, {
    method: "GET",
    path: buildPath("/contacts/{contactId}/tasks", { contactId }),
  });
  return data?.tasks ?? [];
}

export async function getTask(
  env: GHLApiEnv,
  contactId: string,
  taskId: string,
): Promise<Task> {
  const data = await ghlFetch<{ task?: Task }>(env, {
    method: "GET",
    path: buildPath("/contacts/{contactId}/tasks/{taskId}", { contactId, taskId }),
  });
  if (!data?.task) throw ToolError.notFound("task", taskId);
  return data.task;
}

export interface UpdateTaskInput {
  title?: string;
  body?: string;
  dueDate?: string;
  assignedTo?: string;
}

export async function updateTask(
  env: GHLApiEnv,
  contactId: string,
  taskId: string,
  input: UpdateTaskInput,
): Promise<Task | unknown> {
  const data = await ghlFetch<{ task?: Task }>(env, {
    method: "PUT",
    path: buildPath("/contacts/{contactId}/tasks/{taskId}", { contactId, taskId }),
    body: input,
  });
  return data?.task ?? data;
}

export async function deleteTask(
  env: GHLApiEnv,
  contactId: string,
  taskId: string,
): Promise<unknown> {
  return ghlFetch(env, {
    method: "DELETE",
    path: buildPath("/contacts/{contactId}/tasks/{taskId}", { contactId, taskId }),
  });
}

export interface SearchTasksInput {
  completed?: boolean;
  contactId?: string;
  assignedTo?: string;
  query?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  limit?: number;
}

export async function searchTasks(
  env: GHLApiEnv,
  input: SearchTasksInput,
): Promise<Task[]> {
  const body: Record<string, unknown> = {
    locationId: env.GHL_LOCATION_ID,
  };
  if (input.completed !== undefined) body.completed = input.completed;
  if (input.contactId !== undefined) body.contactId = [input.contactId];
  if (input.assignedTo !== undefined) body.assignedTo = [input.assignedTo];
  if (input.query !== undefined) body.query = input.query;
  if (input.dueDateFrom !== undefined || input.dueDateTo !== undefined) {
    const range: Record<string, string> = {};
    if (input.dueDateFrom !== undefined) range.startDate = input.dueDateFrom;
    if (input.dueDateTo !== undefined) range.endDate = input.dueDateTo;
    body.dueDate = range;
  }
  if (input.limit !== undefined) body.limit = input.limit;

  const data = await ghlFetch<{ tasks?: Task[] }>(env, {
    method: "POST",
    path: "/contacts/tasks/search",
    body,
  });
  return data?.tasks ?? [];
}

export async function addNote(env: GHLApiEnv, contactId: string, body: string): Promise<Note | unknown> {
  const data = await ghlFetch<{ note?: Note }>(env, {
    method: "POST",
    path: buildPath("/contacts/{contactId}/notes", { contactId }),
    body: { body, userId: env.GHL_USER_ID },
  });
  return data?.note ?? data;
}

export async function listNotes(env: GHLApiEnv, contactId: string): Promise<Note[]> {
  const data = await ghlFetch<{ notes?: Note[] }>(env, {
    method: "GET",
    path: buildPath("/contacts/{contactId}/notes", { contactId }),
  });
  return data?.notes ?? [];
}

export async function updateNote(
  env: GHLApiEnv,
  contactId: string,
  noteId: string,
  body: string,
): Promise<Note | unknown> {
  const data = await ghlFetch<{ note?: Note }>(env, {
    method: "PUT",
    path: buildPath("/contacts/{contactId}/notes/{noteId}", { contactId, noteId }),
    body: { body, userId: env.GHL_USER_ID },
  });
  return data?.note ?? data;
}

export async function deleteNote(env: GHLApiEnv, contactId: string, noteId: string): Promise<unknown> {
  return ghlFetch(env, {
    method: "DELETE",
    path: buildPath("/contacts/{contactId}/notes/{noteId}", { contactId, noteId }),
  });
}

export async function updateContact(
  env: GHLApiEnv,
  contactId: string,
  input: Partial<CreateContactInput>,
): Promise<Contact> {
  const data = await ghlFetch<{ contact?: Contact }>(env, {
    method: "PUT",
    path: buildPath("/contacts/{contactId}", { contactId }),
    body: input,
  });
  if (!data?.contact) {
    throw new ToolError({
      userMessage: "failed to update contact",
      internalMessage: `update_contact returned no contact for id ${contactId}`,
    });
  }
  return data.contact;
}

export async function createContact(env: GHLApiEnv, input: CreateContactInput): Promise<Contact> {
  const body = { ...input, locationId: env.GHL_LOCATION_ID };
  const data = await ghlFetch<{ contact?: Contact }>(env, {
    method: "POST",
    path: "/contacts/",
    body,
  });
  if (!data?.contact) {
    throw new ToolError({
      userMessage: "failed to create contact",
      internalMessage: "create_contact returned no contact",
    });
  }
  return data.contact;
}
