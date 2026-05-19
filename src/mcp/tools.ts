import { defineTools, type ToolMap } from "@bashco/mcp-toolkit";
import type { GHLApiEnv } from "../env.js";
import { HANDLERS } from "./handlers.js";
import { toolSchemas, type ToolName } from "./schemas.js";

const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  search_contacts:
    "Search for contacts in GoHighLevel by name, email, phone number, or company name. " +
    "Use this first when you need to find a specific person before reading or updating their record. " +
    "Returns a list of matching contacts with their IDs, names, emails, phone numbers, company, and tags.",

  get_opportunities:
    "Get a list of opportunities (deals) from GoHighLevel pipelines. " +
    "Supports filtering by pipeline, stage, status (open/won/lost/abandoned), assigned user, value range, and stale deals (no activity in X days). " +
    "Use this for pipeline reviews, finding stalled deals, or identifying high-value opportunities that need attention. " +
    "All filters are optional — omit them to get all open opportunities.",

  get_opportunity:
    "Get the full details of a single opportunity (deal) by its ID. " +
    "Use this after get_opportunities when you need to dig into a specific deal — " +
    "returns complete information including stage, value, contact, custom fields, and history. " +
    "Requires an opportunity ID from a previous get_opportunities call.",

  create_opportunity:
    "Create a new opportunity (deal) in a GoHighLevel pipeline. " +
    "Use this when a contact becomes a qualified lead and you want to track the deal. " +
    "Requires a pipeline ID and stage ID — use get_pipelines first to see available pipeline and stage IDs. " +
    "Returns the created opportunity including its new ID.",

  update_opportunity:
    "Update an existing opportunity (deal) in GoHighLevel. " +
    "Use this to move a deal to a new stage, change its value, mark it as won or lost, or reassign it. " +
    "This modifies existing data — only the fields you provide will be changed. Requires an opportunity ID.",

  list_workflows:
    "List all automation workflows available in your GoHighLevel account. " +
    "Returns each workflow's ID, name, and status. " +
    "Use this to see what automations exist before triggering one for a contact.",

  trigger_workflow:
    "Trigger a GoHighLevel automation workflow for a specific contact. " +
    "Use this to enrol a contact into a nurture sequence, send an automated message, or kick off any GHL workflow. " +
    "Run list_workflows first to get the workflow ID. Requires a contact ID and workflow ID.",

  get_pipelines:
    "List all sales pipelines in GoHighLevel, including each pipeline's stages with their IDs and names. " +
    "Use this before create_opportunity when you need to know which pipelineId and stageId to use. " +
    "Returns a structured view of every pipeline and its ordered stages.",

  get_upcoming_appointments:
    "Get upcoming calendar appointments from GoHighLevel. " +
    "Can fetch appointments for a specific contact, or show all upcoming appointments across your calendar. " +
    "Defaults to the next 30 days. Use this to check what's scheduled before a meeting or to get a weekly overview.",

  get_conversation_history:
    "Get the recent message history for a GoHighLevel contact — includes emails, SMS, calls, and other communications. " +
    "Use this to understand the last time you spoke with someone, what was discussed, and what channel was used. " +
    "Essential context before drafting a follow-up. Requires a contact ID.",

  add_appointment:
    "Create a calendar appointment in GoHighLevel for a contact. " +
    "Use this to book a meeting, call, or shoot with a client. " +
    "Times must be in ISO 8601 format with timezone offset. Requires a contact ID, title, start and end time.",

  add_tag:
    "Add one or more tags to a GoHighLevel contact without removing existing tags. " +
    "Use this to categorise a contact, mark an interest, or trigger tag-based automations in GHL. " +
    "Requires a contact ID and at least one tag.",

  add_task:
    "Create a follow-up task for a GoHighLevel contact. " +
    "Use this to set a reminder to call, email, or follow up with someone by a specific date. " +
    "Tasks appear in GHL's task list and are assigned to you. Requires a contact ID and due date.",

  complete_task:
    "Mark a GoHighLevel task as done (or un-done). " +
    "Use this once a follow-up has been completed so it drops off the task list. " +
    "Pass completed: false to reopen a task that was closed by mistake. " +
    "Defaults to completed: true. Requires a contact ID and task ID.",

  search_tasks:
    "Search GoHighLevel tasks across all contacts with filters. " +
    "Use this to build daily / weekly follow-up views — pass completed: false to see open tasks, " +
    "filter by assignedTo (a GHL user ID or 'me'), and optionally by a single contactId or free-text query. " +
    "dueDateFrom / dueDateTo (ISO 8601 with timezone) scope to a due-date window — note that GHL itself " +
    "doesn't filter by due date server-side, so this is applied client-side after the GHL fetch: " +
    "if you use a date window, increase limit accordingly so you don't miss matches buried past the first page. " +
    "Returns an array of tasks each with id, title, body, dueDate, completed, assignedTo, and contactId. " +
    "limit defaults to GHL's default (25), max 100. Use skip for pagination — fetch additional pages of GHL results.",

  list_tasks:
    "List all tasks attached to a single GoHighLevel contact. " +
    "Use this when you already know the contact and want their full task history (open + completed). " +
    "For a global \"all my open follow-ups\" view across all contacts, use search_tasks instead. " +
    "Requires a contact ID — run search_contacts first if you only have a name.",

  get_task:
    "Get the full details of a single GoHighLevel task by ID. " +
    "Useful for refreshing the latest state of a known task (e.g. has it been completed by someone else, has the due date moved). " +
    "Requires a contact ID and a task ID — usually you'd have these from a prior search_tasks / list_tasks / add_task call.",

  update_task:
    "Update an existing GoHighLevel task's title, body, due date, or assignee. " +
    "Use this to reschedule a follow-up (change dueDate), reassign it to another user (assignedTo: a GHL user ID or 'me'), " +
    "or correct the title/body. Only the fields you provide are changed — omitted fields are left as-is. " +
    "To mark a task complete, use complete_task instead — this tool does not touch the completed flag. " +
    "Requires a contact ID and task ID.",

  delete_task:
    "Delete a GoHighLevel task entirely. " +
    "This modifies existing data and cannot be undone. " +
    "Prefer complete_task for follow-ups that are done — deletion is for tasks created in error or no longer relevant. " +
    "Requires a contact ID and task ID.",

  add_note:
    "Append a note to a GoHighLevel contact record. " +
    "Use this to log a call summary, record what was discussed in a meeting, or save research about a contact. " +
    "Notes are visible in the contact's timeline in GHL. Requires a contact ID.",

  list_notes:
    "List all notes on a GoHighLevel contact record, each with its note ID, body, author, and timestamp. " +
    "Use this to review what's already been logged about a contact, or to find a note's ID before editing or deleting it with update_note / delete_note. " +
    "Requires a contact ID — run search_contacts first if you only have a name.",

  update_note:
    "Replace the body of an existing note on a GoHighLevel contact. " +
    "This modifies existing data — the new body replaces the existing body entirely. " +
    "Run list_notes first to get the note ID. Requires a contact ID, note ID, and the new body text.",

  delete_note:
    "Delete a note from a GoHighLevel contact record. " +
    "This modifies existing data and cannot be undone. " +
    "Run list_notes first to get the note ID. Requires a contact ID and note ID.",

  update_contact:
    "Update an existing GoHighLevel contact's details. " +
    "This modifies existing data — only the fields you provide will be changed; omitted fields are left as-is. " +
    "Use this to correct information, add a phone number, update a company name, change custom fields, or assign the contact to a user. " +
    "Requires a contact ID — run search_contacts first if you only have a name.",

  create_contact:
    "Create a new contact in GoHighLevel. " +
    "Use this when researching a person or company and adding them to the CRM, or when a new lead needs to be created manually. " +
    "Returns the created contact including their new GHL contact ID.",

  get_contact:
    "Get the full details of a single GoHighLevel contact by their ID. " +
    "Use this after search_contacts to get complete information including custom fields, tags, source, and attribution. " +
    "Requires a contact ID — run search_contacts first if you only have a name or email.",
};

const toolMap: ToolMap<GHLApiEnv> = {};
for (const name of Object.keys(toolSchemas) as ToolName[]) {
  toolMap[name] = {
    schema: toolSchemas[name],
    description: TOOL_DESCRIPTIONS[name],
    handler: HANDLERS[name] as (env: GHLApiEnv, args: unknown) => Promise<unknown>,
  };
}

const { toolDefinitions: definedToolDefinitions, dispatch } = defineTools<GHLApiEnv>(toolMap);

export const toolDefinitions = definedToolDefinitions;
export const dispatchToolCall = dispatch;
