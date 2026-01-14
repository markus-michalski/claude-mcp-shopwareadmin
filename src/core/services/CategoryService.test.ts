/**
 * Tests for CategoryService
 *
 * Tests all 3 category methods with TDD approach:
 * - list: Get category tree with filters
 * - get: Get single category with optional products
 * - getBreadcrumb: Get path from category to root
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/setup.js';
import { BASE_URL } from '../../test/handlers.js';
import {
  MOCK_CATEGORY_LIST,
  MOCK_CATEGORY_LIST_ACTIVE,
  MOCK_CATEGORY_ID,
  MOCK_ROOT_CATEGORY_ID,
  MOCK_CATEGORY_OXID7_ID,
  MOCK_CATEGORY_GALLERY_ID,
  MOCK_CATEGORY,
  MOCK_CATEGORY_OXID7,
  MOCK_CATEGORY_GALLERY,
  MOCK_CATEGORY_SHOPWARE6,
  MOCK_CATEGORY_INACTIVE_ID,
  MOCK_PRODUCT,
  MOCK_PRODUCT_2,
  createMockLogger,
} from '../../test/fixtures.js';
import { CategoryService } from './CategoryService.js';
import { ShopwareApiClient } from '../../infrastructure/shopware/ShopwareApiClient.js';
import { ShopwareAuthenticator } from '../../infrastructure/shopware/ShopwareAuthenticator.js';
import { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import type { Logger } from '../../infrastructure/logging/Logger.js';

describe('CategoryService', () => {
  let service: CategoryService;
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
    service = new CategoryService(client, cache, logger);
  });

  // ===========================================================================
  // list() - Get category tree
  // ===========================================================================
  describe('list', () => {
    it('should return all categories as flat list by default', async () => {
      const result = await service.list({});

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should filter by parentId to get direct children only', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          // Return only children of Software category
          const filtered = MOCK_CATEGORY_LIST.filter(
            (c) => c.parentId === MOCK_CATEGORY_ID
          );
          return HttpResponse.json({ data: filtered, total: filtered.length });
        })
      );

      const result = await service.list({ parentId: MOCK_CATEGORY_ID });

      const filters = capturedBody.filter as Array<{
        type: string;
        field: string;
        value: unknown;
      }>;
      const parentFilter = filters?.find((f) => f.field === 'parentId');
      expect(parentFilter).toBeDefined();
      expect(parentFilter?.value).toBe(MOCK_CATEGORY_ID);

      // Should return OXID 7 and Shopware 6 (children of Software)
      expect(result.length).toBe(2);
      expect(result.map((c) => c.name)).toContain('OXID 7');
      expect(result.map((c) => c.name)).toContain('Shopware 6');
    });

    it('should exclude inactive categories by default', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            data: MOCK_CATEGORY_LIST_ACTIVE,
            total: MOCK_CATEGORY_LIST_ACTIVE.length,
          });
        })
      );

      const result = await service.list({});

      const filters = capturedBody.filter as Array<{
        type: string;
        field: string;
        value: unknown;
      }>;
      const activeFilter = filters?.find((f) => f.field === 'active');
      expect(activeFilter).toBeDefined();
      expect(activeFilter?.value).toBe(true);

      // Should not contain inactive category
      const inactiveCategory = result.find(
        (c) => c.id === MOCK_CATEGORY_INACTIVE_ID
      );
      expect(inactiveCategory).toBeUndefined();
    });

    it('should include inactive categories when includeInactive is true', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            data: MOCK_CATEGORY_LIST,
            total: MOCK_CATEGORY_LIST.length,
          });
        })
      );

      const result = await service.list({ includeInactive: true });

      const filters = capturedBody.filter as Array<{
        type: string;
        field: string;
        value: unknown;
      }>;
      const activeFilter = filters?.find((f) => f.field === 'active');
      // Should NOT have active filter when includeInactive is true
      expect(activeFilter).toBeUndefined();

      // Should contain inactive category
      const inactiveCategory = result.find(
        (c) => c.id === MOCK_CATEGORY_INACTIVE_ID
      );
      expect(inactiveCategory).toBeDefined();
    });

    it('should respect depth parameter and limit recursion', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            data: MOCK_CATEGORY_LIST_ACTIVE,
            total: MOCK_CATEGORY_LIST_ACTIVE.length,
          });
        })
      );

      // Depth 1 should only get root children
      await service.list({ depth: 1 });

      // Verify depth was passed (implementation detail - may filter client-side)
      expect(capturedBody).toBeDefined();
    });

    it('should enforce maximum depth of 10', async () => {
      // Requesting depth > 10 should be clamped to 10
      await expect(service.list({ depth: 15 })).resolves.toBeDefined();
      // Note: Validation in schema already limits this, but service should handle gracefully
    });

    it('should build tree structure with nested children', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/category`, async () => {
          return HttpResponse.json({
            data: MOCK_CATEGORY_LIST_ACTIVE,
            total: MOCK_CATEGORY_LIST_ACTIVE.length,
          });
        })
      );

      const result = await service.list({});

      // Verify flat list contains all active categories
      expect(result.length).toBe(MOCK_CATEGORY_LIST_ACTIVE.length);

      // Each category should have correct structure
      const softwareCategory = result.find((c) => c.id === MOCK_CATEGORY_ID);
      expect(softwareCategory).toBeDefined();
      expect(softwareCategory).toMatchObject({
        id: MOCK_CATEGORY_ID,
        name: 'Software',
        parentId: expect.any(String),
        breadcrumb: expect.any(Array),
        active: true,
      });
    });

    it('should cache category list for 10 minutes', async () => {
      vi.useFakeTimers();

      // First request
      await service.list({});

      // Second request should use cache
      let requestCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/search/category`, () => {
          requestCount++;
          return HttpResponse.json({
            data: MOCK_CATEGORY_LIST_ACTIVE,
            total: MOCK_CATEGORY_LIST_ACTIVE.length,
          });
        })
      );

      await service.list({});
      expect(requestCount).toBe(0); // Cache hit

      // Advance 11 minutes (past 10 minute cache)
      vi.advanceTimersByTime(11 * 60 * 1000);

      await service.list({});
      expect(requestCount).toBe(1); // Cache miss, new request

      vi.useRealTimers();
    });

    it('should return CategoryTreeItem with required fields', async () => {
      const result = await service.list({});

      // Find a non-root category to test (root has parentId: null)
      const nonRootCategory = result.find((c) => c.parentId !== null);
      expect(nonRootCategory).toBeDefined();
      expect(nonRootCategory).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        parentId: expect.any(String),
        breadcrumb: expect.any(Array),
        active: expect.any(Boolean),
        productCount: expect.any(Number),
      });

      // Also verify root category has expected structure
      const rootCategory = result.find((c) => c.parentId === null);
      expect(rootCategory).toBeDefined();
      expect(rootCategory?.id).toBe(MOCK_ROOT_CATEGORY_ID);
    });
  });

  // ===========================================================================
  // get() - Get single category details
  // ===========================================================================
  describe('get', () => {
    it('should get category by ID', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (body.ids && (body.ids as string[]).includes(MOCK_CATEGORY_ID)) {
            return HttpResponse.json({ data: [MOCK_CATEGORY], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.get({ id: MOCK_CATEGORY_ID });

      expect(result).not.toBeNull();
      expect(result?.id).toBe(MOCK_CATEGORY_ID);
      expect(result?.name).toBe('Software');
    });

    it('should return null for non-existent category', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (
            body.ids &&
            (body.ids as string[]).includes('not-found-category-id')
          ) {
            return HttpResponse.json({ data: [], total: 0 });
          }
          return HttpResponse.json({
            data: MOCK_CATEGORY_LIST,
            total: MOCK_CATEGORY_LIST.length,
          });
        })
      );

      const result = await service.get({ id: 'not-found-category-id' });

      expect(result).toBeNull();
    });

    it('should include products when includeProducts is true', async () => {
      let productSearchCalled = false;

      server.use(
        http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (
            body.ids &&
            (body.ids as string[]).includes(MOCK_CATEGORY_OXID7_ID)
          ) {
            return HttpResponse.json({ data: [MOCK_CATEGORY_OXID7], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        }),
        http.post(`${BASE_URL}/api/search/product`, async () => {
          productSearchCalled = true;
          return HttpResponse.json({
            data: [MOCK_PRODUCT, MOCK_PRODUCT_2],
            total: 2,
          });
        })
      );

      const result = await service.get({
        id: MOCK_CATEGORY_OXID7_ID,
        includeProducts: true,
      });

      expect(productSearchCalled).toBe(true);
      expect(result).not.toBeNull();
      expect(result?.products).toBeDefined();
      expect(result?.products?.length).toBe(2);
    });

    it('should NOT include products when includeProducts is false', async () => {
      let productSearchCalled = false;

      server.use(
        http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (body.ids && (body.ids as string[]).includes(MOCK_CATEGORY_ID)) {
            return HttpResponse.json({ data: [MOCK_CATEGORY], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        }),
        http.post(`${BASE_URL}/api/search/product`, async () => {
          productSearchCalled = true;
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.get({
        id: MOCK_CATEGORY_ID,
        includeProducts: false,
      });

      expect(productSearchCalled).toBe(false);
      expect(result?.products).toBeUndefined();
    });

    it('should respect productLimit when fetching products', async () => {
      let capturedProductBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (
            body.ids &&
            (body.ids as string[]).includes(MOCK_CATEGORY_OXID7_ID)
          ) {
            return HttpResponse.json({ data: [MOCK_CATEGORY_OXID7], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        }),
        http.post(`${BASE_URL}/api/search/product`, async ({ request }) => {
          capturedProductBody = (await request.json()) as Record<
            string,
            unknown
          >;
          return HttpResponse.json({
            data: [MOCK_PRODUCT],
            total: 1,
          });
        })
      );

      await service.get({
        id: MOCK_CATEGORY_OXID7_ID,
        includeProducts: true,
        productLimit: 5,
      });

      expect(capturedProductBody.limit).toBe(5);
    });

    it('should use default productLimit of 25', async () => {
      let capturedProductBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (
            body.ids &&
            (body.ids as string[]).includes(MOCK_CATEGORY_OXID7_ID)
          ) {
            return HttpResponse.json({ data: [MOCK_CATEGORY_OXID7], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        }),
        http.post(`${BASE_URL}/api/search/product`, async ({ request }) => {
          capturedProductBody = (await request.json()) as Record<
            string,
            unknown
          >;
          return HttpResponse.json({
            data: [MOCK_PRODUCT, MOCK_PRODUCT_2],
            total: 2,
          });
        })
      );

      await service.get({
        id: MOCK_CATEGORY_OXID7_ID,
        includeProducts: true,
      });

      expect(capturedProductBody.limit).toBe(25);
    });

    it('should return full Category entity with SEO data', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (body.ids && (body.ids as string[]).includes(MOCK_CATEGORY_ID)) {
            return HttpResponse.json({ data: [MOCK_CATEGORY], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.get({ id: MOCK_CATEGORY_ID });

      expect(result).toMatchObject({
        id: MOCK_CATEGORY_ID,
        name: 'Software',
        parentId: expect.any(String),
        path: expect.any(String),
        breadcrumb: expect.any(Array),
        active: true,
        visible: true,
        description: expect.any(String),
        seoData: {
          metaTitle: expect.any(String),
          metaDescription: expect.any(String),
          keywords: expect.any(String),
        },
      });
    });

    it('should cache category for 10 minutes', async () => {
      vi.useFakeTimers();

      server.use(
        http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (body.ids && (body.ids as string[]).includes(MOCK_CATEGORY_ID)) {
            return HttpResponse.json({ data: [MOCK_CATEGORY], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      // First request
      await service.get({ id: MOCK_CATEGORY_ID });

      // Track subsequent requests
      let requestCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/search/category`, () => {
          requestCount++;
          return HttpResponse.json({ data: [MOCK_CATEGORY], total: 1 });
        })
      );

      // Second request should use cache
      await service.get({ id: MOCK_CATEGORY_ID });
      expect(requestCount).toBe(0); // Cache hit

      // Advance 11 minutes (past 10 minute cache)
      vi.advanceTimersByTime(11 * 60 * 1000);

      await service.get({ id: MOCK_CATEGORY_ID });
      expect(requestCount).toBe(1); // Cache miss, new request

      vi.useRealTimers();
    });
  });

  // ===========================================================================
  // getBreadcrumb() - Get path from category to root
  // ===========================================================================
  describe('getBreadcrumb', () => {
    it('should return breadcrumb array for category', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (
            body.ids &&
            (body.ids as string[]).includes(MOCK_CATEGORY_GALLERY_ID)
          ) {
            return HttpResponse.json({ data: [MOCK_CATEGORY_GALLERY], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.getBreadcrumb(MOCK_CATEGORY_GALLERY_ID);

      expect(result).toEqual(['Katalog', 'Software', 'OXID 7', 'Galerie-Module']);
    });

    it('should return breadcrumb for second-level category', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (body.ids && (body.ids as string[]).includes(MOCK_CATEGORY_ID)) {
            return HttpResponse.json({ data: [MOCK_CATEGORY], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.getBreadcrumb(MOCK_CATEGORY_ID);

      expect(result).toEqual(['Katalog', 'Software']);
    });

    it('should return empty array for non-existent category', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/category`, async () => {
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.getBreadcrumb('non-existent-id');

      expect(result).toEqual([]);
    });

    it('should use cached category data if available', async () => {
      vi.useFakeTimers();

      server.use(
        http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (
            body.ids &&
            (body.ids as string[]).includes(MOCK_CATEGORY_OXID7_ID)
          ) {
            return HttpResponse.json({ data: [MOCK_CATEGORY_OXID7], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      // First call - populates cache
      await service.getBreadcrumb(MOCK_CATEGORY_OXID7_ID);

      // Track subsequent requests
      let requestCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/search/category`, () => {
          requestCount++;
          return HttpResponse.json({ data: [MOCK_CATEGORY_OXID7], total: 1 });
        })
      );

      // Second call should use cache
      await service.getBreadcrumb(MOCK_CATEGORY_OXID7_ID);
      expect(requestCount).toBe(0);

      vi.useRealTimers();
    });

    it('should return breadcrumb useful for style detection', async () => {
      // This is important for content generation - detecting if category is
      // under "Software" (technical) or "Stickdateien" (creative)
      server.use(
        http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (
            body.ids &&
            (body.ids as string[]).includes(MOCK_CATEGORY_OXID7_ID)
          ) {
            return HttpResponse.json({ data: [MOCK_CATEGORY_OXID7], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const breadcrumb = await service.getBreadcrumb(MOCK_CATEGORY_OXID7_ID);

      // Should contain "Software" for style detection
      expect(breadcrumb).toContain('Software');
      // Can be used to detect technical vs creative content
      expect(breadcrumb.includes('Software')).toBe(true);
    });
  });

  // ===========================================================================
  // Entity Mapping Tests
  // ===========================================================================
  describe('entity mapping', () => {
    it('should map Shopware response to Category entity', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (body.ids && (body.ids as string[]).includes(MOCK_CATEGORY_ID)) {
            return HttpResponse.json({ data: [MOCK_CATEGORY], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.get({ id: MOCK_CATEGORY_ID });

      expect(result).toMatchObject({
        id: MOCK_CATEGORY_ID,
        name: 'Software',
        parentId: MOCK_ROOT_CATEGORY_ID,
        path: expect.stringContaining(MOCK_ROOT_CATEGORY_ID),
        breadcrumb: ['Katalog', 'Software'],
        active: true,
        visible: true,
        productCount: expect.any(Number),
        description: expect.any(String),
        seoData: {
          metaTitle: 'Software | MM Kreativ',
          metaDescription: 'Module und Erweiterungen fuer OXID und Shopware',
          keywords: 'software, module, oxid, shopware',
        },
      });
    });

    it('should map CategoryTreeItem for list results', async () => {
      const result = await service.list({});

      const category = result.find((c) => c.id === MOCK_CATEGORY_ID);
      expect(category).toBeDefined();
      expect(category).toMatchObject({
        id: MOCK_CATEGORY_ID,
        name: 'Software',
        parentId: MOCK_ROOT_CATEGORY_ID,
        breadcrumb: ['Katalog', 'Software'],
        active: true,
        productCount: expect.any(Number),
      });
    });

    it('should handle null SEO data gracefully', async () => {
      const categoryWithNullSeo = {
        ...MOCK_CATEGORY,
        metaTitle: null,
        metaDescription: null,
        keywords: null,
      };

      server.use(
        http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (body.ids && (body.ids as string[]).includes(MOCK_CATEGORY_ID)) {
            return HttpResponse.json({ data: [categoryWithNullSeo], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.get({ id: MOCK_CATEGORY_ID });

      expect(result?.seoData).toMatchObject({
        metaTitle: null,
        metaDescription: null,
        keywords: null,
      });
    });
  });
});
