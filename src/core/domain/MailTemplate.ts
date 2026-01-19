/**
 * Mail Template domain types
 *
 * Defines the structure of mail templates and related entities
 * as used by the Shopware 6 Admin API.
 */

/**
 * Mail Template Type (defines available templates)
 * Examples: "order_confirmation_mail", "customer_register", "contact_form"
 */
export interface MailTemplateType {
  id: string;
  technicalName: string;
  name: string;
  availableEntities: Record<string, string> | null;
}

/**
 * Complete mail template entity
 */
export interface MailTemplate {
  id: string;
  mailTemplateTypeId: string;
  systemDefault: boolean;
  senderName: string | null;
  subject: string;
  contentHtml: string;
  contentPlain: string;
  description: string | null;
  // Resolved relation
  templateType: MailTemplateType | null;
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

/**
 * Lightweight mail template for list views
 */
export interface MailTemplateListItem {
  id: string;
  technicalName: string;
  typeName: string;
  subject: string;
  systemDefault: boolean;
  updatedAt: string;
}

/**
 * Result of test mail send
 */
export interface SendTestMailResult {
  success: boolean;
  recipient: string;
  mailTemplateId: string;
  templateType: string;
}
