import { z } from "zod";
import {
  AUTHORABLE_POST_STATUSES,
  GHL_ID_PATTERN,
  MAX_MEDIA_ITEMS,
  MAX_MEDIA_URL_LENGTH,
  MAX_SUMMARY_LENGTH,
  MAX_YOUTUBE_TITLE_LENGTH,
  SOCIAL_ACCOUNT_ID_PATTERN,
  SOCIAL_PLATFORMS,
  SOCIAL_POST_LIST_LIMIT,
  SOCIAL_POST_STATUSES,
  MAX_APPOINTMENT_LOOKAHEAD_DAYS,
  MAX_CONTACT_SEARCH_LIMIT,
  MAX_CONVERSATION_LIMIT,
  MIN_APPOINTMENT_LOOKAHEAD_DAYS,
  MIN_CONTACT_SEARCH_LIMIT,
  MIN_CONVERSATION_LIMIT,
  OPPORTUNITY_STATUSES,
} from "../constants.js";

const ghlId = z.string().regex(GHL_ID_PATTERN, "must match GHL ID format");

// Must actually be a date, not merely a short string. Without the refine, input
// like "next Tuesday" reached Date.parse downstream, became NaN, and silently
// filtered every result away — an empty list reads as "nothing found" rather
// than "that isn't a date".
const isoDateTime = z
  .string()
  .min(1)
  .max(64)
  .refine((v) => Number.isFinite(Date.parse(v)), {
    message: "must be an ISO 8601 date-time, e.g. 2026-08-01T09:00:00+12:00",
  });

const monetaryValue = z.number().finite().min(0).max(1_000_000_000);
const limitedString = (max: number) => z.string().min(1).max(max);
const tagList = z.array(z.string().min(1).max(128)).max(50);
const opportunityStatus = z.enum(OPPORTUNITY_STATUSES);

// GHL custom fields are addressed by field id, with the value always a string.
const customFieldList = z
  .array(
    z.object({
      id: ghlId,
      field_value: z.string().max(4096),
    }),
  )
  .max(50);

// isoDateTime already refines on Date.parse; this adds the future check.
// Both are refinements, which zod drops from the derived JSON Schema — so
// schedule_social_post's description states the future rule in prose too.
const futureIsoDateTime = isoDateTime.refine((v) => Date.parse(v) > Date.now(), {
  message: "scheduleDate must be in the future",
});

const socialAccountId = z
  .string()
  .regex(SOCIAL_ACCOUNT_ID_PATTERN, "must match GHL social account ID format");

const socialAccountIds = z.array(socialAccountId).min(1).max(10);

// A regex rather than a .refine: zod renders `pattern` into the derived JSON
// Schema, so the caller can see the rule. Refinements are dropped silently.
const mediaItem = z.object({
  url: z
    .string()
    .max(MAX_MEDIA_URL_LENGTH)
    .regex(/^https:\/\//, "media url must start with https://"),
  caption: limitedString(2200).optional(),
  altText: limitedString(420).optional(),
});

const mediaList = z.array(mediaItem).min(1).max(MAX_MEDIA_ITEMS);
const singleMedia = z.array(mediaItem).length(1);
const socialSummary = limitedString(MAX_SUMMARY_LENGTH);
const authorableStatus = z.enum(AUTHORABLE_POST_STATUSES);
const followUpComment = limitedString(2200);

export const toolSchemas = {
  search_contacts: z.object({
    query: limitedString(256),
    limit: z
      .number()
      .int()
      .min(MIN_CONTACT_SEARCH_LIMIT)
      .max(MAX_CONTACT_SEARCH_LIMIT)
      .optional(),
    skip: z.number().int().min(0).max(10_000).optional(),
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

  add_appointment: z
    .object({
      contactId: ghlId,
      title: limitedString(256),
      startTime: isoDateTime,
      endTime: isoDateTime,
      calendarId: ghlId.optional(),
    })
    // GHL accepts a backwards appointment and stores it; catch it here instead.
    .refine((v) => Date.parse(v.endTime) > Date.parse(v.startTime), {
      message: "endTime must be after startTime",
      path: ["endTime"],
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

  search_tasks: z
    .object({
      completed: z.boolean().optional(),
      contactId: ghlId.optional(),
      assignedTo: limitedString(128).optional(),
      query: limitedString(256).optional(),
      dueDateFrom: isoDateTime.optional(),
      dueDateTo: isoDateTime.optional(),
      limit: z.number().int().min(1).max(100).optional(),
      skip: z.number().int().min(0).max(10_000).optional(),
    })
    .refine(
      (v) =>
        v.dueDateFrom === undefined ||
        v.dueDateTo === undefined ||
        Date.parse(v.dueDateTo) >= Date.parse(v.dueDateFrom),
      { message: "dueDateTo must not be before dueDateFrom", path: ["dueDateTo"] },
    ),

  list_tasks: z.object({
    contactId: ghlId,
  }),

  get_task: z.object({
    contactId: ghlId,
    taskId: ghlId,
  }),

  update_task: z.object({
    contactId: ghlId,
    taskId: ghlId,
    title: limitedString(256).optional(),
    body: limitedString(8192).optional(),
    dueDate: isoDateTime.optional(),
    assignedTo: limitedString(128).optional(),
  }),

  delete_task: z.object({
    contactId: ghlId,
    taskId: ghlId,
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
    customFields: customFieldList.optional(),
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
    customFields: customFieldList.optional(),
  }),

  get_contact: z.object({
    contactId: ghlId,
  }),

  list_social_accounts: z.object({}),

  post_to_facebook: z.object({
    accountIds: socialAccountIds,
    status: authorableStatus,
    summary: socialSummary,
    media: mediaList.optional(),
    followUpComment: followUpComment.optional(),
  }),

  post_to_instagram: z.object({
    accountIds: socialAccountIds,
    status: authorableStatus,
    summary: socialSummary,
    media: mediaList,
    postType: z.enum(["post", "reel", "story"]),
    followUpComment: followUpComment.optional(),
  }),

  post_to_youtube: z.object({
    accountIds: socialAccountIds,
    status: authorableStatus,
    title: limitedString(MAX_YOUTUBE_TITLE_LENGTH),
    summary: socialSummary.optional(),
    media: singleMedia,
    privacy: z.enum(["public", "unlisted", "private"]),
  }),

  post_to_linkedin: z.object({
    accountIds: socialAccountIds,
    status: authorableStatus,
    summary: socialSummary,
    media: mediaList.optional(),
    postAsPdf: z.boolean().optional(),
    pdfTitle: limitedString(256).optional(),
    followUpComment: followUpComment.optional(),
  }),

  post_to_tiktok: z.object({
    accountIds: socialAccountIds,
    status: authorableStatus,
    summary: socialSummary,
    media: singleMedia,
    privacyLevel: z.enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"]),
    allowComments: z.boolean(),
    allowDuet: z.boolean(),
    allowStitch: z.boolean(),
  }),

  schedule_social_post: z.object({
    postId: ghlId,
    scheduleDate: futureIsoDateTime,
  }),

  list_social_posts: z.object({
    platform: z.enum(SOCIAL_PLATFORMS).optional(),
    status: z.enum(SOCIAL_POST_STATUSES).optional(),
    fromDate: isoDateTime.optional(),
    toDate: isoDateTime.optional(),
    limit: z.number().int().min(1).max(SOCIAL_POST_LIST_LIMIT).optional(),
  }),

  get_social_post: z.object({
    postId: ghlId,
  }),

  update_social_post: z
    .object({
      postId: ghlId,
      summary: socialSummary.optional(),
      media: mediaList.optional(),
    })
    .refine((v) => v.summary !== undefined || v.media !== undefined, {
      message: "provide summary, media, or both — there is nothing to update otherwise",
    }),

  delete_social_post: z.object({
    postId: ghlId,
  }),
} as const;

export type ToolName = keyof typeof toolSchemas;
export type ToolArgs<N extends ToolName> = z.infer<(typeof toolSchemas)[N]>;
