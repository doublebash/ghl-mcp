import type { GHLApiEnv } from "../env.js";
import { addAppointment, getUpcomingAppointments } from "../ghl/calendar.js";
import {
  addNote,
  addTag,
  addTask,
  completeTask,
  createContact,
  deleteNote,
  deleteTask,
  getContact,
  getTask,
  listNotes,
  listTasks,
  searchContacts,
  searchTasks,
  updateContact,
  updateNote,
  updateTask,
} from "../ghl/contacts.js";
import { getConversationHistory } from "../ghl/conversations.js";
import {
  createOpportunity,
  getOpportunities,
  getOpportunity,
  getPipelines,
  updateOpportunity,
} from "../ghl/opportunities.js";
import { listWorkflows, triggerWorkflow } from "../ghl/workflows.js";
import {
  DEFAULT_APPOINTMENT_LOOKAHEAD_DAYS,
  DEFAULT_CONTACT_SEARCH_LIMIT,
  DEFAULT_CONVERSATION_LIMIT,
} from "../constants.js";
import type { ToolArgs, ToolName } from "./schemas.js";
import { truncateList } from "./truncate.js";

/** Maps the caller's "me" shorthand onto the configured GHL user. */
function resolveAssignedTo(env: GHLApiEnv, value: string): string {
  const v = value.trim();
  return v.toLowerCase() === "me" ? env.GHL_USER_ID : v;
}

/**
 * Drop undefined entries so the upstream body carries only fields the caller
 * actually set — a PUT with `{ email: undefined }` would blank the field.
 *
 * `exactOptionalPropertyTypes` is what forces this: an explicit `undefined` is
 * not assignable to an optional property, so every field previously needed its
 * own `...(x !== undefined ? { x } : {})` spread. One pass here replaces about
 * sixty lines of that.
 */
function compact<T extends object>(input: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) out[k] = v;
  }
  return out as { [K in keyof T]?: Exclude<T[K], undefined> };
}

type Handler<N extends ToolName> = (env: GHLApiEnv, args: ToolArgs<N>) => Promise<unknown>;

export const HANDLERS: { [N in ToolName]: Handler<N> } = {
  search_contacts: async (env, { query, limit, skip }) =>
    truncateList(
      await searchContacts(
        env,
        query,
        compact({ limit: limit ?? DEFAULT_CONTACT_SEARCH_LIMIT, skip }),
      ),
      "matching contacts",
      "Narrow the query, or page through with skip.",
    ),

  get_contact: (env, { contactId }) => getContact(env, contactId),

  create_contact: (env, args) =>
    createContact(
      env,
      compact({
        ...args,
        assignedTo: args.assignedTo && resolveAssignedTo(env, args.assignedTo),
      }),
    ),

  update_contact: (env, { contactId, ...rest }) =>
    updateContact(
      env,
      contactId,
      compact({
        ...rest,
        assignedTo: rest.assignedTo && resolveAssignedTo(env, rest.assignedTo),
      }),
    ),

  add_tag: (env, { contactId, tags }) => addTag(env, contactId, tags),

  add_task: (env, { contactId, title, dueDate, body }) => addTask(env, contactId, title, dueDate, body),

  complete_task: (env, { contactId, taskId, completed }) =>
    completeTask(env, contactId, taskId, completed ?? true),

  search_tasks: async (env, args) =>
    truncateList(
      await searchTasks(
        env,
        compact({
          ...args,
          assignedTo: args.assignedTo && resolveAssignedTo(env, args.assignedTo),
        }),
      ),
      "matching tasks",
      "Narrow with completed, assignedTo or a due-date window, or page with skip.",
    ),

  list_tasks: (env, { contactId }) => listTasks(env, contactId),

  get_task: (env, { contactId, taskId }) => getTask(env, contactId, taskId),

  update_task: (env, { contactId, taskId, ...rest }) =>
    updateTask(
      env,
      contactId,
      taskId,
      compact({
        ...rest,
        assignedTo: rest.assignedTo && resolveAssignedTo(env, rest.assignedTo),
      }),
    ),

  delete_task: (env, { contactId, taskId }) => deleteTask(env, contactId, taskId),

  add_note: (env, { contactId, body }) => addNote(env, contactId, body),

  list_notes: (env, { contactId }) => listNotes(env, contactId),

  update_note: (env, { contactId, noteId, body }) => updateNote(env, contactId, noteId, body),

  delete_note: (env, { contactId, noteId }) => deleteNote(env, contactId, noteId),

  get_opportunities: async (env, args) =>
    truncateList(
      await getOpportunities(
        env,
        compact({
          ...args,
          assignedTo: args.assignedTo && resolveAssignedTo(env, args.assignedTo),
        }),
      ),
      "matching opportunities",
      "Filter by pipelineId, stageId, status or a value range to see a complete set.",
    ),

  get_opportunity: (env, { opportunityId }) => getOpportunity(env, opportunityId),

  create_opportunity: (env, args) =>
    createOpportunity(env, {
      ...compact({
        ...args,
        assignedTo: args.assignedTo && resolveAssignedTo(env, args.assignedTo),
      }),
      // Required by CreateOpportunityInput — restated so compact()'s all-optional
      // return type still satisfies it.
      name: args.name,
      pipelineId: args.pipelineId,
      stageId: args.stageId,
      contactId: args.contactId,
    }),

  update_opportunity: (env, { opportunityId, ...rest }) =>
    updateOpportunity(
      env,
      opportunityId,
      compact({
        ...rest,
        assignedTo: rest.assignedTo && resolveAssignedTo(env, rest.assignedTo),
      }),
    ),

  get_pipelines: (env) => getPipelines(env),

  list_workflows: (env) => listWorkflows(env),

  trigger_workflow: (env, { contactId, workflowId, eventStartTime }) =>
    triggerWorkflow(env, contactId, workflowId, eventStartTime),

  get_upcoming_appointments: (env, args) =>
    getUpcomingAppointments(env, {
      ...compact({ contactId: args.contactId }),
      daysAhead: args.daysAhead ?? DEFAULT_APPOINTMENT_LOOKAHEAD_DAYS,
    }),

  get_conversation_history: (env, { contactId, limit }) =>
    getConversationHistory(env, contactId, limit ?? DEFAULT_CONVERSATION_LIMIT),

  add_appointment: (env, { contactId, title, startTime, endTime, calendarId }) =>
    addAppointment(env, contactId, title, startTime, endTime, calendarId),
};
