/**
 * Zod schemas for Mail Template tool inputs
 */
import { z } from 'zod';
import { shopwareId, shopwareIdOptional } from './validators.js';

// =============================================================================
// Mail Template Tool Input Schemas
// =============================================================================

/**
 * mail_template_list - List all mail templates
 */
export const MailTemplateListInput = z.object({
  search: z
    .string()
    .max(255, 'Search term too long')
    .optional()
    .describe('Search in template type name or subject'),
  limit: z
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(50)
    .describe('Maximum results to return'),
  offset: z
    .number()
    .int()
    .min(0, 'Offset cannot be negative')
    .default(0)
    .describe('Offset for pagination'),
});
export type MailTemplateListInput = z.infer<typeof MailTemplateListInput>;

/**
 * mail_template_get - Get a specific mail template
 */
export const MailTemplateGetInput = z
  .object({
    id: shopwareIdOptional('Invalid mail template ID format').describe(
      'Mail template ID (32-char hex)'
    ),
    technicalName: z
      .string()
      .min(1)
      .max(255)
      .optional()
      .describe('Technical name (e.g., "order_confirmation_mail")'),
  })
  .refine((data) => data.id ?? data.technicalName, {
    message: 'Either id or technicalName must be provided',
  });
export type MailTemplateGetInput = z.infer<typeof MailTemplateGetInput>;

/**
 * mail_template_update - Update mail template content
 */
export const MailTemplateUpdateInput = z.object({
  id: shopwareId('Invalid mail template ID format').describe(
    'Mail template ID to update'
  ),
  subject: z
    .string()
    .min(1, 'Subject cannot be empty')
    .max(998, 'Subject too long (RFC 2822 limit)')
    .optional()
    .describe('New subject line (supports Twig: {{ order.orderNumber }})'),
  contentHtml: z
    .string()
    .max(16777215, 'HTML content too long')
    .optional()
    .describe('New HTML body (supports Twig templates)'),
  contentPlain: z
    .string()
    .max(16777215, 'Plain text content too long')
    .optional()
    .describe('New plain text body (supports Twig templates)'),
  senderName: z
    .string()
    .max(255, 'Sender name too long')
    .optional()
    .describe('Sender display name'),
  description: z
    .string()
    .max(65535, 'Description too long')
    .optional()
    .describe('Admin description/notes'),
});
export type MailTemplateUpdateInput = z.infer<typeof MailTemplateUpdateInput>;

/**
 * mail_template_send_test - Send a test mail
 */
export const MailTemplateSendTestInput = z.object({
  mailTemplateId: shopwareId('Invalid mail template ID format').describe(
    'Mail template ID to test'
  ),
  recipient: z
    .string()
    .email('Invalid email address')
    .max(254, 'Email too long (RFC 5321 limit)')
    .refine(
      (email) => !email.toLowerCase().includes('localhost'),
      'Email must use a valid domain, not localhost'
    )
    .refine(
      (email) => !/@\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(email),
      'Email must use a valid domain, not IP address'
    )
    .describe('Recipient email address for test mail'),
  salesChannelId: shopwareIdOptional('Invalid sales channel ID format').describe(
    'Sales channel context (uses default if not provided)'
  ),
});
export type MailTemplateSendTestInput = z.infer<typeof MailTemplateSendTestInput>;
