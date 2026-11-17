import type { OpportunityStatus } from "../constants.js";

export interface Contact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  source?: string;
  tags?: string[];
  assignedTo?: string;
  dateAdded?: string;
  dateUpdated?: string;
  [key: string]: unknown;
}

export interface ContactSummary {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  tags?: string[];
}

export interface Note {
  id: string;
  body: string;
  userId?: string;
  dateAdded?: string;
  [key: string]: unknown;
}

export interface Opportunity {
  id: string;
  name?: string;
  status?: OpportunityStatus;
  monetaryValue?: number;
  pipelineId?: string;
  pipelineStageId?: string;
  contactId?: string;
  assignedTo?: string;
  lastActivityDate?: string;
  updatedAt?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface PipelineStage {
  id: string;
  name?: string;
  position?: number;
}

export interface Pipeline {
  id: string;
  name?: string;
  stages?: PipelineStage[];
  [key: string]: unknown;
}

export interface Appointment {
  id?: string;
  title?: string;
  contactId?: string;
  startTime?: string;
  endTime?: string;
  appointmentStatus?: string;
  [key: string]: unknown;
}

export interface Workflow {
  id: string;
  name?: string;
  status?: string;
  [key: string]: unknown;
}

export interface Message {
  id?: string;
  type?: string;
  body?: string;
  direction?: string;
  dateAdded?: string;
  [key: string]: unknown;
}

export interface Task {
  id?: string;
  title?: string;
  body?: string;
  dueDate?: string;
  completed?: boolean;
  assignedTo?: string;
  [key: string]: unknown;
}

export interface SocialAccount {
  id: string;
  platform: string;
  /** False for platforms connected in GHL that this server has no posting tool for. */
  supported: boolean;
  name?: string;
  /**
   * The 24-character id the statistics endpoint wants. Not derivable from `id`:
   * it lives only in GHL's accounts listing, which this token cannot read, so it
   * comes from config alongside the rest. Absent means no statistics for this account.
   */
  profileId?: string;
}

export interface MediaItem {
  url: string;
  // Explicit `| undefined` because these values arrive straight from a Zod
  // schema, whose optional properties are typed `string | undefined`, and
  // exactOptionalPropertyTypes rejects that against a bare `caption?: string`.
  // Harmless on the wire: JSON.stringify omits undefined-valued keys.
  caption?: string | undefined;
  altText?: string | undefined;
}

export interface SocialPost {
  id: string;
  status?: string;
  summary?: string;
  scheduleDate?: string;
  accountIds?: string[];
  [key: string]: unknown;
}
