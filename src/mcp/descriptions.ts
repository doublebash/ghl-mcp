import type { ToolName } from "./schemas.js";

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  search_contacts:
    "Search for contacts in GoHighLevel by name, email, phone number, or company name. " +
    "Use this first when you need to find a specific person before reading or updating their record. " +
    "Returns { items, returned, total, truncated } — items holds the matching contacts with their IDs, " +
    "names, emails, phone numbers, company and tags. limit defaults to 25 (max 100); use skip to page. " +
    "If truncated is true the list is partial — read the note and narrow the query rather than treating it as complete.",

  get_opportunities:
    "Get a list of opportunities (deals) from GoHighLevel pipelines. " +
    "Supports filtering by pipeline, stage, status (open/won/lost/abandoned), assigned user (a GHL user ID or 'me'), " +
    "value range, and stale deals (staleDays: no activity in X days — deals with no activity date at all are excluded). " +
    "Use this for pipeline reviews, finding stalled deals, or identifying high-value opportunities that need attention. " +
    "All filters are optional — omit them to get all open opportunities. " +
    "Returns { items, returned, total, truncated }: at most 100 deals in items, drawn from at most 500 fetched. " +
    "If truncated is true you are seeing part of the pipeline — do not total or summarise it as the whole; " +
    "add a filter and call again.",

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
    "Defaults to the next 30 days (daysAhead, 1-365) and applies to both modes — past appointments are never returned, " +
    "so this is not a way to read a contact's appointment history. Results are ordered earliest first. " +
    "Use this to check what's scheduled before a meeting or to get a weekly overview.",

  get_conversation_history:
    "Get the recent message history for a GoHighLevel contact — includes emails, SMS, calls, and other communications. " +
    "A contact's SMS and email are separate threads in GHL, so this merges the 3 most recently active threads into one " +
    "timeline, newest message first, each message tagged with its conversationId. " +
    "The response reports conversationCount and truncated: true when the contact has more threads than were merged. " +
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
    "Returns { items, returned, total, truncated }; each task in items has id, title, body, dueDate, completed, " +
    "assignedTo and contactId. If truncated is true the list is partial — narrow the filters rather than " +
    "treating it as every open task. " +
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
    "Use this to correct information, add a phone number, update a company name, or assign the contact to a user " +
    "(assignedTo: a GHL user ID or 'me'). " +
    "customFields takes [{ id, field_value }] — get the field IDs from a get_contact call on any contact that has them set. " +
    "Requires a contact ID — run search_contacts first if you only have a name.",

  create_contact:
    "Create a new contact in GoHighLevel. " +
    "Use this when researching a person or company and adding them to the CRM, or when a new lead needs to be created manually. " +
    "customFields takes [{ id, field_value }] — get the field IDs from a get_contact call on any contact that has them set. " +
    "Returns the created contact including their new GHL contact ID.",

  get_contact:
    "Get the full details of a single GoHighLevel contact by their ID. " +
    "Use this after search_contacts to get complete information including custom fields, tags, source, and attribution. " +
    "Requires a contact ID — run search_contacts first if you only have a name or email.",

  list_social_accounts:
    "List the social media accounts connected to GoHighLevel's Social Planner — Facebook, " +
    "Instagram, YouTube, LinkedIn and TikTok — each with its account ID, platform and name. " +
    "ALWAYS run this first before any post_to_* tool: those tools require explicit account IDs, " +
    "and reject an ID belonging to a different platform. " +
    "Accounts marked supported: false are connected to GoHighLevel but have no posting tool here. " +
    "Returns { items, returned, total, truncated }. " +
    "If this reports a configuration error, the account list has not been set up on the server " +
    "yet — that is an operator task, not something to work around by guessing account IDs.",

  post_to_facebook:
    "Post to a connected Facebook Page through GoHighLevel's Social Planner. " +
    "Accepts text alone, or text with up to 10 images or one video passed as public https:// URLs. " +
    "Run list_social_accounts first to get Facebook account IDs — an ID from another platform is rejected. " +
    "status is REQUIRED and explicit: 'draft' stages the post in the Social Planner for review, " +
    "'published' posts it immediately and cannot be undone. " +
    "To schedule for later, create it as a draft and then call schedule_social_post. " +
    "A successful response means GoHighLevel queued the post, not that Facebook accepted it — " +
    "call get_social_post to confirm.",

  post_to_instagram:
    "Post to a connected Instagram Business or Creator account through GoHighLevel's Social Planner. " +
    "Media is REQUIRED — Instagram rejects text-only posts. Pass public https:// URLs. " +
    "postType selects the format: 'post' for a feed post or carousel, 'reel' for a Reel, 'story' for a Story. " +
    "Run list_social_accounts first to get Instagram account IDs. " +
    "status is REQUIRED and explicit: 'draft' stages the post, 'published' posts immediately and " +
    "cannot be undone. To schedule for later, create a draft then call schedule_social_post. " +
    "A successful response means the post was queued, not that Instagram accepted it — " +
    "confirm with get_social_post.",

  post_to_youtube:
    "Upload a video to a connected YouTube channel through GoHighLevel's Social Planner. " +
    "Requires exactly one video as a public https:// URL and a title of 100 characters or fewer; " +
    "summary becomes the video description. " +
    "privacy is REQUIRED — 'public', 'unlisted' or 'private' — because it decides whether the whole " +
    "internet can see the video. Never guess it; ask if it was not specified. " +
    "Run list_social_accounts first to get the YouTube account ID. " +
    "status is REQUIRED: 'draft' stages it, 'published' uploads immediately. " +
    "To schedule for later, create a draft then call schedule_social_post. " +
    "Video processing is asynchronous — call get_social_post to confirm the upload succeeded.",

  post_to_linkedin:
    "Post to a connected LinkedIn profile or company page through GoHighLevel's Social Planner. " +
    "Accepts text alone, text with images, or a PDF document carousel — for a carousel set " +
    "postAsPdf: true, give pdfTitle, and pass the PDF as the single media item. " +
    "All media must be public https:// URLs. " +
    "Run list_social_accounts first to get LinkedIn account IDs. " +
    "status is REQUIRED and explicit: 'draft' stages the post, 'published' posts immediately and " +
    "cannot be undone. To schedule for later, create a draft then call schedule_social_post. " +
    "A successful response means the post was queued, not that LinkedIn accepted it.",

  post_to_tiktok:
    "Post a video to a connected TikTok account through GoHighLevel's Social Planner. " +
    "Requires exactly one video as a public https:// URL. " +
    "privacyLevel, allowComments, allowDuet and allowStitch are all REQUIRED and explicit — TikTok " +
    "applies them at publish time and they cannot be changed afterwards, so none of them has a " +
    "safe default to guess. " +
    "privacyLevel 'PUBLIC_TO_EVERYONE' is visible to anyone; 'SELF_ONLY' stays private on TikTok. " +
    "Run list_social_accounts first to get the TikTok account ID. " +
    "status is REQUIRED: 'draft' stages it, 'published' posts immediately. " +
    "To schedule for later, create a draft then call schedule_social_post.",

  schedule_social_post:
    "Schedule an existing social post for a future date and time, or move an already-scheduled " +
    "post to a different time. Takes a post ID from a post_to_* tool or list_social_posts. " +
    "scheduleDate must be an ISO 8601 timestamp with a timezone offset AND must be in the future. " +
    "This is the only way to schedule — the post_to_* tools deliberately take no date, so the " +
    "normal flow is: create the post as a draft, review it, then schedule it.",

  list_social_posts:
    "List social posts in the GoHighLevel Social Planner — the content queue. " +
    "Filter by platform, status (draft, scheduled, published) and date range; all filters optional. " +
    "Omitting status returns posts of every status. " +
    "Use this to see what is scheduled, find a post ID before editing or deleting, or check " +
    "whether something published successfully. " +
    "Returns { items, returned, total, truncated }; if truncated is true you are seeing part of " +
    "the queue — narrow by platform, status or date range rather than treating it as the whole.",

  get_social_post:
    "Get the full detail of a single social post by ID, including its current status and whether " +
    "the platform accepted it. " +
    "Use this after any post_to_* tool to confirm a post actually went out — a successful create " +
    "means GoHighLevel queued it, and platform rejections surface afterwards. " +
    "Run list_social_posts first if you do not have the post ID.",

  update_social_post:
    "Edit the caption or media of an existing social post that has not gone out yet. " +
    "This modifies existing data — the values you provide replace what is there. " +
    "Works on draft and scheduled posts; published posts cannot be edited through the API. " +
    "To change WHEN a post goes out, use schedule_social_post — this tool does not touch the " +
    "schedule. Requires a post ID from list_social_posts.",

  delete_social_post:
    "Delete a social post from the GoHighLevel Social Planner. This cannot be undone. " +
    "If the post has already been published, deleting it here may not remove it from the social " +
    "platform itself. " +
    "Run list_social_posts first to get the post ID and confirm you have the right post.",

  get_social_stats:
    "Get social media performance from GoHighLevel's Social Planner statistics: posts, impressions, " +
    "reach, likes, comments, shares and newFollowers (followers GAINED in the period, not the total " +
    "follower count), as overall totals and per platform. Covers every connected account that has " +
    "statistics set up, including posts made directly on the platforms, not just ones scheduled in " +
    "GoHighLevel. These are ACCOUNT-LEVEL totals: there is no per-post breakdown. " +
    "fromDate and toDate are both optional; give both or neither. With neither you get the last 7 days. " +
    "Any period works, years back included; GoHighLevel picks the grouping from the length (daily for " +
    "a week, monthly for a year, yearly beyond). compareToPrevious (default true) adds changePercent " +
    "against the equal-length period just before. Narrow with platforms, or with accountIds from " +
    "list_social_accounts to separate two accounts on one platform (e.g. a LinkedIn page and profile). " +
    "includeSeries adds the figures per time bucket for trends. Instagram audience age and gender " +
    "come back as demographics. accountsWithoutStats lists accounts that could not be included — " +
    "TikTok only reports for Business accounts.",
};
