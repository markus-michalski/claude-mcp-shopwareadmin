/**
 * Tests for SeoUrlService
 *
 * Tests all 4 SEO URL methods with TDD approach:
 * - list:     List SEO URLs with filters (routeName, salesChannelId, isCanonical, isDeleted, search, foreignKey)
 * - audit:    Find SEO URL issues: missing canonicals, duplicate paths, deleted URLs
 * - update:   Update SEO URL (path, canonical, deleted flags)
 * - generate: Trigger SEO URL regeneration for a route type
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/setup.js';
import { BASE_URL } from '../../test/handlers.js';
import { createMockLogger } from '../../test/fixtures.js';
import { SeoUrlService } from './SeoUrlService.js';
import { ShopwareApiClient } from '../../infrastructure/shopware/ShopwareApiClient.js';
import { ShopwareAuthenticator } from '../../infrastructure/shopware/ShopwareAuthenticator.js';
import { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import { MCPError, ErrorCode } from '../domain/Errors.js';
import type { Logger } from '../../infrastructure/logging/Logger.js';

// =============================================================================
// Mock fixtures
// =============================================================================

const MOCK_SALES_CHANNEL_ID = 'aabbccddeeff00112233445566778899';
const MOCK_FOREIGN_KEY_PRODUCT = 'prod1111222233334444555566667777';
const MOCK_FOREIGN_KEY_CATEGORY = 'cat1111222233334444555566667777';
const MOCK_SEO_URL_ID = 'seo0000111122223333444455556666';
const MOCK_SEO_URL_ID_2 = 'seo1111222233334444555566667777';

const MOCK_SEO_URL = {
  id: MOCK_SEO_URL_ID,
  salesChannelId: MOCK_SALES_CHANNEL_ID,
  languageId: 'lang111122223333444455556666777',
  foreignKey: MOCK_FOREIGN_KEY_PRODUCT,
  routeName: 'frontend.detail.page',
  pathInfo: '/detail/prod1111222233334444555566667777',
  seoPathInfo: 'gallery-modul-oxid-7',
  isCanonical: true,
  isModified: false,
  isDeleted: false,
  createdAt: '2025-01-01T10:00:00.000Z',
  updatedAt: '2025-01-14T15:00:00.000Z',
  salesChannel: {
    name: 'Storefront',
    translated: { name: 'Storefront' },
  },
};

const MOCK_SEO_URL_2 = {
  id: MOCK_SEO_URL_ID_2,
  salesChannelId: MOCK_SALES_CHANNEL_ID,
  languageId: 'lang111122223333444455556666777',
  foreignKey: MOCK_FOREIGN_KEY_CATEGORY,
  routeName: 'frontend.navigation.page',
  pathInfo: '/navigation/cat1111222233334444555566667777',
  seoPathInfo: 'software/oxid-7',
  isCanonical: true,
  isModified: false,
  isDeleted: false,
  createdAt: '2025-01-02T10:00:00.000Z',
  updatedAt: '2025-01-15T12:00:00.000Z',
  salesChannel: {
    name: 'Storefront',
    translated: { name: 'Storefront' },
  },
};

// SEO URL that has been deleted (still in database)
const MOCK_SEO_URL_DELETED = {
  ...MOCK_SEO_URL,
  id: 'seo2222333344445555666677778888',
  seoPathInfo: 'old-gallery-modul-url',
  isCanonical: false,
  isDeleted: true,
};

// SEO URL without canonical flag
const MOCK_SEO_URL_NO_CANONICAL = {
  ...MOCK_SEO_URL,
  id: 'seo3333444455556666777788889999',
  seoPathInfo: 'another-gallery-path',
  isCanonical: false,
  isDeleted: false,
};

// =============================================================================
// Default MSW handler for seo-url search
// =============================================================================

function defaultSeoUrlSearchHandler() {
  return http.post(`${BASE_URL}/api/search/seo-url`, () => {
    return HttpResponse.json({
      data: [MOCK_SEO_URL, MOCK_SEO_URL_2],
      total: 2,
    });
  });
}

// =============================================================================
// Test suite
// =============================================================================

describe('SeoUrlService', () => {
  let service: SeoUrlService;
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
    service = new SeoUrlService(client, cache, logger);

    // Register default handler
    server.use(defaultSeoUrlSearchHandler());
  });

  // ===========================================================================
  // list() - List SEO URLs with filters
  // ===========================================================================
  describe('list', () => {
    it('should return a list of SEO URLs with total count', async () => {
      const result = await service.list({ limit: 25, offset: 0 });

      expect(result.urls).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should map response to SeoUrlListItem objects', async () => {
      const result = await service.list({});

      expect(result.urls[0]).toMatchObject({
        id: MOCK_SEO_URL_ID,
        seoPathInfo: 'gallery-modul-oxid-7',
        pathInfo: '/detail/prod1111222233334444555566667777',
        routeName: 'frontend.detail.page',
        isCanonical: true,
        isModified: false,
        isDeleted: false,
        salesChannelName: 'Storefront',
        foreignKey: MOCK_FOREIGN_KEY_PRODUCT,
      });
    });

    it('should send routeName filter to API', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/seo-url`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_SEO_URL], total: 1 });
        })
      );

      await service.list({ routeName: 'frontend.detail.page' });

      const filters = capturedBody.filter as Array<{ type: string; field: string; value: unknown }>;
      const routeFilter = filters?.find((f) => f.field === 'routeName');
      expect(routeFilter).toBeDefined();
      expect(routeFilter?.value).toBe('frontend.detail.page');
    });

    it('should send salesChannelId filter to API', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/seo-url`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_SEO_URL], total: 1 });
        })
      );

      await service.list({ salesChannelId: MOCK_SALES_CHANNEL_ID });

      const filters = capturedBody.filter as Array<{ field: string; value: unknown }>;
      const channelFilter = filters?.find((f) => f.field === 'salesChannelId');
      expect(channelFilter?.value).toBe(MOCK_SALES_CHANNEL_ID);
    });

    it('should send foreignKey filter to API', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/seo-url`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_SEO_URL], total: 1 });
        })
      );

      await service.list({ foreignKey: MOCK_FOREIGN_KEY_PRODUCT });

      const filters = capturedBody.filter as Array<{ field: string; value: unknown }>;
      const keyFilter = filters?.find((f) => f.field === 'foreignKey');
      expect(keyFilter?.value).toBe(MOCK_FOREIGN_KEY_PRODUCT);
    });

    it('should filter by isCanonical=true', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/seo-url`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_SEO_URL], total: 1 });
        })
      );

      await service.list({ isCanonical: true });

      const filters = capturedBody.filter as Array<{ field: string; value: unknown }>;
      const canonicalFilter = filters?.find((f) => f.field === 'isCanonical');
      expect(canonicalFilter?.value).toBe(true);
    });

    it('should filter by isDeleted=false', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/seo-url`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      await service.list({ isDeleted: false });

      const filters = capturedBody.filter as Array<{ field: string; value: unknown }>;
      const deletedFilter = filters?.find((f) => f.field === 'isDeleted');
      expect(deletedFilter?.value).toBe(false);
    });

    it('should pass search term as criteria.term', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/seo-url`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_SEO_URL], total: 1 });
        })
      );

      await service.list({ search: 'gallery' });

      expect(capturedBody.term).toBe('gallery');
    });

    it('should request salesChannel association', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/seo-url`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      await service.list({});

      const associations = capturedBody.associations as Record<string, unknown>;
      expect(associations?.salesChannel).toBeDefined();
    });

    it('should return null salesChannelName when salesChannel is absent', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/seo-url`, () => {
          return HttpResponse.json({
            data: [{ ...MOCK_SEO_URL, salesChannel: null }],
            total: 1,
          });
        })
      );

      const result = await service.list({});

      expect(result.urls[0].salesChannelName).toBeNull();
    });
  });

  // ===========================================================================
  // audit() - Detect SEO URL issues
  // ===========================================================================
  describe('audit', () => {
    it('should return audit result with zero issues for clean data', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/seo-url`, () => {
          return HttpResponse.json({
            data: [MOCK_SEO_URL, MOCK_SEO_URL_2],
            total: 2,
          });
        })
      );

      const result = await service.audit({});

      expect(result.totalUrlsChecked).toBe(2);
      expect(result.issueCount).toBe(0);
      expect(result.issues).toHaveLength(0);
    });

    it('should flag deleted URLs as warnings', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/seo-url`, () => {
          return HttpResponse.json({
            data: [MOCK_SEO_URL, MOCK_SEO_URL_DELETED],
            total: 2,
          });
        })
      );

      const result = await service.audit({});

      const deletedIssues = result.issues.filter((i) => i.type === 'deleted_url');
      expect(deletedIssues.length).toBeGreaterThan(0);
      expect(deletedIssues[0].severity).toBe('warning');
      expect(deletedIssues[0].description).toContain('deleted');
    });

    it('should flag entities without a canonical URL as errors', async () => {
      // Two URLs for the same entity (foreignKey), neither canonical
      const urlA = { ...MOCK_SEO_URL, isCanonical: false };
      const urlB = {
        ...MOCK_SEO_URL,
        id: 'seo9999000011112222333344445555',
        seoPathInfo: 'gallery-modul-oxid-7-alt',
        isCanonical: false,
      };

      server.use(
        http.post(`${BASE_URL}/api/search/seo-url`, () => {
          return HttpResponse.json({ data: [urlA, urlB], total: 2 });
        })
      );

      const result = await service.audit({});

      const noCanonicalIssues = result.issues.filter((i) => i.type === 'no_canonical');
      expect(noCanonicalIssues.length).toBeGreaterThan(0);
      expect(noCanonicalIssues[0].severity).toBe('error');
    });

    it('should flag duplicate canonical paths as errors', async () => {
      // Two different entities with the same seoPathInfo, both canonical
      const urlA = { ...MOCK_SEO_URL, isCanonical: true };
      const urlB = {
        ...MOCK_SEO_URL,
        id: 'seo8888999900001111222233334444',
        foreignKey: 'other111222233334444555566667777',
        seoPathInfo: 'gallery-modul-oxid-7', // same path as urlA
        isCanonical: true,
      };

      server.use(
        http.post(`${BASE_URL}/api/search/seo-url`, () => {
          return HttpResponse.json({ data: [urlA, urlB], total: 2 });
        })
      );

      const result = await service.audit({});

      const duplicateIssues = result.issues.filter((i) => i.type === 'duplicate_path');
      expect(duplicateIssues.length).toBeGreaterThan(0);
      expect(duplicateIssues[0].severity).toBe('error');
    });

    it('should aggregate issue counts by type', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/seo-url`, () => {
          return HttpResponse.json({
            data: [MOCK_SEO_URL, MOCK_SEO_URL_DELETED, MOCK_SEO_URL_NO_CANONICAL],
            total: 3,
          });
        })
      );

      const result = await service.audit({});

      expect(result.issuesByType).toBeDefined();
      // Deleted URL triggers a warning
      expect(result.issuesByType['deleted_url']).toBeGreaterThan(0);
    });

    it('should forward routeName filter to API', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/seo-url`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      await service.audit({ routeName: 'frontend.detail.page' });

      const filters = capturedBody.filter as Array<{ field: string; value: unknown }>;
      const routeFilter = filters?.find((f) => f.field === 'routeName');
      expect(routeFilter?.value).toBe('frontend.detail.page');
    });

    it('should include routeFilter and salesChannelFilter in result', async () => {
      const result = await service.audit({
        routeName: 'frontend.navigation.page',
        salesChannelId: MOCK_SALES_CHANNEL_ID,
      });

      expect(result.routeFilter).toBe('frontend.navigation.page');
      expect(result.salesChannelFilter).toBe(MOCK_SALES_CHANNEL_ID);
    });
  });

  // ===========================================================================
  // update() - Update a SEO URL
  // ===========================================================================
  describe('update', () => {
    it('should send PATCH request with new seoPathInfo', async () => {
      let patchBody: Record<string, unknown> = {};

      server.use(
        http.patch(`${BASE_URL}/api/seo-url/${MOCK_SEO_URL_ID}`, async ({ request }) => {
          patchBody = await request.json() as Record<string, unknown>;
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${BASE_URL}/api/search/seo-url`, () => {
          return HttpResponse.json({
            data: [{ ...MOCK_SEO_URL, seoPathInfo: 'new-gallery-path', isModified: true }],
            total: 1,
          });
        })
      );

      const result = await service.update(MOCK_SEO_URL_ID, { seoPathInfo: 'new-gallery-path' });

      expect(patchBody.seoPathInfo).toBe('new-gallery-path');
      // Setting a custom path marks the URL as manually modified
      expect(patchBody.isModified).toBe(true);
      expect(result.seoPathInfo).toBe('new-gallery-path');
    });

    it('should send PATCH request to set isCanonical', async () => {
      let patchBody: Record<string, unknown> = {};

      server.use(
        http.patch(`${BASE_URL}/api/seo-url/${MOCK_SEO_URL_ID}`, async ({ request }) => {
          patchBody = await request.json() as Record<string, unknown>;
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${BASE_URL}/api/search/seo-url`, () => {
          return HttpResponse.json({
            data: [{ ...MOCK_SEO_URL, isCanonical: false }],
            total: 1,
          });
        })
      );

      await service.update(MOCK_SEO_URL_ID, { isCanonical: false });

      expect(patchBody.isCanonical).toBe(false);
    });

    it('should send PATCH request to mark as deleted', async () => {
      let patchBody: Record<string, unknown> = {};

      server.use(
        http.patch(`${BASE_URL}/api/seo-url/${MOCK_SEO_URL_ID}`, async ({ request }) => {
          patchBody = await request.json() as Record<string, unknown>;
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${BASE_URL}/api/search/seo-url`, () => {
          return HttpResponse.json({
            data: [{ ...MOCK_SEO_URL, isDeleted: true }],
            total: 1,
          });
        })
      );

      await service.update(MOCK_SEO_URL_ID, { isDeleted: true });

      expect(patchBody.isDeleted).toBe(true);
    });

    it('should throw INVALID_INPUT when no update data is provided', async () => {
      await expect(service.update(MOCK_SEO_URL_ID, {})).rejects.toThrow(MCPError);

      try {
        await service.update(MOCK_SEO_URL_ID, {});
      } catch (err) {
        expect((err as MCPError).code).toBe(ErrorCode.INVALID_INPUT);
      }
    });

    it('should throw NOT_FOUND when URL disappears after update', async () => {
      server.use(
        http.patch(`${BASE_URL}/api/seo-url/${MOCK_SEO_URL_ID}`, () => {
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${BASE_URL}/api/search/seo-url`, () => {
          // Simulate URL no longer available after update
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      await expect(
        service.update(MOCK_SEO_URL_ID, { isCanonical: true })
      ).rejects.toThrow(MCPError);

      try {
        await service.update(MOCK_SEO_URL_ID, { isCanonical: true });
      } catch (err) {
        expect((err as MCPError).code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('should return a full SeoUrl entity after update', async () => {
      server.use(
        http.patch(`${BASE_URL}/api/seo-url/${MOCK_SEO_URL_ID}`, () => {
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${BASE_URL}/api/search/seo-url`, () => {
          return HttpResponse.json({ data: [MOCK_SEO_URL], total: 1 });
        })
      );

      const result = await service.update(MOCK_SEO_URL_ID, { seoPathInfo: 'updated-path' });

      // Full entity (not list item) includes salesChannelId, languageId, entityName etc.
      expect(result).toMatchObject({
        id: MOCK_SEO_URL_ID,
        foreignKey: expect.any(String),
        routeName: expect.any(String),
        seoPathInfo: expect.any(String),
        entityName: 'product', // derived from 'frontend.detail.page'
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });
  });

  // ===========================================================================
  // generate() - Trigger SEO URL regeneration
  // ===========================================================================
  describe('generate', () => {
    it('should call create-custom-url action endpoint', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/_action/seo-url/create-custom-url`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return new HttpResponse(null, { status: 200 });
        })
      );

      const result = await service.generate({
        routeName: 'frontend.detail.page',
        salesChannelId: MOCK_SALES_CHANNEL_ID,
      });

      expect(capturedBody.routeName).toBe('frontend.detail.page');
      expect(capturedBody.salesChannelId).toBe(MOCK_SALES_CHANNEL_ID);
      expect(result.success).toBe(true);
      expect(result.message).toContain('frontend.detail.page');
    });

    it('should fall back to canonical endpoint when create-custom-url fails', async () => {
      let canonicalCalled = false;

      server.use(
        http.post(`${BASE_URL}/api/_action/seo-url/create-custom-url`, () => {
          return HttpResponse.json(
            { errors: [{ status: '500', title: 'Not supported' }] },
            { status: 500 }
          );
        }),
        http.post(`${BASE_URL}/api/_action/seo-url/canonical`, async () => {
          canonicalCalled = true;
          return new HttpResponse(null, { status: 200 });
        })
      );

      const result = await service.generate({
        routeName: 'frontend.navigation.page',
        salesChannelId: MOCK_SALES_CHANNEL_ID,
      });

      expect(canonicalCalled).toBe(true);
      expect(result.success).toBe(true);
    });

    it('should throw MCPError with API_ERROR when both endpoints fail', async () => {
      server.use(
        http.post(`${BASE_URL}/api/_action/seo-url/create-custom-url`, () => {
          return HttpResponse.json(
            { errors: [{ status: '500', title: 'Server error' }] },
            { status: 500 }
          );
        }),
        http.post(`${BASE_URL}/api/_action/seo-url/canonical`, () => {
          return HttpResponse.json(
            { errors: [{ status: '500', title: 'Server error' }] },
            { status: 500 }
          );
        })
      );

      await expect(
        service.generate({
          routeName: 'frontend.landing.page',
          salesChannelId: MOCK_SALES_CHANNEL_ID,
        })
      ).rejects.toThrow(MCPError);

      try {
        await service.generate({
          routeName: 'frontend.landing.page',
          salesChannelId: MOCK_SALES_CHANNEL_ID,
        });
      } catch (err) {
        expect((err as MCPError).code).toBe(ErrorCode.API_ERROR);
      }
    });
  });
});
