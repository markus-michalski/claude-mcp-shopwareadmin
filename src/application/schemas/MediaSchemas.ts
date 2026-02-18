/**
 * Zod schemas for Media tool inputs
 *
 * Focused on BFSG compliance: the hasAlt filter and audit tools
 * are designed to find and fix missing alt texts.
 */
import { z } from 'zod';
import { shopwareId, shopwareIdOptional } from './validators.js';

// =============================================================================
// Media Tool Input Schemas
// =============================================================================

/**
 * media_list - List media with filters
 */
export const MediaListInput = z.object({
  mediaFolderId: shopwareIdOptional('Invalid media folder ID format').describe(
    'Filter by media folder (32-char hex)'
  ),
  mimeTypePrefix: z
    .string()
    .regex(/^[a-z]+\/$/, 'MIME type prefix must be format "type/" (e.g., "image/", "video/")')
    .optional()
    .describe('Filter by MIME type prefix (e.g., "image/", "video/")'),
  hasAlt: z
    .boolean()
    .optional()
    .describe(
      'Filter by ALT text presence (true=has alt, false=missing alt). Critical for BFSG audit.'
    ),
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
export type MediaListInput = z.infer<typeof MediaListInput>;

/**
 * media_get - Get single media details
 */
export const MediaGetInput = z.object({
  id: shopwareId('Invalid media ID format').describe('Media ID (32-char hex)'),
});
export type MediaGetInput = z.infer<typeof MediaGetInput>;

/**
 * media_update - Update media metadata (alt, title)
 */
export const MediaUpdateInput = z.object({
  id: shopwareId('Invalid media ID format').describe('Media ID to update (32-char hex)'),
  alt: z
    .string()
    .max(255, 'Alt text too long')
    .optional()
    .describe('New alt text (critical for BFSG accessibility compliance)'),
  title: z
    .string()
    .max(255, 'Title too long')
    .optional()
    .describe('New title'),
});
export type MediaUpdateInput = z.infer<typeof MediaUpdateInput>;

/**
 * media_search - Full-text search across media
 */
export const MediaSearchInput = z.object({
  query: z
    .string()
    .min(2, 'Search query must be at least 2 characters')
    .max(255, 'Search query too long')
    .describe('Search term (searches fileName, alt, title)'),
  limit: z
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(50, 'Limit cannot exceed 50')
    .default(20)
    .describe('Maximum results to return'),
});
export type MediaSearchInput = z.infer<typeof MediaSearchInput>;

/**
 * media_audit_alt - BFSG compliance audit for missing alt texts
 */
export const MediaAuditAltInput = z.object({
  onlyActive: z
    .boolean()
    .default(true)
    .describe('Only check media on active products (default: true)'),
  limit: z
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(200, 'Limit cannot exceed 200')
    .default(100)
    .describe('Maximum media items to return'),
});
export type MediaAuditAltInput = z.infer<typeof MediaAuditAltInput>;

/**
 * media_upload_url - Upload media from URL
 */
export const MediaUploadUrlInput = z.object({
  url: z
    .string()
    .url('Invalid URL format')
    .max(2048, 'URL too long')
    .refine(
      (url) => url.startsWith('https://') || url.startsWith('http://'),
      'Only HTTP/HTTPS URLs are allowed'
    )
    .refine((url) => {
      try {
        const hostname = new URL(url).hostname.toLowerCase();
        const blocked = ['localhost', '127.', '0.0.0.0', '169.254.', '10.', '172.16.', '172.17.',
          '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.',
          '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
          '192.168.', '[::1]'];
        return !blocked.some(b => hostname === b || hostname.startsWith(b));
      } catch { return false; }
    }, 'Internal/private network URLs are not allowed')
    .describe('URL of the file to upload (Shopware downloads it)'),
  alt: z
    .string()
    .max(255, 'Alt text too long')
    .optional()
    .describe('Alt text for the media (recommended for BFSG compliance)'),
  title: z
    .string()
    .max(255, 'Title too long')
    .optional()
    .describe('Title for the media'),
  mediaFolderId: shopwareIdOptional('Invalid media folder ID format').describe(
    'Target folder ID (32-char hex)'
  ),
});
export type MediaUploadUrlInput = z.infer<typeof MediaUploadUrlInput>;
