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
