import { z } from 'zod';

// =============================================================================
// Helper Tool Input Schemas
// =============================================================================

/**
 * get_properties - Get available property groups and values
 */
export const GetPropertiesInput = z.object({
  groupId: z
    .string()
    .uuid('Invalid group ID format')
    .optional()
    .describe('Filter by specific property group'),
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
 */
export const SnippetListInput = z.object({
  activeOnly: z
    .boolean()
    .default(true)
    .describe('Only return active snippets'),
  locale: z
    .enum(['de-DE', 'en-GB'])
    .default('de-DE')
    .describe('Language for translated content'),
});
export type SnippetListInput = z.infer<typeof SnippetListInput>;
