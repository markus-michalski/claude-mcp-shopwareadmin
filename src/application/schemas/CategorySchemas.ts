import { z } from 'zod';
import { shopwareId, shopwareIdOptional } from './validators.js';

// =============================================================================
// Category Tool Input Schemas
// =============================================================================

/**
 * category_list - Get category tree
 */
export const CategoryListInput = z.object({
  parentId: shopwareIdOptional('Invalid parent ID format').describe(
    'Only show children of this category'
  ),
  depth: z
    .number()
    .int()
    .min(1, 'Depth must be at least 1')
    .max(10, 'Depth cannot exceed 10 levels')
    .default(3)
    .describe('How many levels deep to fetch'),
  includeInactive: z
    .boolean()
    .default(false)
    .describe('Include inactive categories'),
});
export type CategoryListInput = z.infer<typeof CategoryListInput>;

/**
 * category_get - Get single category details
 */
export const CategoryGetInput = z.object({
  id: shopwareId('Invalid category ID format').describe('Category ID'),
  includeProducts: z
    .boolean()
    .default(false)
    .describe('Include products in this category'),
  productLimit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25)
    .describe('Maximum products to include'),
});
export type CategoryGetInput = z.infer<typeof CategoryGetInput>;

/**
 * category_generate_content - Generate SEO text for category
 */
export const CategoryGenerateContentInput = z.object({
  id: shopwareId('Invalid category ID format').describe('Category ID'),
  style: z
    .string()
    .optional()
    .describe('Content style profile name (auto-detected if not specified)'),
  maxLength: z
    .number()
    .int()
    .min(100, 'Minimum length is 100 characters')
    .max(2000, 'Maximum length is 2000 characters')
    .default(500)
    .describe('Maximum text length in characters'),
});
export type CategoryGenerateContentInput = z.infer<typeof CategoryGenerateContentInput>;

/**
 * category_update - Update category SEO data and description
 */
export const CategoryUpdateInput = z.object({
  id: shopwareId('Invalid category ID format').describe('Category ID to update'),
  description: z
    .string()
    .max(65535, 'Description too long')
    .optional()
    .describe('Category description (HTML)'),
  metaTitle: z
    .string()
    .max(255, 'Meta title too long')
    .optional()
    .describe('SEO title'),
  metaDescription: z
    .string()
    .max(255, 'Meta description too long')
    .optional()
    .describe('SEO description'),
  keywords: z
    .string()
    .max(255, 'Keywords too long')
    .optional()
    .describe('SEO keywords (comma-separated)'),
});
export type CategoryUpdateInput = z.infer<typeof CategoryUpdateInput>;
