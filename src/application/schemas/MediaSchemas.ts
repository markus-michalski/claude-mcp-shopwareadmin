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

        // Block numeric-only hostnames (decimal IP bypass, e.g. 2130706433 = 127.0.0.1)
        if (/^\d+$/.test(hostname)) return false;

        // IPv4 private/reserved ranges
        const blockedPrefixes = [
          'localhost', '127.', '0.0.0.0', '10.',
          '172.16.', '172.17.', '172.18.', '172.19.', '172.20.',
          '172.21.', '172.22.', '172.23.', '172.24.', '172.25.',
          '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
          '192.168.', '169.254.',
          // AWS shared address space
          '100.64.', '100.65.', '100.66.', '100.67.', '100.68.', '100.69.',
          '100.70.', '100.71.', '100.72.', '100.73.', '100.74.', '100.75.',
          '100.76.', '100.77.', '100.78.', '100.79.', '100.80.', '100.81.',
          '100.82.', '100.83.', '100.84.', '100.85.', '100.86.', '100.87.',
          '100.88.', '100.89.', '100.90.', '100.91.', '100.92.', '100.93.',
          '100.94.', '100.95.', '100.96.', '100.97.', '100.98.', '100.99.',
          '100.100.', '100.101.', '100.102.', '100.103.', '100.104.', '100.105.',
          '100.106.', '100.107.', '100.108.', '100.109.', '100.110.', '100.111.',
          '100.112.', '100.113.', '100.114.', '100.115.', '100.116.', '100.117.',
          '100.118.', '100.119.', '100.120.', '100.121.', '100.122.', '100.123.',
          '100.124.', '100.125.', '100.126.', '100.127.',
        ];

        // IPv6 private/reserved (including IPv4-mapped)
        const blockedV6Prefixes = [
          '[::1]', '[::ffff:127.', '[::ffff:10.', '[::ffff:192.168.', '[::ffff:169.254.',
          '[fc', '[fd', '[fe80:',
        ];

        // Cloud metadata domains
        const blockedDomains = [
          'metadata.google.internal', 'metadata.goog',
        ];

        if (blockedPrefixes.some(b => hostname === b || hostname.startsWith(b))) return false;
        if (blockedV6Prefixes.some(b => hostname.startsWith(b))) return false;
        if (blockedDomains.some(d => hostname === d || hostname.endsWith('.' + d))) return false;

        return true;
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
