/**
 * Flow domain types
 *
 * Defines the structure of Shopware Flow Builder flows and sequences
 * as used by the Shopware 6 Admin API.
 */

/**
 * Flow action types that send emails
 */
export const MAIL_SENDING_ACTIONS = [
  'action.mail.send',
  'action.mail.send.create.document',
] as const;

/**
 * Flow Sequence - Individual action or condition in a flow
 */
export interface FlowSequence {
  id: string;
  parentId: string | null;
  flowId: string;
  ruleId: string | null;
  actionName: string | null;
  config: Record<string, unknown> | null;
  position: number;
  displayGroup: number;
  trueCase: boolean;
  // Resolved relations
  rule?: {
    id: string;
    name: string;
    priority: number;
  } | null;
  children?: FlowSequence[];
}

/**
 * Complete flow entity with all sequences
 */
export interface Flow {
  id: string;
  name: string;
  eventName: string;
  priority: number;
  active: boolean;
  invalid: boolean;
  description: string | null;
  // Resolved sequences
  sequences: FlowSequence[];
  // Timestamps
  createdAt: string;
  updatedAt: string | null;
}

/**
 * Lightweight flow for list views
 */
export interface FlowListItem {
  id: string;
  name: string;
  eventName: string;
  priority: number;
  active: boolean;
  invalid: boolean;
  description: string | null;
  // Extracted info
  actionCount: number;
  hasMailAction: boolean;
  updatedAt: string | null;
}

/**
 * Flow action details extracted from sequence
 */
export interface FlowAction {
  sequenceId: string;
  actionName: string;
  config: Record<string, unknown>;
  position: number;
  // For mail actions
  mailTemplateId?: string;
  mailTemplateTypeId?: string;
}

/**
 * Summary of a flow's mail-sending capabilities
 */
export interface FlowMailSummary {
  flowId: string;
  flowName: string;
  eventName: string;
  active: boolean;
  mailActions: Array<{
    actionName: string;
    mailTemplateId?: string;
    recipient?: string;
    replyTo?: string;
  }>;
}
