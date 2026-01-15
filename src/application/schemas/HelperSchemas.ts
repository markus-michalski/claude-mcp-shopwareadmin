import { z } from 'zod';
import { shopwareIdOptional } from './validators.js';

// =============================================================================
// Helper Tool Input Schemas
// =============================================================================

/**
 * get_properties - Get available property groups and values
 */
export const GetPropertiesInput = z.object({
  groupId: shopwareIdOptional('Invalid group ID format').describe(
    'Filter by specific property group'
  ),
});
export type GetPropertiesInput = z.infer<typeof GetPropertiesInput>;

/**
 * get_manufacturers - List manufacturers/brands
 */
export const GetManufacturersInput = z.object({
  search: z
    .string()
    .max(100, 'Search term too long')
    .optional()
    .describe('Search manufacturer names'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe('Maximum results'),
});
export type GetManufacturersInput = z.infer<typeof GetManufacturersInput>;

/**
 * snippet_list - List available product snippets
 *
 * Note: Language is determined by Shopware's API context (sw-language-id header).
 * The mmd_product_snippet entity uses Shopware's standard translation system.
 */
export const SnippetListInput = z.object({
  activeOnly: z
    .boolean()
    .default(true)
    .describe('Only return active snippets'),
});
export type SnippetListInput = z.infer<typeof SnippetListInput>;
