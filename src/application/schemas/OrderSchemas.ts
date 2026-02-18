/**
 * Zod schemas for Order tool inputs (read-only)
 *
 * Orders are read-only in this MCP server.
 * No status changes, cancellations, or modifications.
 */
import { z } from 'zod';
import { shopwareId, shopwareIdOptional } from './validators.js';

// =============================================================================
// Order Tool Input Schemas
// =============================================================================

/**
 * order_list - List orders with filters
 */
export const OrderListInput = z.object({
  orderStatus: z
    .enum(['open', 'in_progress', 'completed', 'cancelled'])
    .optional()
    .describe('Filter by order status'),
  paymentStatus: z
    .enum([
      'open', 'authorized', 'paid', 'paid_partially',
      'refunded', 'refunded_partially', 'failed', 'cancelled',
      'unconfirmed', 'reminded', 'chargeback',
    ])
    .optional()
    .describe('Filter by payment status'),
  deliveryStatus: z
    .enum(['open', 'shipped', 'shipped_partially', 'returned', 'returned_partially', 'cancelled'])
    .optional()
    .describe('Filter by delivery status'),
  customerEmail: z
    .string()
    .max(254)
    .optional()
    .describe('Filter by customer email (partial match)'),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/, 'Date must be ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)')
    .optional()
    .describe('Filter orders from this date (ISO 8601, e.g., "2025-01-01")'),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/, 'Date must be ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)')
    .optional()
    .describe('Filter orders until this date (ISO 8601, e.g., "2025-12-31")'),
  limit: z
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(25)
    .describe('Maximum results to return'),
  offset: z
    .number()
    .int()
    .min(0, 'Offset cannot be negative')
    .default(0)
    .describe('Offset for pagination'),
});
export type OrderListInput = z.infer<typeof OrderListInput>;

/**
 * order_get - Get single order details
 */
export const OrderGetInput = z
  .object({
    id: shopwareIdOptional('Invalid order ID format').describe(
      'Order ID (32-char hex)'
    ),
    orderNumber: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe('Order number (e.g., "10001")'),
  })
  .refine((data) => data.id ?? data.orderNumber, {
    message: 'Either id or orderNumber must be provided',
  });
export type OrderGetInput = z.infer<typeof OrderGetInput>;

/**
 * order_stats - Get order statistics
 */
export const OrderStatsInput = z.object({
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/, 'Date must be ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)')
    .optional()
    .describe('Start date for statistics (ISO 8601, e.g., "2025-01-01")'),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/, 'Date must be ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)')
    .optional()
    .describe('End date for statistics (ISO 8601, e.g., "2025-12-31")'),
});
export type OrderStatsInput = z.infer<typeof OrderStatsInput>;
