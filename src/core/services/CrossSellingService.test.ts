/**
 * Tests for CrossSellingService
 *
 * Tests all 5 cross-selling methods with TDD approach:
 * - list:    List cross-sellings for a product
 * - get:     Get cross-selling with assigned products (+ cache)
 * - create:  Create manual list or product stream cross-selling
 * - update:  Update name, products, sorting, position (+ cache invalidation)
 * - suggest: Get AI suggestion context (source product + category neighbors)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/setup.js';
import { BASE_URL } from '../../test/handlers.js';
import { createMockLogger, MOCK_PRODUCT_ID, MOCK_CATEGORY_ID } from '../../test/fixtures.js';
import { CrossSellingService } from './CrossSellingService.js';
import { ShopwareApiClient } from '../../infrastructure/shopware/ShopwareApiClient.js';
import { ShopwareAuthenticator } from '../../infrastructure/shopware/ShopwareAuthenticator.js';
import { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import { MCPError, ErrorCode } from '../domain/Errors.js';
import type { Logger } from '../../infrastructure/logging/Logger.js';

// =============================================================================
// Mock fixtures
// =============================================================================

const MOCK_CS_ID = 'cs000011112222333344445555666677';
const MOCK_CS_ID_2 = 'cs111122223333444455556666777788';
const MOCK_PRODUCT_A_ID = 'proda111222233334444555566667777';
const MOCK_PRODUCT_B_ID = 'prodb111222233334444555566667777';

const MOCK_CROSS_SELLING_RAW = {
  id: MOCK_CS_ID,
  productId: MOCK_PRODUCT_ID,
  name: 'Aehnliche Produkte',
  type: 'productList',
  active: true,
  position: 1,
  sortBy: 'name',
  sortDirection: 'ASC',
  limit: 24,
  productStreamId: null,
  productStream: null,
  assignedProducts: [
    {
      id: 'assigned111222233334444555566667',
      productId: MOCK_PRODUCT_A_ID,
      position: 1,
      product: {
        id: MOCK_PRODUCT_A_ID,
        productNumber: 'MM-SITEMAP-7',
        name: 'Sitemap-Generator OXID 7',
        active: true,
      },
    },
    {
      id: 'assigned222333344445555666677778',
      productId: MOCK_PRODUCT_B_ID,
      position: 2,
      product: {
        id: MOCK_PRODUCT_B_ID,
        productNumber: 'MM-COOKIE-7',
        name: 'Cookie-Consent OXID 7',
        active: false,
      },
    },
  ],
  createdAt: '2025-01-01T10:00:00.000Z',
  updatedAt: '2025-01-15T12:00:00.000Z',
};

const MOCK_CROSS_SELLING_RAW_2 = {
  id: MOCK_CS_ID_2,
  productId: MOCK_PRODUCT_ID,
  name: 'Haeufig zusammen gekauft',
  type: 'productList',
  active: true,
  position: 2,
  sortBy: null,
  sortDirection: null,
  limit: 8,
  productStreamId: null,
  productStream: null,
  assignedProducts: [],
  createdAt: '2025-01-02T10:00:00.000Z',
  updatedAt: '2025-01-16T09:00:00.000Z',
};

const MOCK_PRODUCT_FOR_SUGGEST = {
  id: MOCK_PRODUCT_ID,
  productNumber: 'MM-GALLERY-7',
  name: 'Gallery-Modul OXID 7',
  active: true,
  price: [{ gross: 149.0 }],
  categories: [
    {
      id: MOCK_CATEGORY_ID,
      name: 'Software',
      breadcrumb: ['Katalog', 'Software'],
    },
  ],
  properties: [
    {
      name: 'Ohne Support',
      group: { name: 'Support' },
    },
  ],
};

const MOCK_CANDIDATE_PRODUCT = {
  id: MOCK_PRODUCT_A_ID,
  productNumber: 'MM-SITEMAP-7',
  name: 'Sitemap-Generator OXID 7',
  active: true,
  price: [{ gross: 79.0 }],
  categories: [
    {
      id: MOCK_CATEGORY_ID,
      name: 'Software',
      breadcrumb: ['Katalog', 'Software'],
    },
  ],
};

// =============================================================================
// Default MSW handlers
// =============================================================================

function defaultCrossSellingSearchHandler() {
  return http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
    return HttpResponse.json({
      data: [MOCK_CROSS_SELLING_RAW, MOCK_CROSS_SELLING_RAW_2],
      total: 2,
    });
  });
}

function defaultProductSearchHandler() {
  return http.post(`${BASE_URL}/api/search/product`, () => {
    return HttpResponse.json({
      data: [MOCK_PRODUCT_FOR_SUGGEST],
      total: 1,
    });
  });
}

// =============================================================================
// Test suite
// =============================================================================

describe('CrossSellingService', () => {
  let service: CrossSellingService;
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
    service = new CrossSellingService(client, cache, logger);

    // Register default handlers
    server.use(
      defaultCrossSellingSearchHandler(),
      defaultProductSearchHandler()
    );
  });

  // ===========================================================================
  // list() - List cross-sellings for a product
  // ===========================================================================
  describe('list', () => {
    it('should return all cross-sellings for a product', async () => {
      const result = await service.list({ productId: MOCK_PRODUCT_ID });

      expect(result).toHaveLength(2);
    });

    it('should filter by productId in the API request', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/product-cross-selling`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_CROSS_SELLING_RAW], total: 1 });
        })
      );

      await service.list({ productId: MOCK_PRODUCT_ID });

      const filters = capturedBody.filter as Array<{ field: string; value: unknown }>;
      const productIdFilter = filters?.find((f) => f.field === 'productId');
      expect(productIdFilter?.value).toBe(MOCK_PRODUCT_ID);
    });

    it('should map response to CrossSellingListItem with assignedProductCount', async () => {
      const result = await service.list({ productId: MOCK_PRODUCT_ID });

      expect(result[0]).toMatchObject({
        id: MOCK_CS_ID,
        name: 'Aehnliche Produkte',
        type: 'productList',
        active: true,
        position: 1,
        assignedProductCount: 2,
      });
    });

    it('should return empty list when product has no cross-sellings', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.list({ productId: MOCK_PRODUCT_ID });

      expect(result).toHaveLength(0);
    });

    it('should sort by position ASC in the API request', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/product-cross-selling`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      await service.list({ productId: MOCK_PRODUCT_ID });

      const sort = capturedBody.sort as Array<{ field: string; order: string }>;
      expect(sort?.[0]?.field).toBe('position');
      expect(sort?.[0]?.order).toBe('ASC');
    });
  });

  // ===========================================================================
  // get() - Get cross-selling with assigned products
  // ===========================================================================
  describe('get', () => {
    it('should return a cross-selling by ID with full details', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          return HttpResponse.json({ data: [MOCK_CROSS_SELLING_RAW], total: 1 });
        })
      );

      const result = await service.get({ id: MOCK_CS_ID });

      expect(result).not.toBeNull();
      expect(result?.id).toBe(MOCK_CS_ID);
      expect(result?.name).toBe('Aehnliche Produkte');
    });

    it('should map assigned products correctly', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          return HttpResponse.json({ data: [MOCK_CROSS_SELLING_RAW], total: 1 });
        })
      );

      const result = await service.get({ id: MOCK_CS_ID });

      expect(result?.assignedProducts).toHaveLength(2);
      expect(result?.assignedProducts[0]).toMatchObject({
        productId: MOCK_PRODUCT_A_ID,
        productNumber: 'MM-SITEMAP-7',
        productName: 'Sitemap-Generator OXID 7',
        active: true,
        position: 1,
      });
    });

    it('should return null for a non-existent cross-selling ID', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.get({ id: 'doesnotexist0000111122223333444' });

      expect(result).toBeNull();
    });

    it('should cache the result for subsequent calls', async () => {
      vi.useFakeTimers();

      server.use(
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          return HttpResponse.json({ data: [MOCK_CROSS_SELLING_RAW], total: 1 });
        })
      );

      // First call populates cache
      await service.get({ id: MOCK_CS_ID });

      let requestCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          requestCount++;
          return HttpResponse.json({ data: [MOCK_CROSS_SELLING_RAW], total: 1 });
        })
      );

      // Second call should be served from cache
      await service.get({ id: MOCK_CS_ID });
      expect(requestCount).toBe(0);

      // After 6 minutes the cache expires
      vi.advanceTimersByTime(6 * 60 * 1000);
      await service.get({ id: MOCK_CS_ID });
      expect(requestCount).toBe(1);

      vi.useRealTimers();
    });

    it('should load assignedProducts and productStream associations', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/product-cross-selling`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_CROSS_SELLING_RAW], total: 1 });
        })
      );

      await service.get({ id: MOCK_CS_ID });

      const associations = capturedBody.associations as Record<string, unknown>;
      expect(associations?.assignedProducts).toBeDefined();
      expect(associations?.productStream).toBeDefined();
    });
  });

  // ===========================================================================
  // create() - Create a cross-selling group
  // ===========================================================================
  describe('create', () => {
    it('should create a manual productList cross-selling', async () => {
      let postBody: Record<string, unknown> = {};
      const newId = 'newcs111122223333444455556666777';

      server.use(
        http.post(`${BASE_URL}/api/product-cross-selling`, async ({ request }) => {
          postBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json(
            { data: { id: newId } },
            { status: 201 }
          );
        }),
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          return HttpResponse.json({
            data: [{ ...MOCK_CROSS_SELLING_RAW, id: newId }],
            total: 1,
          });
        })
      );

      const result = await service.create({
        productId: MOCK_PRODUCT_ID,
        name: 'Zubehoer',
        type: 'productList',
        active: true,
        position: 1,
        limit: 24,
      });

      expect(postBody.productId).toBe(MOCK_PRODUCT_ID);
      expect(postBody.name).toBe('Zubehoer');
      expect(postBody.type).toBe('productList');
      expect(result.id).toBe(newId);
    });

    it('should include assignedProducts payload when IDs are provided', async () => {
      let postBody: Record<string, unknown> = {};
      const newId = 'newcs222233334444555566667777888';

      server.use(
        http.post(`${BASE_URL}/api/product-cross-selling`, async ({ request }) => {
          postBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: { id: newId } }, { status: 201 });
        }),
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          return HttpResponse.json({
            data: [{ ...MOCK_CROSS_SELLING_RAW, id: newId }],
            total: 1,
          });
        })
      );

      await service.create({
        productId: MOCK_PRODUCT_ID,
        name: 'Zubehör',
        type: 'productList',
        active: true,
        position: 1,
        limit: 24,
        assignedProductIds: [MOCK_PRODUCT_A_ID, MOCK_PRODUCT_B_ID],
      });

      const assigned = postBody.assignedProducts as Array<{ productId: string; position: number }>;
      expect(assigned).toHaveLength(2);
      expect(assigned[0].productId).toBe(MOCK_PRODUCT_A_ID);
      expect(assigned[0].position).toBe(1);
      expect(assigned[1].position).toBe(2);
    });

    it('should include productStreamId when creating a productStream type', async () => {
      let postBody: Record<string, unknown> = {};
      const streamId = 'stream1111222233334444555566667';
      const newId = 'newcs333344445555666677778888999';

      server.use(
        http.post(`${BASE_URL}/api/product-cross-selling`, async ({ request }) => {
          postBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: { id: newId } }, { status: 201 });
        }),
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          return HttpResponse.json({
            data: [{ ...MOCK_CROSS_SELLING_RAW, id: newId, productStreamId: streamId }],
            total: 1,
          });
        })
      );

      await service.create({
        productId: MOCK_PRODUCT_ID,
        name: 'Dynamische Liste',
        type: 'productStream',
        active: true,
        position: 1,
        limit: 24,
        productStreamId: streamId,
      });

      expect(postBody.productStreamId).toBe(streamId);
    });

    it('should throw MCPError when API returns empty response', async () => {
      server.use(
        http.post(`${BASE_URL}/api/product-cross-selling`, () => {
          return new HttpResponse(null, { status: 204 });
        })
      );

      await expect(
        service.create({
          productId: MOCK_PRODUCT_ID,
          name: 'Fails',
          type: 'productList',
          active: true,
          position: 1,
          limit: 24,
        })
      ).rejects.toThrow(MCPError);
    });
  });

  // ===========================================================================
  // update() - Update cross-selling
  // ===========================================================================
  describe('update', () => {
    it('should send PATCH request with new name', async () => {
      let patchBody: Record<string, unknown> = {};

      server.use(
        http.patch(`${BASE_URL}/api/product-cross-selling/${MOCK_CS_ID}`, async ({ request }) => {
          patchBody = await request.json() as Record<string, unknown>;
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          return HttpResponse.json({
            data: [{ ...MOCK_CROSS_SELLING_RAW, name: 'Neuer Name' }],
            total: 1,
          });
        })
      );

      const result = await service.update(MOCK_CS_ID, { name: 'Neuer Name' });

      expect(patchBody.name).toBe('Neuer Name');
      expect(result.name).toBe('Neuer Name');
    });

    it('should replace all assigned products when assignedProductIds is provided', async () => {
      let patchBody: Record<string, unknown> = {};

      server.use(
        http.patch(`${BASE_URL}/api/product-cross-selling/${MOCK_CS_ID}`, async ({ request }) => {
          patchBody = await request.json() as Record<string, unknown>;
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          return HttpResponse.json({ data: [MOCK_CROSS_SELLING_RAW], total: 1 });
        })
      );

      await service.update(MOCK_CS_ID, {
        assignedProductIds: [MOCK_PRODUCT_A_ID],
      });

      const assigned = patchBody.assignedProducts as Array<{ productId: string; position: number }>;
      expect(assigned).toHaveLength(1);
      expect(assigned[0].productId).toBe(MOCK_PRODUCT_A_ID);
      expect(assigned[0].position).toBe(1);
    });

    it('should invalidate cache and re-fetch after update', async () => {
      // Pre-populate cache with first get() call
      server.use(
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          return HttpResponse.json({ data: [MOCK_CROSS_SELLING_RAW], total: 1 });
        })
      );
      await service.get({ id: MOCK_CS_ID });

      let fetchCount = 0;
      server.use(
        http.patch(`${BASE_URL}/api/product-cross-selling/${MOCK_CS_ID}`, () => {
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          fetchCount++;
          return HttpResponse.json({
            data: [{ ...MOCK_CROSS_SELLING_RAW, name: 'Updated' }],
            total: 1,
          });
        })
      );

      await service.update(MOCK_CS_ID, { name: 'Updated' });

      // Cache was invalidated, so at least one new API call was made
      expect(fetchCount).toBeGreaterThanOrEqual(1);
    });

    it('should throw NOT_FOUND when cross-selling no longer exists after update', async () => {
      server.use(
        http.patch(`${BASE_URL}/api/product-cross-selling/${MOCK_CS_ID}`, () => {
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      await expect(
        service.update(MOCK_CS_ID, { name: 'Gone' })
      ).rejects.toThrow(MCPError);

      try {
        await service.update(MOCK_CS_ID, { name: 'Gone' });
      } catch (err) {
        expect((err as MCPError).code).toBe(ErrorCode.NOT_FOUND);
      }
    });
  });

  // ===========================================================================
  // suggest() - Get AI suggestion context
  // ===========================================================================
  describe('suggest', () => {
    it('should return source product info in suggestion context', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          // First call: source product (by IDs)
          if (Array.isArray(body.ids)) {
            return HttpResponse.json({ data: [MOCK_PRODUCT_FOR_SUGGEST], total: 1 });
          }
          // Second call: candidate products (by filter)
          return HttpResponse.json({ data: [MOCK_CANDIDATE_PRODUCT], total: 1 });
        }),
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.suggest({ productId: MOCK_PRODUCT_ID, limit: 20 });

      expect(result.sourceProduct.id).toBe(MOCK_PRODUCT_ID);
      expect(result.sourceProduct.name).toBe('Gallery-Modul OXID 7');
      expect(result.sourceProduct.productNumber).toBe('MM-GALLERY-7');
      expect(result.sourceProduct.price).toBe(149.0);
    });

    it('should include candidate products from the same category', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          if (Array.isArray(body.ids)) {
            return HttpResponse.json({ data: [MOCK_PRODUCT_FOR_SUGGEST], total: 1 });
          }
          return HttpResponse.json({ data: [MOCK_CANDIDATE_PRODUCT], total: 1 });
        }),
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.suggest({ productId: MOCK_PRODUCT_ID, limit: 20 });

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].id).toBe(MOCK_PRODUCT_A_ID);
      expect(result.candidates[0].name).toBe('Sitemap-Generator OXID 7');
      expect(result.candidates[0].price).toBe(79.0);
    });

    it('should include existing cross-selling names to avoid duplicates', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          if (Array.isArray(body.ids)) {
            return HttpResponse.json({ data: [MOCK_PRODUCT_FOR_SUGGEST], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        }),
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          return HttpResponse.json({
            data: [MOCK_CROSS_SELLING_RAW, MOCK_CROSS_SELLING_RAW_2],
            total: 2,
          });
        })
      );

      const result = await service.suggest({ productId: MOCK_PRODUCT_ID, limit: 20 });

      expect(result.existingCrossSellings).toContain('Aehnliche Produkte');
      expect(result.existingCrossSellings).toContain('Haeufig zusammen gekauft');
    });

    it('should build category path from breadcrumb', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          if (Array.isArray(body.ids)) {
            return HttpResponse.json({ data: [MOCK_PRODUCT_FOR_SUGGEST], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        }),
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.suggest({ productId: MOCK_PRODUCT_ID, limit: 20 });

      // Breadcrumb: ['Katalog', 'Software'] => 'Katalog > Software'
      expect(result.sourceProduct.categoryPath).toBe('Katalog > Software');
    });

    it('should map properties to formatted strings', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          if (Array.isArray(body.ids)) {
            return HttpResponse.json({ data: [MOCK_PRODUCT_FOR_SUGGEST], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        }),
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.suggest({ productId: MOCK_PRODUCT_ID, limit: 20 });

      // Property "Ohne Support" with group "Support" => "Support: Ohne Support"
      expect(result.sourceProduct.properties).toContain('Support: Ohne Support');
    });

    it('should throw NOT_FOUND when source product does not exist', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          if (Array.isArray(body.ids)) {
            return HttpResponse.json({ data: [], total: 0 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      await expect(
        service.suggest({ productId: MOCK_PRODUCT_ID, limit: 20 })
      ).rejects.toThrow(MCPError);

      try {
        await service.suggest({ productId: MOCK_PRODUCT_ID, limit: 20 });
      } catch (err) {
        expect((err as MCPError).code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('should return empty candidates when product has no categories', async () => {
      const productWithoutCategories = {
        ...MOCK_PRODUCT_FOR_SUGGEST,
        categories: [],
      };

      server.use(
        http.post(`${BASE_URL}/api/search/product`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          if (Array.isArray(body.ids)) {
            return HttpResponse.json({ data: [productWithoutCategories], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        }),
        http.post(`${BASE_URL}/api/search/product-cross-selling`, () => {
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.suggest({ productId: MOCK_PRODUCT_ID, limit: 20 });

      expect(result.candidates).toHaveLength(0);
      expect(result.sourceProduct.categoryPath).toBeNull();
    });
  });
});
