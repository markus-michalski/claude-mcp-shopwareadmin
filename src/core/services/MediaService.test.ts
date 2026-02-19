/**
 * Tests for MediaService
 *
 * Tests all 6 media methods with TDD approach:
 * - list: List media with filters (BFSG hasAlt, mimeType, folder)
 * - get: Get media details with thumbnails, folder, product references
 * - update: Update alt text and title (BFSG compliance)
 * - search: Full-text search across media
 * - auditAlt: BFSG audit for missing alt texts on active products
 * - uploadFromUrl: Two-step URL upload (create entity + trigger download)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/setup.js';
import { BASE_URL } from '../../test/handlers.js';
import { MOCK_SALES_CHANNEL_ID, createMockLogger } from '../../test/fixtures.js';
import { MediaService } from './MediaService.js';
import { ShopwareApiClient } from '../../infrastructure/shopware/ShopwareApiClient.js';
import { ShopwareAuthenticator } from '../../infrastructure/shopware/ShopwareAuthenticator.js';
import { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import { MCPError, ErrorCode } from '../domain/Errors.js';
import type { Logger } from '../../infrastructure/logging/Logger.js';

// =============================================================================
// Media Fixtures
// =============================================================================

const MOCK_MEDIA_FOLDER_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
const MOCK_MEDIA_ID = 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3';
const MOCK_MEDIA_ID_2 = 'aabbccddeeff00112233445566778899';
const MOCK_MEDIA_ID_3 = '00112233445566778899aabbccddeeff';

const MOCK_SHOPWARE_MEDIA_RAW = {
  id: MOCK_MEDIA_ID,
  fileName: 'gallery-screenshot',
  fileExtension: 'jpg',
  mimeType: 'image/jpeg',
  fileSize: 204800,
  url: 'https://cdn.example.com/media/gallery-screenshot.jpg',
  alt: 'Gallery module screenshot showing product grid',
  title: 'Gallery Module Screenshot',
  mediaFolderId: MOCK_MEDIA_FOLDER_ID,
  mediaFolder: {
    id: MOCK_MEDIA_FOLDER_ID,
    name: 'Product Images',
  },
  thumbnails: [
    {
      id: 'thumb-small-uuid',
      width: 800,
      height: 600,
      url: 'https://cdn.example.com/thumbnail/800x600/gallery-screenshot.jpg',
    },
    {
      id: 'thumb-large-uuid',
      width: 1920,
      height: 1080,
      url: 'https://cdn.example.com/thumbnail/1920x1080/gallery-screenshot.jpg',
    },
  ],
  productMedia: [
    {
      id: 'pm-assoc-uuid',
      product: {
        id: 'prod-gallery-uuid',
        productNumber: 'MM-GALLERY-7',
        name: 'Gallery-Modul OXID 7',
        active: true,
      },
    },
  ],
  createdAt: '2025-01-01T10:00:00.000Z',
  updatedAt: '2025-01-14T15:00:00.000Z',
};

const MOCK_SHOPWARE_MEDIA_NO_ALT = {
  id: MOCK_MEDIA_ID_2,
  fileName: 'sitemap-preview',
  fileExtension: 'png',
  mimeType: 'image/png',
  fileSize: 102400,
  url: 'https://cdn.example.com/media/sitemap-preview.png',
  alt: null,
  title: null,
  mediaFolderId: MOCK_MEDIA_FOLDER_ID,
  mediaFolder: null,
  thumbnails: [],
  productMedia: [],
  createdAt: '2025-01-02T10:00:00.000Z',
  updatedAt: '2025-01-15T12:00:00.000Z',
};

const MOCK_SHOPWARE_MEDIA_VIDEO = {
  id: MOCK_MEDIA_ID_3,
  fileName: 'demo-video',
  fileExtension: 'mp4',
  mimeType: 'video/mp4',
  fileSize: 10485760,
  url: 'https://cdn.example.com/media/demo-video.mp4',
  alt: null,
  title: 'Demo Video',
  mediaFolderId: null,
  mediaFolder: null,
  thumbnails: [],
  productMedia: [],
  createdAt: '2025-01-03T10:00:00.000Z',
  updatedAt: '2025-01-16T08:00:00.000Z',
};

// Product-media associations for auditAlt tests
const MOCK_PRODUCT_MEDIA_MISSING_ALT_1 = {
  id: 'pm-link-1-uuid',
  productId: 'prod-sitemap-uuid',
  mediaId: MOCK_MEDIA_ID_2,
  position: 1,
  media: {
    id: MOCK_MEDIA_ID_2,
    fileName: 'sitemap-preview',
    fileExtension: 'png',
    mimeType: 'image/png',
    fileSize: 102400,
    url: 'https://cdn.example.com/media/sitemap-preview.png',
    alt: null,
    title: null,
    mediaFolderId: MOCK_MEDIA_FOLDER_ID,
    thumbnails: [],
    productMedia: [],
    createdAt: '2025-01-02T10:00:00.000Z',
    updatedAt: '2025-01-15T12:00:00.000Z',
  },
  product: {
    id: 'prod-sitemap-uuid',
    productNumber: 'MM-SITEMAP-7',
    name: 'Sitemap-Generator OXID 7',
    active: true,
  },
};

const MOCK_PRODUCT_MEDIA_MISSING_ALT_2 = {
  id: 'pm-link-2-uuid',
  productId: 'prod-cookie-uuid',
  mediaId: MOCK_MEDIA_ID_2,
  position: 1,
  media: {
    ...MOCK_PRODUCT_MEDIA_MISSING_ALT_1.media,
  },
  product: {
    id: 'prod-cookie-uuid',
    productNumber: 'MM-COOKIE-7',
    name: 'Cookie-Consent OXID 7',
    active: false,
  },
};

// =============================================================================
// Test Suite
// =============================================================================

describe('MediaService', () => {
  let service: MediaService;
  let client: ShopwareApiClient;
  let cache: InMemoryCache;
  const logger = createMockLogger() as unknown as Logger;

  beforeEach(() => {
    const authenticator = new ShopwareAuthenticator(
      BASE_URL,
      'test-client-id',
      'test-client-secret',
      logger
    );
    client = new ShopwareApiClient(BASE_URL, authenticator, logger);
    cache = new InMemoryCache(logger);
    service = new MediaService(client, cache, logger);

    // Default handler: media search returns the standard media list
    server.use(
      http.post(`${BASE_URL}/api/search/media`, () => {
        return HttpResponse.json({
          data: [MOCK_SHOPWARE_MEDIA_RAW, MOCK_SHOPWARE_MEDIA_NO_ALT],
          total: 2,
        });
      })
    );
  });

  // ===========================================================================
  // list() - List media with filters
  // ===========================================================================
  describe('list', () => {
    it('should return paginated media list with total', async () => {
      const result = await service.list({ limit: 25, offset: 0 });

      expect(result.media).toBeDefined();
      expect(result.total).toBe(2);
      expect(result.media).toHaveLength(2);
    });

    it('should map response to lightweight MediaListItem objects', async () => {
      const result = await service.list({});

      const item = result.media[0];
      expect(item).toMatchObject({
        id: MOCK_MEDIA_ID,
        fileName: 'gallery-screenshot',
        fileExtension: 'jpg',
        mimeType: 'image/jpeg',
        fileSize: 204800,
        url: 'https://cdn.example.com/media/gallery-screenshot.jpg',
        alt: 'Gallery module screenshot showing product grid',
        title: 'Gallery Module Screenshot',
        createdAt: '2025-01-01T10:00:00.000Z',
      });
    });

    it('should filter by mediaFolderId', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/media`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_SHOPWARE_MEDIA_RAW], total: 1 });
        })
      );

      await service.list({ mediaFolderId: MOCK_MEDIA_FOLDER_ID });

      const filters = capturedBody.filter as Array<{ type: string; field: string; value: unknown }>;
      const folderFilter = filters?.find((f) => f.field === 'mediaFolderId');
      expect(folderFilter).toBeDefined();
      expect(folderFilter?.value).toBe(MOCK_MEDIA_FOLDER_ID);
      expect(folderFilter?.type).toBe('equals');
    });

    it('should filter by mimeTypePrefix for images only', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/media`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_SHOPWARE_MEDIA_RAW], total: 1 });
        })
      );

      await service.list({ mimeTypePrefix: 'image/' });

      const filters = capturedBody.filter as Array<{ type: string; field: string; value: unknown }>;
      const mimeFilter = filters?.find((f) => f.field === 'mimeType');
      expect(mimeFilter).toBeDefined();
      expect(mimeFilter?.type).toBe('prefix');
      expect(mimeFilter?.value).toBe('image/');
    });

    it('should send NULL filter when hasAlt is false (BFSG: find missing alt)', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/media`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_SHOPWARE_MEDIA_NO_ALT], total: 1 });
        })
      );

      await service.list({ hasAlt: false });

      const filters = capturedBody.filter as Array<{ type: string; field: string; value: unknown }>;
      const altFilter = filters?.find((f) => f.field === 'alt');
      expect(altFilter).toBeDefined();
      expect(altFilter?.type).toBe('equals');
      expect(altFilter?.value).toBeNull();
    });

    it('should send NOT-NULL filter when hasAlt is true (BFSG: find media with alt)', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/media`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_SHOPWARE_MEDIA_RAW], total: 1 });
        })
      );

      await service.list({ hasAlt: true });

      const filters = capturedBody.filter as Array<{ type: string; field: string; value: unknown }>;
      const altFilter = filters?.find((f) => f.field === 'alt');
      expect(altFilter).toBeDefined();
      expect(altFilter?.type).toBe('not');
    });

    it('should not add hasAlt filter when hasAlt is undefined', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/media`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      await service.list({});

      const filters = capturedBody.filter as Array<{ field: string }> | undefined;
      const altFilter = filters?.find((f) => f.field === 'alt');
      expect(altFilter).toBeUndefined();
    });

    it('should respect limit and offset (converts offset to page number)', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/media`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [], total: 100 });
        })
      );

      await service.list({ limit: 25, offset: 50 });

      expect(capturedBody.limit).toBe(25);
      expect(capturedBody.page).toBe(3); // offset 50 / limit 25 + 1 = 3
    });

    it('should sort by createdAt DESC', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/media`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      await service.list({});

      const sort = capturedBody.sort as Array<{ field: string; order: string }>;
      expect(sort).toBeDefined();
      expect(sort[0]?.field).toBe('createdAt');
      expect(sort[0]?.order).toBe('DESC');
    });

    it('should NOT cache list results (always fresh API call)', async () => {
      let requestCount = 0;

      server.use(
        http.post(`${BASE_URL}/api/search/media`, () => {
          requestCount++;
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      await service.list({});
      await service.list({});

      expect(requestCount).toBe(2);
    });
  });

  // ===========================================================================
  // get() - Get media details with thumbnails, folder, products
  // ===========================================================================
  describe('get', () => {
    it('should return full Media entity for existing ID', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/media`, () => {
          return HttpResponse.json({ data: [MOCK_SHOPWARE_MEDIA_RAW], total: 1 });
        })
      );

      const result = await service.get({ id: MOCK_MEDIA_ID });

      expect(result).not.toBeNull();
      expect(result?.id).toBe(MOCK_MEDIA_ID);
    });

    it('should map full Media entity including thumbnails', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/media`, () => {
          return HttpResponse.json({ data: [MOCK_SHOPWARE_MEDIA_RAW], total: 1 });
        })
      );

      const result = await service.get({ id: MOCK_MEDIA_ID });

      expect(result).toMatchObject({
        id: MOCK_MEDIA_ID,
        fileName: 'gallery-screenshot',
        fileExtension: 'jpg',
        mimeType: 'image/jpeg',
        fileSize: 204800,
        alt: 'Gallery module screenshot showing product grid',
        title: 'Gallery Module Screenshot',
        createdAt: '2025-01-01T10:00:00.000Z',
        updatedAt: '2025-01-14T15:00:00.000Z',
      });

      expect(result?.thumbnails).toHaveLength(2);
      expect(result?.thumbnails[0]).toMatchObject({
        id: 'thumb-small-uuid',
        width: 800,
        height: 600,
        url: expect.stringContaining('800x600'),
      });
    });

    it('should map folder information', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/media`, () => {
          return HttpResponse.json({ data: [MOCK_SHOPWARE_MEDIA_RAW], total: 1 });
        })
      );

      const result = await service.get({ id: MOCK_MEDIA_ID });

      expect(result?.folder).toMatchObject({
        id: MOCK_MEDIA_FOLDER_ID,
        name: 'Product Images',
      });
      expect(result?.mediaFolderId).toBe(MOCK_MEDIA_FOLDER_ID);
    });

    it('should map product references from productMedia associations', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/media`, () => {
          return HttpResponse.json({ data: [MOCK_SHOPWARE_MEDIA_RAW], total: 1 });
        })
      );

      const result = await service.get({ id: MOCK_MEDIA_ID });

      expect(result?.products).toHaveLength(1);
      expect(result?.products[0]).toMatchObject({
        productId: 'prod-gallery-uuid',
        productNumber: 'MM-GALLERY-7',
        productName: 'Gallery-Modul OXID 7',
        active: true,
      });
    });

    it('should return null for non-existent media ID', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/media`, () => {
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.get({ id: MOCK_MEDIA_ID });

      expect(result).toBeNull();
    });

    it('should handle media with null folder gracefully', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/media`, () => {
          return HttpResponse.json({ data: [MOCK_SHOPWARE_MEDIA_NO_ALT], total: 1 });
        })
      );

      const result = await service.get({ id: MOCK_MEDIA_ID_2 });

      expect(result?.folder).toBeNull();
      expect(result?.thumbnails).toEqual([]);
      expect(result?.products).toEqual([]);
    });

    it('should cache media for 5 minutes', async () => {
      vi.useFakeTimers();

      server.use(
        http.post(`${BASE_URL}/api/search/media`, () => {
          return HttpResponse.json({ data: [MOCK_SHOPWARE_MEDIA_RAW], total: 1 });
        })
      );

      // First request - populates cache
      await service.get({ id: MOCK_MEDIA_ID });

      let requestCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/search/media`, () => {
          requestCount++;
          return HttpResponse.json({ data: [MOCK_SHOPWARE_MEDIA_RAW], total: 1 });
        })
      );

      // Second request within TTL - should use cache
      await service.get({ id: MOCK_MEDIA_ID });
      expect(requestCount).toBe(0);

      // Advance 6 minutes past the 5-minute TTL
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Third request after TTL expired - must hit API again
      await service.get({ id: MOCK_MEDIA_ID });
      expect(requestCount).toBe(1);

      vi.useRealTimers();
    });

    it('should load associations (thumbnails, mediaFolder, productMedia)', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/media`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_SHOPWARE_MEDIA_RAW], total: 1 });
        })
      );

      await service.get({ id: MOCK_MEDIA_ID });

      const associations = capturedBody.associations as Record<string, unknown>;
      expect(associations).toBeDefined();
      expect(associations.thumbnails).toBeDefined();
      expect(associations.mediaFolder).toBeDefined();
      expect(associations.productMedia).toBeDefined();
    });
  });

  // ===========================================================================
  // update() - Update alt text and title (BFSG compliance)
  // ===========================================================================
  describe('update', () => {
    it('should update alt text via PATCH', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.patch(`${BASE_URL}/api/media/${MOCK_MEDIA_ID}`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${BASE_URL}/api/search/media`, () => {
          return HttpResponse.json({
            data: [{ ...MOCK_SHOPWARE_MEDIA_RAW, alt: 'Updated alt text' }],
            total: 1,
          });
        })
      );

      const result = await service.update(MOCK_MEDIA_ID, { alt: 'Updated alt text' });

      expect(capturedBody.alt).toBe('Updated alt text');
      expect(result.alt).toBe('Updated alt text');
    });

    it('should update title via PATCH', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.patch(`${BASE_URL}/api/media/${MOCK_MEDIA_ID}`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${BASE_URL}/api/search/media`, () => {
          return HttpResponse.json({
            data: [{ ...MOCK_SHOPWARE_MEDIA_RAW, title: 'New Title' }],
            total: 1,
          });
        })
      );

      await service.update(MOCK_MEDIA_ID, { title: 'New Title' });

      expect(capturedBody.title).toBe('New Title');
    });

    it('should update both alt and title in a single PATCH call', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.patch(`${BASE_URL}/api/media/${MOCK_MEDIA_ID}`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${BASE_URL}/api/search/media`, () => {
          return HttpResponse.json({ data: [MOCK_SHOPWARE_MEDIA_RAW], total: 1 });
        })
      );

      await service.update(MOCK_MEDIA_ID, {
        alt: 'Product screenshot',
        title: 'Screenshot Title',
      });

      expect(capturedBody.alt).toBe('Product screenshot');
      expect(capturedBody.title).toBe('Screenshot Title');
    });

    it('should throw INVALID_INPUT when no fields are provided', async () => {
      await expect(service.update(MOCK_MEDIA_ID, {})).rejects.toThrow(MCPError);

      try {
        await service.update(MOCK_MEDIA_ID, {});
      } catch (error) {
        expect((error as MCPError).code).toBe(ErrorCode.INVALID_INPUT);
      }
    });

    it('should invalidate cache after update', async () => {
      // Populate cache first
      server.use(
        http.post(`${BASE_URL}/api/search/media`, () => {
          return HttpResponse.json({ data: [MOCK_SHOPWARE_MEDIA_RAW], total: 1 });
        })
      );
      await service.get({ id: MOCK_MEDIA_ID });

      // Perform update
      server.use(
        http.patch(`${BASE_URL}/api/media/${MOCK_MEDIA_ID}`, () => {
          return new HttpResponse(null, { status: 204 });
        })
      );

      let refetchCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/search/media`, () => {
          refetchCount++;
          return HttpResponse.json({
            data: [{ ...MOCK_SHOPWARE_MEDIA_RAW, alt: 'Fresh from API' }],
            total: 1,
          });
        })
      );

      await service.update(MOCK_MEDIA_ID, { alt: 'Fresh from API' });

      // Cache was invalidated, so get() triggered a new API call
      expect(refetchCount).toBeGreaterThanOrEqual(1);
    });

    it('should return updated Media entity', async () => {
      server.use(
        http.patch(`${BASE_URL}/api/media/${MOCK_MEDIA_ID}`, () => {
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${BASE_URL}/api/search/media`, () => {
          return HttpResponse.json({ data: [MOCK_SHOPWARE_MEDIA_RAW], total: 1 });
        })
      );

      const result = await service.update(MOCK_MEDIA_ID, { alt: 'Test alt' });

      expect(result).toMatchObject({
        id: MOCK_MEDIA_ID,
        fileName: expect.any(String),
        fileExtension: expect.any(String),
        thumbnails: expect.any(Array),
        products: expect.any(Array),
      });
    });
  });

  // ===========================================================================
  // search() - Full-text search across media
  // ===========================================================================
  describe('search', () => {
    it('should send search term to Shopware API', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/media`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_SHOPWARE_MEDIA_RAW], total: 1 });
        })
      );

      await service.search('gallery', 20);

      expect(capturedBody.term).toBe('gallery');
    });

    it('should respect the limit parameter', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/media`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      await service.search('screenshot', 5);

      expect(capturedBody.limit).toBe(5);
    });

    it('should return MediaListItem array on match', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/media`, () => {
          return HttpResponse.json({ data: [MOCK_SHOPWARE_MEDIA_RAW], total: 1 });
        })
      );

      const result = await service.search('gallery', 20);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: MOCK_MEDIA_ID,
        fileName: 'gallery-screenshot',
        mimeType: 'image/jpeg',
      });
    });

    it('should return empty array when no results match', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/media`, () => {
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.search('nonexistent-media-xyz', 20);

      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // auditAlt() - BFSG compliance audit for missing alt texts
  // ===========================================================================
  describe('auditAlt', () => {
    it('should query product-media for missing alt texts', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/product-media`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      await service.auditAlt({ onlyActive: true, limit: 100 });

      const filters = capturedBody.filter as Array<{ type: string; field: string; value: unknown }>;
      const altFilter = filters?.find((f) => f.field === 'media.alt');
      expect(altFilter).toBeDefined();
      expect(altFilter?.value).toBeNull();
    });

    it('should filter for images only (mimeType prefix image/)', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/product-media`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      await service.auditAlt({ onlyActive: true, limit: 100 });

      const filters = capturedBody.filter as Array<{ type: string; field: string; value: unknown }>;
      const mimeFilter = filters?.find((f) => f.field === 'media.mimeType');
      expect(mimeFilter).toBeDefined();
      expect(mimeFilter?.type).toBe('prefix');
      expect(mimeFilter?.value).toBe('image/');
    });

    it('should add product.active filter when onlyActive is true', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/product-media`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      await service.auditAlt({ onlyActive: true, limit: 100 });

      const filters = capturedBody.filter as Array<{ type: string; field: string; value: unknown }>;
      const activeFilter = filters?.find((f) => f.field === 'product.active');
      expect(activeFilter).toBeDefined();
      expect(activeFilter?.value).toBe(true);
    });

    it('should NOT add product.active filter when onlyActive is false', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/product-media`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      await service.auditAlt({ onlyActive: false, limit: 100 });

      const filters = capturedBody.filter as Array<{ type: string; field: string; value: unknown }>;
      const activeFilter = filters?.find((f) => f.field === 'product.active');
      expect(activeFilter).toBeUndefined();
    });

    it('should group product-media results by mediaId', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product-media`, () => {
          return HttpResponse.json({
            // Two different products reference the same media item
            data: [MOCK_PRODUCT_MEDIA_MISSING_ALT_1, MOCK_PRODUCT_MEDIA_MISSING_ALT_2],
            total: 2,
          });
        })
      );

      const result = await service.auditAlt({ onlyActive: false, limit: 100 });

      // Both PM entries share the same mediaId - should be grouped into 1 audit item
      expect(result.missingAltCount).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].products).toHaveLength(2);
    });

    it('should count affected products correctly', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product-media`, () => {
          return HttpResponse.json({
            data: [MOCK_PRODUCT_MEDIA_MISSING_ALT_1, MOCK_PRODUCT_MEDIA_MISSING_ALT_2],
            total: 2,
          });
        })
      );

      const result = await service.auditAlt({ onlyActive: false, limit: 100 });

      expect(result.affectedProductCount).toBe(2);
    });

    it('should return empty result when all product media has alt text', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product-media`, () => {
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.auditAlt({ onlyActive: true, limit: 100 });

      expect(result.missingAltCount).toBe(0);
      expect(result.affectedProductCount).toBe(0);
      expect(result.items).toEqual([]);
    });

    it('should fall back to media entity search when product-media endpoint fails', async () => {
      let mediaSearchCalled = false;

      server.use(
        http.post(`${BASE_URL}/api/search/product-media`, () => {
          return HttpResponse.json(
            { errors: [{ status: '404', detail: 'No such route' }] },
            { status: 404 }
          );
        }),
        http.post(`${BASE_URL}/api/search/media`, () => {
          mediaSearchCalled = true;
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.auditAlt({ onlyActive: true, limit: 100 });

      expect(mediaSearchCalled).toBe(true);
      expect(result).toBeDefined();
      expect(result.items).toEqual([]);
    });

    it('should correctly map audit item fields', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product-media`, () => {
          return HttpResponse.json({
            data: [MOCK_PRODUCT_MEDIA_MISSING_ALT_1],
            total: 1,
          });
        })
      );

      const result = await service.auditAlt({ onlyActive: true, limit: 100 });

      const item = result.items[0];
      expect(item).toMatchObject({
        mediaId: MOCK_MEDIA_ID_2,
        fileName: 'sitemap-preview',
        url: 'https://cdn.example.com/media/sitemap-preview.png',
        alt: null,
      });
      expect(item.products[0]).toMatchObject({
        productId: 'prod-sitemap-uuid',
        productNumber: 'MM-SITEMAP-7',
        productName: 'Sitemap-Generator OXID 7',
        active: true,
      });
    });

    it('should skip product-media entries where media or product is missing', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product-media`, () => {
          return HttpResponse.json({
            data: [
              // Entry with no media association
              { id: 'pm-no-media', productId: 'p1', mediaId: 'mid1', position: 0, media: null, product: { id: 'p1', productNumber: 'P1', name: 'Product 1', active: true } },
              // Entry with no product association
              { id: 'pm-no-product', productId: 'p2', mediaId: 'mid2', position: 0, media: MOCK_PRODUCT_MEDIA_MISSING_ALT_1.media, product: null },
              // Valid entry
              MOCK_PRODUCT_MEDIA_MISSING_ALT_1,
            ],
            total: 3,
          });
        })
      );

      const result = await service.auditAlt({ onlyActive: false, limit: 100 });

      // Only the valid entry should appear in results
      expect(result.items).toHaveLength(1);
      expect(result.affectedProductCount).toBe(1);
    });
  });

  // ===========================================================================
  // uploadFromUrl() - Two-step URL upload
  // ===========================================================================
  describe('uploadFromUrl', () => {
    const MEDIA_CREATE_URL = `${BASE_URL}/api/media`;
    const NEW_MEDIA_ID = 'newmediaid12345678901234567890ab';

    beforeEach(() => {
      // Default: media create returns new entity
      server.use(
        http.post(MEDIA_CREATE_URL, () => {
          return HttpResponse.json(
            { data: { id: NEW_MEDIA_ID } },
            { status: 201 }
          );
        }),
        // Default: upload action succeeds
        http.post(
          new RegExp(`${BASE_URL}/api/_action/media/${NEW_MEDIA_ID}/upload`),
          () => {
            return new HttpResponse(null, { status: 204 });
          }
        ),
        // Default: get after upload
        http.post(`${BASE_URL}/api/search/media`, () => {
          return HttpResponse.json({
            data: [{
              ...MOCK_SHOPWARE_MEDIA_RAW,
              id: NEW_MEDIA_ID,
              fileName: 'product-image',
              url: 'https://cdn.example.com/media/product-image.jpg',
            }],
            total: 1,
          });
        })
      );
    });

    it('should return success result with mediaId', async () => {
      const result = await service.uploadFromUrl({
        url: 'https://example.com/images/product-image.jpg',
      });

      expect(result.success).toBe(true);
      expect(result.mediaId).toBe(NEW_MEDIA_ID);
    });

    it('should extract correct file extension from URL for jpg', async () => {
      let uploadActionUrl = '';

      server.use(
        http.post(
          new RegExp(`${BASE_URL}/api/_action/media/${NEW_MEDIA_ID}/upload`),
          ({ request }) => {
            uploadActionUrl = request.url;
            return new HttpResponse(null, { status: 204 });
          }
        )
      );

      await service.uploadFromUrl({
        url: 'https://cdn.shopware.com/media/gallery.jpg',
      });

      expect(uploadActionUrl).toContain('extension=jpg');
    });

    it('should extract correct file extension from URL for webp', async () => {
      let uploadActionUrl = '';

      server.use(
        http.post(
          new RegExp(`${BASE_URL}/api/_action/media/${NEW_MEDIA_ID}/upload`),
          ({ request }) => {
            uploadActionUrl = request.url;
            return new HttpResponse(null, { status: 204 });
          }
        )
      );

      await service.uploadFromUrl({
        url: 'https://cdn.shopware.com/media/hero.webp',
      });

      expect(uploadActionUrl).toContain('extension=webp');
    });

    it('should default to jpg for unknown file extension', async () => {
      let uploadActionUrl = '';

      server.use(
        http.post(
          new RegExp(`${BASE_URL}/api/_action/media/${NEW_MEDIA_ID}/upload`),
          ({ request }) => {
            uploadActionUrl = request.url;
            return new HttpResponse(null, { status: 204 });
          }
        )
      );

      await service.uploadFromUrl({
        url: 'https://cdn.shopware.com/media/image.unknownext',
      });

      // Unknown extension falls back to jpg
      expect(uploadActionUrl).toContain('extension=jpg');
    });

    it('should default to jpg when URL has no extension at all', async () => {
      let uploadActionUrl = '';

      server.use(
        http.post(
          new RegExp(`${BASE_URL}/api/_action/media/${NEW_MEDIA_ID}/upload`),
          ({ request }) => {
            uploadActionUrl = request.url;
            return new HttpResponse(null, { status: 204 });
          }
        )
      );

      await service.uploadFromUrl({
        url: 'https://cdn.shopware.com/media/image-without-extension',
      });

      expect(uploadActionUrl).toContain('extension=jpg');
    });

    it('should encodeURIComponent the file extension in the upload URL', async () => {
      let uploadActionUrl = '';

      server.use(
        http.post(
          new RegExp(`${BASE_URL}/api/_action/media/${NEW_MEDIA_ID}/upload`),
          ({ request }) => {
            uploadActionUrl = request.url;
            return new HttpResponse(null, { status: 204 });
          }
        )
      );

      await service.uploadFromUrl({
        url: 'https://cdn.shopware.com/media/photo.jpg',
      });

      // Verify extension appears as a proper query parameter (URL-encoded)
      const url = new URL(uploadActionUrl);
      expect(url.searchParams.get('extension')).toBe('jpg');
    });

    it('should pass alt and title to the create-entity step', async () => {
      let capturedCreateBody: Record<string, unknown> = {};

      server.use(
        http.post(MEDIA_CREATE_URL, async ({ request }) => {
          capturedCreateBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: { id: NEW_MEDIA_ID } }, { status: 201 });
        })
      );

      await service.uploadFromUrl({
        url: 'https://cdn.example.com/product.png',
        alt: 'Gallery product photo',
        title: 'Gallery Product',
      });

      expect(capturedCreateBody.alt).toBe('Gallery product photo');
      expect(capturedCreateBody.title).toBe('Gallery Product');
    });

    it('should pass mediaFolderId to the create-entity step', async () => {
      let capturedCreateBody: Record<string, unknown> = {};

      server.use(
        http.post(MEDIA_CREATE_URL, async ({ request }) => {
          capturedCreateBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: { id: NEW_MEDIA_ID } }, { status: 201 });
        })
      );

      await service.uploadFromUrl({
        url: 'https://cdn.example.com/product.png',
        mediaFolderId: MOCK_MEDIA_FOLDER_ID,
      });

      expect(capturedCreateBody.mediaFolderId).toBe(MOCK_MEDIA_FOLDER_ID);
    });

    it('should throw API_ERROR when media entity creation returns empty response', async () => {
      server.use(
        http.post(MEDIA_CREATE_URL, () => {
          // Simulate null/empty API response
          return new HttpResponse(null, { status: 200 });
        })
      );

      await expect(
        service.uploadFromUrl({ url: 'https://cdn.example.com/image.jpg' })
      ).rejects.toThrow(MCPError);

      try {
        await service.uploadFromUrl({ url: 'https://cdn.example.com/image.jpg' });
      } catch (error) {
        expect((error as MCPError).code).toBe(ErrorCode.API_ERROR);
      }
    });

    it('should clean up media entity when URL upload step fails', async () => {
      let deleteWasCalled = false;

      server.use(
        http.post(
          new RegExp(`${BASE_URL}/api/_action/media/${NEW_MEDIA_ID}/upload`),
          () => {
            return HttpResponse.json(
              { errors: [{ status: '422', detail: 'Cannot download URL' }] },
              { status: 422 }
            );
          }
        ),
        http.delete(`${BASE_URL}/api/media/${NEW_MEDIA_ID}`, () => {
          deleteWasCalled = true;
          return new HttpResponse(null, { status: 204 });
        })
      );

      await expect(
        service.uploadFromUrl({ url: 'https://cdn.example.com/broken.jpg' })
      ).rejects.toThrow(MCPError);

      expect(deleteWasCalled).toBe(true);
    });

    it('should throw API_ERROR when upload step fails', async () => {
      server.use(
        http.post(
          new RegExp(`${BASE_URL}/api/_action/media/${NEW_MEDIA_ID}/upload`),
          () => {
            return HttpResponse.json(
              { errors: [{ status: '500', detail: 'Internal Server Error' }] },
              { status: 500 }
            );
          }
        ),
        http.delete(`${BASE_URL}/api/media/${NEW_MEDIA_ID}`, () => {
          return new HttpResponse(null, { status: 204 });
        })
      );

      try {
        await service.uploadFromUrl({ url: 'https://cdn.example.com/fail.png' });
        expect.fail('Should have thrown MCPError');
      } catch (error) {
        expect((error as MCPError).code).toBe(ErrorCode.API_ERROR);
      }
    });
  });
});
