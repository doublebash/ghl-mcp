export const toolDefinitions = [
  {
    name: "search_contacts",
    description:
      "Search for contacts in GoHighLevel by name, email, phone number, or company name. " +
      "Use this first when you need to find a specific person before reading or updating their record. " +
      "Returns a list of matching contacts with their IDs, names, emails, phone numbers, company, and tags.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description:
            "The search term — can be a full name, partial name, email address, phone number, or company name.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_opportunities",
    description:
      "Get a list of opportunities (deals) from GoHighLevel pipelines. " +
      "Supports filtering by pipeline, stage, status (open/won/lost/abandoned), assigned user, value range, and stale deals (no activity in X days). " +
      "Use this for pipeline reviews, finding stalled deals, or identifying high-value opportunities that need attention. " +
      "All filters are optional — omit them to get all open opportunities.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pipelineId: {
          type: "string" as const,
          description: "Filter by a specific pipeline ID. Omit to search across all pipelines.",
        },
        stageId: {
          type: "string" as const,
          description: "Filter by a specific pipeline stage ID.",
        },
        status: {
          type: "string" as const,
          enum: ["open", "won", "lost", "abandoned"],
          description: "Filter by opportunity status. Defaults to all statuses if omitted.",
        },
        assignedTo: {
          type: "string" as const,
          description: "Filter by assigned user ID.",
        },
        minValue: {
          type: "number" as const,
          description: "Only return opportunities with a monetary value at or above this amount.",
        },
        maxValue: {
          type: "number" as const,
          description: "Only return opportunities with a monetary value at or below this amount.",
        },
        staleDays: {
          type: "number" as const,
          description:
            "Only return opportunities with no activity in the last X days. " +
            "For example, 14 returns deals untouched for 2+ weeks.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_opportunity",
    description:
      "Get the full details of a single opportunity (deal) by its ID. " +
      "Use this after get_opportunities when you need to dig into a specific deal — " +
      "returns complete information including stage, value, contact, custom fields, and history. " +
      "Requires an opportunity ID from a previous get_opportunities call.",
    inputSchema: {
      type: "object" as const,
      properties: {
        opportunityId: {
          type: "string" as const,
          description: "The GHL opportunity ID (e.g. from a previous get_opportunities result).",
        },
      },
      required: ["opportunityId"],
    },
  },
  {
    name: "get_contact",
    description:
      "Get the full details of a single GoHighLevel contact by their ID. " +
      "Use this after search_contacts to get complete information including custom fields, tags, source, and attribution. " +
      "Requires a contact ID — run search_contacts first if you only have a name or email.",
    inputSchema: {
      type: "object" as const,
      properties: {
        contactId: {
          type: "string" as const,
          description: "The GHL contact ID (e.g. from a previous search_contacts result).",
        },
      },
      required: ["contactId"],
    },
  },
  {
    name: "get_conversation_history",
    description:
      "Get the recent message history for a GoHighLevel contact — includes emails, SMS, calls, and other communications. " +
      "Use this to understand the last time you spoke with someone, what was discussed, and what channel was used. " +
      "Essential context before drafting a follow-up. Requires a contact ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        contactId: {
          type: "string" as const,
          description: "The GHL contact ID to fetch conversation history for.",
        },
        limit: {
          type: "number" as const,
          description: "Maximum number of messages to return. Defaults to 20.",
        },
      },
      required: ["contactId"],
    },
  },
  {
    name: "get_upcoming_appointments",
    description:
      "Get upcoming calendar appointments from GoHighLevel. " +
      "Can fetch appointments for a specific contact, or show all upcoming appointments across your calendar. " +
      "Defaults to the next 30 days. Use this to check what's scheduled before a meeting or to get a weekly overview.",
    inputSchema: {
      type: "object" as const,
      properties: {
        contactId: {
          type: "string" as const,
          description:
            "Optional. The GHL contact ID to fetch appointments for. Omit to get all upcoming appointments across your calendar.",
        },
        daysAhead: {
          type: "number" as const,
          description:
            "How many days ahead to look. Defaults to 30. Only used when no contactId is provided.",
        },
      },
      required: [],
    },
  },
  {
    name: "list_workflows",
    description:
      "List all automation workflows available in your GoHighLevel account. " +
      "Returns each workflow's ID, name, and status. " +
      "Use this to see what automations exist before triggering one for a contact.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "trigger_workflow",
    description:
      "Trigger a GoHighLevel automation workflow for a specific contact. " +
      "Use this to enrol a contact into a nurture sequence, send an automated message, or kick off any GHL workflow. " +
      "Run list_workflows first to get the workflow ID. Requires a contact ID and workflow ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string" as const, description: "The GHL contact ID to trigger the workflow for." },
        workflowId: { type: "string" as const, description: "The GHL workflow ID to trigger (from list_workflows)." },
        eventStartTime: {
          type: "string" as const,
          description: "Optional. ISO 8601 datetime for when the workflow should start, e.g. '2026-05-01T09:00:00+12:00'. Defaults to now.",
        },
      },
      required: ["contactId", "workflowId"],
    },
  },
  {
    name: "get_pipelines",
    description:
      "List all sales pipelines in GoHighLevel, including each pipeline's stages with their IDs and names. " +
      "Use this before create_opportunity when you need to know which pipelineId and stageId to use. " +
      "Returns a structured view of every pipeline and its ordered stages.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "add_appointment",
    description:
      "Create a calendar appointment in GoHighLevel for a contact. " +
      "Use this to book a meeting, call, or shoot with a client. " +
      "Times must be in ISO 8601 format with timezone offset. Requires a contact ID, title, start and end time.",
    inputSchema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string" as const, description: "The GHL contact ID to book the appointment for." },
        title: { type: "string" as const, description: "Appointment title, e.g. 'Discovery call' or 'Property shoot — 12 View Rd'." },
        startTime: { type: "string" as const, description: "Start time in ISO 8601 format, e.g. '2026-05-10T09:00:00+12:00'." },
        endTime: { type: "string" as const, description: "End time in ISO 8601 format, e.g. '2026-05-10T10:00:00+12:00'." },
        calendarId: { type: "string" as const, description: "Optional. GHL calendar ID to book into. Defaults to your primary calendar." },
      },
      required: ["contactId", "title", "startTime", "endTime"],
    },
  },
  {
    name: "add_tag",
    description:
      "Add one or more tags to a GoHighLevel contact without removing existing tags. " +
      "Use this to categorise a contact, mark an interest, or trigger tag-based automations in GHL. " +
      "Requires a contact ID and at least one tag.",
    inputSchema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string" as const, description: "The GHL contact ID to tag." },
        tags: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "One or more tags to add, e.g. ['real estate agent', 'auckland'].",
        },
      },
      required: ["contactId", "tags"],
    },
  },
  {
    name: "add_task",
    description:
      "Create a follow-up task for a GoHighLevel contact. " +
      "Use this to set a reminder to call, email, or follow up with someone by a specific date. " +
      "Tasks appear in GHL's task list and are assigned to you. Requires a contact ID and due date.",
    inputSchema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string" as const, description: "The GHL contact ID to create the task for." },
        title: { type: "string" as const, description: "The task title, e.g. 'Follow up call' or 'Send proposal'." },
        dueDate: { type: "string" as const, description: "Due date in ISO 8601 format, e.g. '2026-05-10T09:00:00.000Z'." },
        body: { type: "string" as const, description: "Optional task description or notes." },
      },
      required: ["contactId", "title", "dueDate"],
    },
  },
  {
    name: "add_note",
    description:
      "Append a note to a GoHighLevel contact record. " +
      "Use this to log a call summary, record what was discussed in a meeting, or save research about a contact. " +
      "Notes are visible in the contact's timeline in GHL. Requires a contact ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string" as const, description: "The GHL contact ID to add the note to." },
        body: { type: "string" as const, description: "The note content to add." },
      },
      required: ["contactId", "body"],
    },
  },
  {
    name: "update_contact",
    description:
      "Update an existing GoHighLevel contact's details. " +
      "Only the fields you provide will be changed — omitted fields are left as-is. " +
      "Use this to correct information, add a phone number, update a company name, or change custom fields. " +
      "Requires a contact ID — run search_contacts first if you only have a name.",
    inputSchema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string" as const, description: "The GHL contact ID to update." },
        firstName: { type: "string" as const, description: "Updated first name." },
        lastName: { type: "string" as const, description: "Updated last name." },
        email: { type: "string" as const, description: "Updated email address." },
        phone: { type: "string" as const, description: "Updated phone number including country code." },
        companyName: { type: "string" as const, description: "Updated company or organisation name." },
        source: { type: "string" as const, description: "Updated lead source." },
        tags: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Replace the contact's tags with this list.",
        },
      },
      required: ["contactId"],
    },
  },
  {
    name: "create_opportunity",
    description:
      "Create a new opportunity (deal) in a GoHighLevel pipeline. " +
      "Use this when a contact becomes a qualified lead and you want to track the deal. " +
      "Requires a pipeline ID and stage ID — use get_opportunities first to see available pipeline and stage IDs. " +
      "Returns the created opportunity including its new ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string" as const, description: "The opportunity name, e.g. 'Basheer — Brand Video Package'." },
        pipelineId: { type: "string" as const, description: "The GHL pipeline ID to add this opportunity to." },
        stageId: { type: "string" as const, description: "The pipeline stage ID the opportunity should start in." },
        contactId: { type: "string" as const, description: "The GHL contact ID to associate with this opportunity." },
        monetaryValue: { type: "number" as const, description: "Optional deal value in dollars." },
        status: {
          type: "string" as const,
          enum: ["open", "won", "lost", "abandoned"],
          description: "Opportunity status. Defaults to 'open'.",
        },
        assignedTo: { type: "string" as const, description: "Optional. GHL user ID to assign this opportunity to." },
      },
      required: ["name", "pipelineId", "stageId", "contactId"],
    },
  },
  {
    name: "update_opportunity",
    description:
      "Update an existing opportunity (deal) in GoHighLevel. " +
      "Use this to move a deal to a new stage, change its value, mark it as won or lost, or reassign it. " +
      "Only the fields you provide will be changed. Requires an opportunity ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        opportunityId: { type: "string" as const, description: "The GHL opportunity ID to update." },
        name: { type: "string" as const, description: "Updated opportunity name." },
        stageId: { type: "string" as const, description: "Updated pipeline stage ID (to move the deal to a new stage)." },
        status: {
          type: "string" as const,
          enum: ["open", "won", "lost", "abandoned"],
          description: "Updated opportunity status.",
        },
        monetaryValue: { type: "number" as const, description: "Updated deal value in dollars." },
        assignedTo: { type: "string" as const, description: "Updated assigned GHL user ID." },
      },
      required: ["opportunityId"],
    },
  },
  {
    name: "create_contact",
    description:
      "Create a new contact in GoHighLevel. " +
      "Use this when researching a person or company and adding them to the CRM, or when a new lead needs to be created manually. " +
      "Returns the created contact including their new GHL contact ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        firstName: { type: "string" as const, description: "Contact's first name." },
        lastName: { type: "string" as const, description: "Contact's last name." },
        email: { type: "string" as const, description: "Contact's email address." },
        phone: { type: "string" as const, description: "Contact's phone number including country code, e.g. +6421123456." },
        companyName: { type: "string" as const, description: "Company or organisation the contact belongs to." },
        source: { type: "string" as const, description: "Where this contact came from, e.g. 'LinkedIn', 'Referral', 'Web'." },
        tags: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Tags to apply to the contact on creation, e.g. ['real estate agent', 'auckland'].",
        },
      },
      required: [],
    },
  },
];
