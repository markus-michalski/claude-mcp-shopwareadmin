import { z } from 'zod';

// =============================================================================
// Category Tool Input Schemas
// =============================================================================

/**
 * category_list - Get category tree
 */
export const CategoryListInput = z.object({
  parentId: z
    .string()
    .uuid('Invalid parent ID format')
    .optional()
    .describe('Only show children of this category'),
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
  id: z
    .string()
    .uuid('Invalid category ID format')
    .describe('Category ID'),
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
  id: z
    .string()
    .uuid('Invalid category ID format')
    .describe('Category ID'),
  style: z
    .enum(['creative', 'software'])
    .optional()
    .describe('Content style (auto-detected if not specified)'),
  maxLength: z
    .number()
    .int()
    .min(100, 'Minimum length is 100 characters')
    .max(2000, 'Maximum length is 2000 characters')
    .default(500)
    .describe('Maximum text length in characters'),
});
export type CategoryGenerateContentInput = z.infer<typeof CategoryGenerateContentInput>;
