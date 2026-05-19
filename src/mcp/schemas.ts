import { z } from "zod";
import {
  GHL_ID_PATTERN,
  MAX_APPOINTMENT_LOOKAHEAD_DAYS,
  MAX_CONVERSATION_LIMIT,
  MIN_APPOINTMENT_LOOKAHEAD_DAYS,
  MIN_CONVERSATION_LIMIT,
  OPPORTUNITY_STATUSES,
} from "../constants.js";

const ghlId = z.string().regex(GHL_ID_PATTERN, "must match GHL ID format");
const isoDateTime = z.string().min(1).max(64);
const monetaryValue = z.number().finite().min(0).max(1_000_000_000);
const limitedString = (max: number) => z.string().min(1).max(max);
const tagList = z.array(z.string().min(1).max(128)).max(50);
const opportunityStatus = z.enum(OPPORTUNITY_STATUSES);

export const toolSchemas = {
  search_contacts: z.object({
    query: limitedString(256),
  }),

  get_opportunities: z.object({
    pipelineId: ghlId.optional(),
    stageId: ghlId.optional(),
    status: opportunityStatus.optional(),
    assignedTo: limitedString(128).optional(),
    minValue: monetaryValue.optional(),
    maxValue: monetaryValue.optional(),
    staleDays: z.number().int().min(0).max(3650).optional(),
  }),

  get_opportunity: z.object({
    opportunityId: ghlId,
  }),

  create_opportunity: z.object({
    name: limitedString(256),
    pipelineId: ghlId,
    stageId: ghlId,
    contactId: ghlId,
    monetaryValue: monetaryValue.optional(),
    status: opportunityStatus.optional(),
    assignedTo: limitedString(128).optional(),
  }),

  update_opportunity: z.object({
    opportunityId: ghlId,
    name: limitedString(256).optional(),
    stageId: ghlId.optional(),
    status: opportunityStatus.optional(),
    monetaryValue: monetaryValue.optional(),
    assignedTo: limitedString(128).optional(),
  }),

  list_workflows: z.object({}),

  trigger_workflow: z.object({
    contactId: ghlId,
    workflowId: ghlId,
    eventStartTime: isoDateTime.optional(),
  }),

  get_pipelines: z.object({}),

  get_upcoming_appointments: z.object({
    contactId: ghlId.optional(),
    daysAhead: z
      .number()
      .int()
      .min(MIN_APPOINTMENT_LOOKAHEAD_DAYS)
      .max(MAX_APPOINTMENT_LOOKAHEAD_DAYS)
      .optional(),
  }),

  get_conversation_history: z.object({
    contactId: ghlId,
    limit: z
      .number()
      .int()
      .min(MIN_CONVERSATION_LIMIT)
      .max(MAX_CONVERSATION_LIMIT)
      .optional(),
  }),

  add_appointment: z.object({
    contactId: ghlId,
    title: limitedString(256),
    startTime: isoDateTime,
    endTime: isoDateTime,
    calendarId: ghlId.optional(),
  }),

  add_tag: z.object({
    contactId: ghlId,
    tags: tagList.min(1),
  }),

  add_task: z.object({
    contactId: ghlId,
    title: limitedString(256),
    dueDate: isoDateTime,
    body: limitedString(8192).optional(),
  }),

  complete_task: z.object({
    contactId: ghlId,
    taskId: ghlId,
    completed: z.boolean().optional(),
  }),

  add_note: z.object({
    contactId: ghlId,
    body: limitedString(16_384),
  }),

  list_notes: z.object({
    contactId: ghlId,
  }),

  update_note: z.object({
    contactId: ghlId,
    noteId: ghlId,
    body: limitedString(16_384),
  }),

  delete_note: z.object({
    contactId: ghlId,
    noteId: ghlId,
  }),

  update_contact: z.object({
    contactId: ghlId,
    firstName: limitedString(128).optional(),
    lastName: limitedString(128).optional(),
    email: z.string().email().max(256).optional(),
    phone: limitedString(32).optional(),
    companyName: limitedString(256).optional(),
    source: limitedString(128).optional(),
    tags: tagList.optional(),
    assignedTo: limitedString(128).optional(),
  }),

  create_contact: z.object({
    firstName: limitedString(128).optional(),
    lastName: limitedString(128).optional(),
    email: z.string().email().max(256).optional(),
    phone: limitedString(32).optional(),
    companyName: limitedString(256).optional(),
    source: limitedString(128).optional(),
    tags: tagList.optional(),
    assignedTo: limitedString(128).optional(),
  }),

  get_contact: z.object({
    contactId: ghlId,
  }),
} as const;

export type ToolName = keyof typeof toolSchemas;
export type ToolArgs<N extends ToolName> = z.infer<(typeof toolSchemas)[N]>;
