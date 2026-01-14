import { z } from 'zod';

// =============================================================================
// Content Generation Tool Input Schemas
// =============================================================================

/**
 * product_generate_content - Generate product description
 */
export const ProductGenerateContentInput = z.object({
  productId: z
    .string()
    .uuid('Invalid product ID format')
    .describe('Product ID to generate content for'),
  style: z
    .enum(['creative', 'software'])
    .optional()
    .describe('Content style (auto-detected from category if not specified)'),
  maxLength: z
    .number()
    .int()
    .min(200, 'Minimum length is 200 characters')
    .max(5000, 'Maximum length is 5000 characters')
    .default(1000)
    .describe('Maximum description length in characters'),
  includeSnippets: z
    .boolean()
    .default(true)
    .describe('Include available snippets (software style only)'),
  snippetIds: z
    .array(z.string())
    .optional()
    .describe('Specific snippet identifiers to include'),
});
export type ProductGenerateContentInput = z.infer<typeof ProductGenerateContentInput>;

/**
 * product_generate_seo - Generate SEO metadata
 */
export const ProductGenerateSeoInput = z.object({
  productId: z
    .string()
    .uuid('Invalid product ID format')
    .describe('Product ID'),
  style: z
    .enum(['creative', 'software'])
    .optional()
    .describe('Content style (auto-detected if not specified)'),
  maxTitleLength: z
    .number()
    .int()
    .min(30, 'Title should be at least 30 characters')
    .max(70, 'Title should not exceed 70 characters')
    .default(60)
    .describe('Maximum meta title length'),
  maxDescriptionLength: z
    .number()
    .int()
    .min(100, 'Description should be at least 100 characters')
    .max(160, 'Description should not exceed 160 characters')
    .default(155)
    .describe('Maximum meta description length'),
});
export type ProductGenerateSeoInput = z.infer<typeof ProductGenerateSeoInput>;

/**
 * variant_generate_content - Generate variant-specific description
 */
export const VariantGenerateContentInput = z.object({
  variantId: z
    .string()
    .uuid('Invalid variant ID format')
    .describe('Variant product ID'),
  inheritFromParent: z
    .boolean()
    .default(true)
    .describe('Inherit context from parent product'),
  focusOnOptions: z
    .boolean()
    .default(true)
    .describe('Emphasize variant-specific options (color, size, etc.)'),
});
export type VariantGenerateContentInput = z.infer<typeof VariantGenerateContentInput>;

/**
 * content_update - Save generated content to product
 */
export const ContentUpdateInput = z.object({
  productId: z
    .string()
    .uuid('Invalid product ID format')
    .describe('Product ID to update'),
  description: z
    .string()
    .max(65535, 'Description too long')
    .optional()
    .describe('New product description (HTML)'),
  metaTitle: z
    .string()
    .max(255, 'Meta title too long')
    .optional()
    .describe('SEO meta title'),
  metaDescription: z
    .string()
    .max(255, 'Meta description too long')
    .optional()
    .describe('SEO meta description'),
  keywords: z
    .string()
    .max(255, 'Keywords too long')
    .optional()
    .describe('SEO keywords (comma-separated)'),
});
export type ContentUpdateInput = z.infer<typeof ContentUpdateInput>;
