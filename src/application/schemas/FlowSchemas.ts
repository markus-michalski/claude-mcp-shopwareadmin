/**
 * Zod schemas for Flow tool inputs
 */
import { z } from 'zod';
import { shopwareId, shopwareIdOptional } from './validators.js';

// =============================================================================
// Flow Tool Input Schemas
// =============================================================================

/**
 * flow_list - List all flows with optional filters
 */
export const FlowListInput = z.object({
  active: z
    .boolean()
    .optional()
    .describe('Filter by active status'),
  eventName: z
    .string()
    .max(255, 'Event name too long')
    .optional()
    .describe('Filter by event name (e.g., "checkout.order.placed")'),
  search: z
    .string()
    .max(255, 'Search term too long')
    .optional()
    .describe('Search in flow name or description'),
  hasMailAction: z
    .boolean()
    .optional()
    .describe('Filter to only flows that send emails'),
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
export type FlowListInput = z.infer<typeof FlowListInput>;

/**
 * flow_get - Get a specific flow with all sequences
 */
export const FlowGetInput = z
  .object({
    id: shopwareIdOptional('Invalid flow ID format').describe(
      'Flow ID (32-char hex)'
    ),
    name: z
      .string()
      .min(1)
      .max(255)
      .optional()
      .describe('Flow name (exact match)'),
  })
  .refine((data) => data.id ?? data.name, {
    message: 'Either id or name must be provided',
  });
export type FlowGetInput = z.infer<typeof FlowGetInput>;

/**
 * flow_toggle - Activate or deactivate a flow
 */
export const FlowToggleInput = z.object({
  id: shopwareId('Invalid flow ID format').describe('Flow ID to toggle'),
  active: z.boolean().describe('New active status'),
});
export type FlowToggleInput = z.infer<typeof FlowToggleInput>;
