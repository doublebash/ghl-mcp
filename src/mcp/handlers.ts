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
  DEFAULT_CONVERSATION_LIMIT,
} from "../constants.js";
import type { ToolArgs, ToolName } from "./schemas.js";

function resolveAssignedTo(env: GHLApiEnv, value: string | undefined): string | undefined {
  if (value === undefined || value === "") return undefined;
  const v = value.trim();
  if (v.toLowerCase() === "me") return env.GHL_USER_ID;
  return v;
}

type Handler<N extends ToolName> = (env: GHLApiEnv, args: ToolArgs<N>) => Promise<unknown>;

export const HANDLERS: { [N in ToolName]: Handler<N> } = {
  search_contacts: (env, { query }) => searchContacts(env, query),

  get_contact: (env, { contactId }) => getContact(env, contactId),

  create_contact: (env, args) =>
    createContact(env, {
      ...(args.firstName !== undefined ? { firstName: args.firstName } : {}),
      ...(args.lastName !== undefined ? { lastName: args.lastName } : {}),
      ...(args.email !== undefined ? { email: args.email } : {}),
      ...(args.phone !== undefined ? { phone: args.phone } : {}),
      ...(args.companyName !== undefined ? { companyName: args.companyName } : {}),
      ...(args.source !== undefined ? { source: args.source } : {}),
      ...(args.tags !== undefined ? { tags: args.tags } : {}),
      ...(args.assignedTo !== undefined
        ? { assignedTo: resolveAssignedTo(env, args.assignedTo) ?? args.assignedTo }
        : {}),
    }),

  update_contact: (env, { contactId, ...rest }) =>
    updateContact(env, contactId, {
      ...(rest.firstName !== undefined ? { firstName: rest.firstName } : {}),
      ...(rest.lastName !== undefined ? { lastName: rest.lastName } : {}),
      ...(rest.email !== undefined ? { email: rest.email } : {}),
      ...(rest.phone !== undefined ? { phone: rest.phone } : {}),
      ...(rest.companyName !== undefined ? { companyName: rest.companyName } : {}),
      ...(rest.source !== undefined ? { source: rest.source } : {}),
      ...(rest.tags !== undefined ? { tags: rest.tags } : {}),
      ...(rest.assignedTo !== undefined
        ? { assignedTo: resolveAssignedTo(env, rest.assignedTo) ?? rest.assignedTo }
        : {}),
    }),

  add_tag: (env, { contactId, tags }) => addTag(env, contactId, tags),

  add_task: (env, { contactId, title, dueDate, body }) => addTask(env, contactId, title, dueDate, body),

  complete_task: (env, { contactId, taskId, completed }) =>
    completeTask(env, contactId, taskId, completed ?? true),

  search_tasks: (env, args) =>
    searchTasks(env, {
      ...(args.completed !== undefined ? { completed: args.completed } : {}),
      ...(args.contactId !== undefined ? { contactId: args.contactId } : {}),
      ...(args.assignedTo !== undefined
        ? { assignedTo: resolveAssignedTo(env, args.assignedTo) ?? args.assignedTo }
        : {}),
      ...(args.query !== undefined ? { query: args.query } : {}),
      ...(args.dueDateFrom !== undefined ? { dueDateFrom: args.dueDateFrom } : {}),
      ...(args.dueDateTo !== undefined ? { dueDateTo: args.dueDateTo } : {}),
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
    }),

  list_tasks: (env, { contactId }) => listTasks(env, contactId),

  get_task: (env, { contactId, taskId }) => getTask(env, contactId, taskId),

  update_task: (env, { contactId, taskId, ...rest }) =>
    updateTask(env, contactId, taskId, {
      ...(rest.title !== undefined ? { title: rest.title } : {}),
      ...(rest.body !== undefined ? { body: rest.body } : {}),
      ...(rest.dueDate !== undefined ? { dueDate: rest.dueDate } : {}),
      ...(rest.assignedTo !== undefined
        ? { assignedTo: resolveAssignedTo(env, rest.assignedTo) ?? rest.assignedTo }
        : {}),
    }),

  delete_task: (env, { contactId, taskId }) => deleteTask(env, contactId, taskId),

  add_note: (env, { contactId, body }) => addNote(env, contactId, body),

  list_notes: (env, { contactId }) => listNotes(env, contactId),

  update_note: (env, { contactId, noteId, body }) => updateNote(env, contactId, noteId, body),

  delete_note: (env, { contactId, noteId }) => deleteNote(env, contactId, noteId),

  get_opportunities: (env, args) =>
    getOpportunities(env, {
      ...(args.pipelineId !== undefined ? { pipelineId: args.pipelineId } : {}),
      ...(args.stageId !== undefined ? { stageId: args.stageId } : {}),
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.assignedTo !== undefined ? { assignedTo: args.assignedTo } : {}),
      ...(args.minValue !== undefined ? { minValue: args.minValue } : {}),
      ...(args.maxValue !== undefined ? { maxValue: args.maxValue } : {}),
      ...(args.staleDays !== undefined ? { staleDays: args.staleDays } : {}),
    }),

  get_opportunity: (env, { opportunityId }) => getOpportunity(env, opportunityId),

  create_opportunity: (env, args) =>
    createOpportunity(env, {
      name: args.name,
      pipelineId: args.pipelineId,
      stageId: args.stageId,
      contactId: args.contactId,
      ...(args.monetaryValue !== undefined ? { monetaryValue: args.monetaryValue } : {}),
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.assignedTo !== undefined
        ? { assignedTo: resolveAssignedTo(env, args.assignedTo) ?? args.assignedTo }
        : {}),
    }),

  update_opportunity: (env, { opportunityId, ...rest }) =>
    updateOpportunity(env, opportunityId, {
      ...(rest.name !== undefined ? { name: rest.name } : {}),
      ...(rest.stageId !== undefined ? { stageId: rest.stageId } : {}),
      ...(rest.status !== undefined ? { status: rest.status } : {}),
      ...(rest.monetaryValue !== undefined ? { monetaryValue: rest.monetaryValue } : {}),
      ...(rest.assignedTo !== undefined
        ? { assignedTo: resolveAssignedTo(env, rest.assignedTo) ?? rest.assignedTo }
        : {}),
    }),

  get_pipelines: (env) => getPipelines(env),

  list_workflows: (env) => listWorkflows(env),

  trigger_workflow: (env, { contactId, workflowId, eventStartTime }) =>
    triggerWorkflow(env, contactId, workflowId, eventStartTime),

  get_upcoming_appointments: (env, args) =>
    getUpcomingAppointments(env, {
      ...(args.contactId !== undefined ? { contactId: args.contactId } : {}),
      daysAhead: args.daysAhead ?? DEFAULT_APPOINTMENT_LOOKAHEAD_DAYS,
    }),

  get_conversation_history: (env, { contactId, limit }) =>
    getConversationHistory(env, contactId, limit ?? DEFAULT_CONVERSATION_LIMIT),

  add_appointment: (env, { contactId, title, startTime, endTime, calendarId }) =>
    addAppointment(env, contactId, title, startTime, endTime, calendarId),
};
