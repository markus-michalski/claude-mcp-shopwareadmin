/**
 * Zod schemas for SEO URL tool inputs
 */
import { z } from 'zod';
import { shopwareId, shopwareIdOptional } from './validators.js';

// =============================================================================
// SEO URL Tool Input Schemas
// =============================================================================

/**
 * seo_url_list - List SEO URLs with filters
 */
export const SeoUrlListInput = z.object({
  routeName: z
    .enum(['frontend.detail.page', 'frontend.navigation.page', 'frontend.landing.page'])
    .optional()
    .describe('Filter by route name (product, category, landing page)'),
  salesChannelId: shopwareIdOptional('Invalid sales channel ID format').describe(
    'Filter by sales channel (32-char hex)'
  ),
  foreignKey: shopwareIdOptional('Invalid entity ID format').describe(
    'Filter by entity ID (product/category ID, 32-char hex)'
  ),
  isCanonical: z
    .boolean()
    .optional()
    .describe('Filter by canonical status'),
  isDeleted: z
    .boolean()
    .optional()
    .describe('Filter by deleted status'),
  search: z
    .string()
    .min(2)
    .max(255)
    .optional()
    .describe('Search in seoPathInfo'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25)
    .describe('Max results (default: 25)'),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Pagination offset'),
});
export type SeoUrlListInput = z.infer<typeof SeoUrlListInput>;

/**
 * seo_url_audit - Audit SEO URLs for issues
 */
export const SeoUrlAuditInput = z.object({
  routeName: z
    .enum(['frontend.detail.page', 'frontend.navigation.page', 'frontend.landing.page'])
    .optional()
    .describe('Audit only specific route type'),
  salesChannelId: shopwareIdOptional('Invalid sales channel ID format').describe(
    'Audit only specific sales channel'
  ),
  limit: z
    .number()
    .int()
    .min(10)
    .max(500)
    .default(200)
    .describe('Max URLs to check (default: 200)'),
});
export type SeoUrlAuditInput = z.infer<typeof SeoUrlAuditInput>;

/**
 * seo_url_update - Update a single SEO URL
 */
export const SeoUrlUpdateInput = z.object({
  id: shopwareId('Invalid SEO URL ID format').describe(
    'SEO URL ID to update (32-char hex)'
  ),
  seoPathInfo: z
    .string()
    .min(1)
    .max(2048)
    .optional()
    .describe('New SEO path (e.g., "my-product-name")'),
  isCanonical: z
    .boolean()
    .optional()
    .describe('Set as canonical URL'),
  isDeleted: z
    .boolean()
    .optional()
    .describe('Mark as deleted'),
});
export type SeoUrlUpdateInput = z.infer<typeof SeoUrlUpdateInput>;

/**
 * seo_url_generate - Trigger SEO URL regeneration for a route
 */
export const SeoUrlGenerateInput = z.object({
  routeName: z
    .enum(['frontend.detail.page', 'frontend.navigation.page', 'frontend.landing.page'])
    .describe('Route to regenerate SEO URLs for'),
  salesChannelId: shopwareId('Invalid sales channel ID format').describe(
    'Sales channel to regenerate for (32-char hex)'
  ),
});
export type SeoUrlGenerateInput = z.infer<typeof SeoUrlGenerateInput>;
