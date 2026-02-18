/**
 * Zod schemas for Cross-Selling tool inputs
 */
import { z } from 'zod';
import { shopwareId, shopwareIdOptional } from './validators.js';

// =============================================================================
// Cross-Selling Tool Input Schemas
// =============================================================================

/**
 * cross_selling_list - List cross-sellings for a product
 */
export const CrossSellingListInput = z.object({
  productId: shopwareId('Invalid product ID format').describe(
    'Product ID to list cross-sellings for (32-char hex)'
  ),
});
export type CrossSellingListInput = z.infer<typeof CrossSellingListInput>;

/**
 * cross_selling_get - Get cross-selling details
 */
export const CrossSellingGetInput = z.object({
  id: shopwareId('Invalid cross-selling ID format').describe(
    'Cross-selling ID (32-char hex)'
  ),
});
export type CrossSellingGetInput = z.infer<typeof CrossSellingGetInput>;

/**
 * cross_selling_create - Create a cross-selling group
 */
export const CrossSellingCreateInput = z.object({
  productId: shopwareId('Invalid product ID format').describe(
    'Source product ID (32-char hex)'
  ),
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name too long')
    .describe('Cross-selling group name (e.g., "Accessories", "Similar Products")'),
  type: z
    .enum(['productList', 'productStream'])
    .default('productList')
    .describe('Type: productList (manual) or productStream (dynamic)'),
  active: z
    .boolean()
    .default(true)
    .describe('Whether the cross-selling is active'),
  position: z
    .number()
    .int()
    .min(0)
    .default(1)
    .describe('Display position (lower = first)'),
  sortBy: z
    .enum(['name', 'cheapestPrice', 'releaseDate', 'productNumber'])
    .optional()
    .describe('Sort assigned products by'),
  sortDirection: z
    .enum(['ASC', 'DESC'])
    .optional()
    .describe('Sort direction'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(24)
    .describe('Max products to display'),
  assignedProductIds: z
    .array(shopwareId('Invalid product ID format'))
    .optional()
    .describe('Product IDs to assign (for type=productList)'),
  productStreamId: shopwareIdOptional('Invalid product stream ID format').describe(
    'Product stream ID (for type=productStream)'
  ),
});
export type CrossSellingCreateInput = z.infer<typeof CrossSellingCreateInput>;

/**
 * cross_selling_update - Update cross-selling
 */
export const CrossSellingUpdateInput = z.object({
  id: shopwareId('Invalid cross-selling ID format').describe(
    'Cross-selling ID to update (32-char hex)'
  ),
  name: z.string().min(1).max(255).optional().describe('New name'),
  active: z.boolean().optional().describe('New active status'),
  position: z.number().int().min(0).optional().describe('New position'),
  sortBy: z
    .enum(['name', 'cheapestPrice', 'releaseDate', 'productNumber'])
    .optional()
    .describe('New sort field'),
  sortDirection: z.enum(['ASC', 'DESC']).optional().describe('New sort direction'),
  limit: z.number().int().min(1).max(100).optional().describe('New limit'),
  assignedProductIds: z
    .array(shopwareId('Invalid product ID format'))
    .optional()
    .describe('Replace assigned products (for type=productList)'),
});
export type CrossSellingUpdateInput = z.infer<typeof CrossSellingUpdateInput>;

/**
 * cross_selling_suggest - Get AI suggestion context for cross-selling
 */
export const CrossSellingSuggestInput = z.object({
  productId: shopwareId('Invalid product ID format').describe(
    'Product ID to get suggestions for (32-char hex)'
  ),
  limit: z
    .number()
    .int()
    .min(5)
    .max(50)
    .default(20)
    .describe('Max candidate products to return for suggestion'),
});
export type CrossSellingSuggestInput = z.infer<typeof CrossSellingSuggestInput>;
