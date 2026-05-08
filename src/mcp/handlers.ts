import { GHLEnv } from "../ghl/client.js";
import { searchContacts, getContact, createContact, updateContact, addNote, addTask, addTag } from "../ghl/contacts.js";
import { getOpportunities, getOpportunity, createOpportunity, updateOpportunity, getPipelines } from "../ghl/opportunities.js";
import { getConversationHistory } from "../ghl/conversations.js";
import { getUpcomingAppointments, addAppointment } from "../ghl/calendar.js";
import { listWorkflows, triggerWorkflow } from "../ghl/workflows.js";

export async function handleToolCall(
  env: GHLEnv,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case "search_contacts": {
      const query = args["query"] as string;
      return searchContacts(env, query);
    }

    case "get_opportunities": {
      return getOpportunities(env, {
        pipelineId: args["pipelineId"] as string | undefined,
        stageId: args["stageId"] as string | undefined,
        status: args["status"] as "open" | "won" | "lost" | "abandoned" | undefined,
        assignedTo: args["assignedTo"] as string | undefined,
        minValue: args["minValue"] as number | undefined,
        maxValue: args["maxValue"] as number | undefined,
        staleDays: args["staleDays"] as number | undefined,
      });
    }

    case "get_opportunity": {
      const opportunityId = args["opportunityId"] as string;
      return getOpportunity(env, opportunityId);
    }

    case "create_opportunity": {
      return createOpportunity(env, {
        name: args["name"] as string,
        pipelineId: args["pipelineId"] as string,
        stageId: args["stageId"] as string,
        contactId: args["contactId"] as string,
        monetaryValue: args["monetaryValue"] as number | undefined,
        status: args["status"] as "open" | "won" | "lost" | "abandoned" | undefined,
        assignedTo: args["assignedTo"] as string | undefined,
      });
    }

    case "update_opportunity": {
      return updateOpportunity(env, args["opportunityId"] as string, {
        name: args["name"] as string | undefined,
        stageId: args["stageId"] as string | undefined,
        status: args["status"] as "open" | "won" | "lost" | "abandoned" | undefined,
        monetaryValue: args["monetaryValue"] as number | undefined,
        assignedTo: args["assignedTo"] as string | undefined,
      });
    }

    case "list_workflows": {
      return listWorkflows(env);
    }

    case "trigger_workflow": {
      return triggerWorkflow(
        env,
        args["contactId"] as string,
        args["workflowId"] as string,
        args["eventStartTime"] as string | undefined
      );
    }

    case "get_pipelines": {
      return getPipelines(env);
    }

    case "get_upcoming_appointments": {
      return getUpcomingAppointments(env, {
        contactId: args["contactId"] as string | undefined,
        daysAhead: args["daysAhead"] as number | undefined,
      });
    }

    case "get_conversation_history": {
      const contactId = args["contactId"] as string;
      const limit = args["limit"] as number | undefined;
      return getConversationHistory(env, contactId, limit);
    }

    case "add_appointment": {
      return addAppointment(
        env,
        args["contactId"] as string,
        args["title"] as string,
        args["startTime"] as string,
        args["endTime"] as string,
        args["calendarId"] as string | undefined
      );
    }

    case "add_tag": {
      return addTag(
        env,
        args["contactId"] as string,
        args["tags"] as string[]
      );
    }

    case "add_task": {
      return addTask(
        env,
        args["contactId"] as string,
        args["title"] as string,
        args["dueDate"] as string,
        args["body"] as string | undefined
      );
    }

    case "add_note": {
      const contactId = args["contactId"] as string;
      const body = args["body"] as string;
      return addNote(env, contactId, body);
    }

    case "update_contact": {
      const contactId = args["contactId"] as string;
      return updateContact(env, contactId, {
        firstName: args["firstName"] as string | undefined,
        lastName: args["lastName"] as string | undefined,
        email: args["email"] as string | undefined,
        phone: args["phone"] as string | undefined,
        companyName: args["companyName"] as string | undefined,
        source: args["source"] as string | undefined,
        tags: args["tags"] as string[] | undefined,
      });
    }

    case "create_contact": {
      return createContact(env, {
        firstName: args["firstName"] as string | undefined,
        lastName: args["lastName"] as string | undefined,
        email: args["email"] as string | undefined,
        phone: args["phone"] as string | undefined,
        companyName: args["companyName"] as string | undefined,
        source: args["source"] as string | undefined,
        tags: args["tags"] as string[] | undefined,
      });
    }

    case "get_contact": {
      const contactId = args["contactId"] as string;
      return getContact(env, contactId);
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
