/**
 * Tests for PropertyService
 *
 * Tests all property methods with TDD approach:
 * - list: Get all property groups with optional filter
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/setup.js';
import { BASE_URL } from '../../test/handlers.js';
import {
  MOCK_PROPERTY_GROUP_LIST,
  MOCK_PROPERTY_GROUP_SUPPORT,
  MOCK_PROPERTY_GROUP_SUPPORT_ID,
  MOCK_PROPERTY_GROUP_LICENSE,
  MOCK_PROPERTY_GROUP_VERSION,
  createMockLogger,
} from '../../test/fixtures.js';
import { PropertyService } from './PropertyService.js';
import { ShopwareApiClient } from '../../infrastructure/shopware/ShopwareApiClient.js';
import { ShopwareAuthenticator } from '../../infrastructure/shopware/ShopwareAuthenticator.js';
import { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import type { Logger } from '../../infrastructure/logging/Logger.js';

describe('PropertyService', () => {
  let service: PropertyService;
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
    service = new PropertyService(client, cache, logger);
  });

  // ===========================================================================
  // list() - Get all property groups with optional filter
  // ===========================================================================
  describe('list', () => {
    it('should return all property groups', async () => {
      const result = await service.list();

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should filter by groupId when provided', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/property-group`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          const ids = capturedBody.ids as string[] | undefined;
          if (ids?.includes(MOCK_PROPERTY_GROUP_SUPPORT_ID)) {
            return HttpResponse.json({
              data: [MOCK_PROPERTY_GROUP_SUPPORT],
              total: 1,
            });
          }
          return HttpResponse.json({ data: MOCK_PROPERTY_GROUP_LIST, total: 3 });
        })
      );

      const result = await service.list(MOCK_PROPERTY_GROUP_SUPPORT_ID);

      expect(capturedBody.ids).toContain(MOCK_PROPERTY_GROUP_SUPPORT_ID);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(MOCK_PROPERTY_GROUP_SUPPORT_ID);
    });

    it('should include options in property groups', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/property-group`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: MOCK_PROPERTY_GROUP_LIST, total: 3 });
        })
      );

      const result = await service.list();

      // Verify associations were requested
      const associations = capturedBody.associations as Record<string, unknown>;
      expect(associations?.options).toBeDefined();

      // Verify options are in result
      expect(result[0].options).toBeDefined();
      expect(result[0].options.length).toBeGreaterThan(0);
    });

    it('should cache results for 10 minutes', async () => {
      vi.useFakeTimers();

      // First request
      await service.list();

      // Track API calls
      let requestCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/search/property-group`, () => {
          requestCount++;
          return HttpResponse.json({ data: MOCK_PROPERTY_GROUP_LIST, total: 3 });
        })
      );

      // Second request should use cache
      await service.list();
      expect(requestCount).toBe(0);

      // After 11 minutes, cache should be expired
      vi.advanceTimersByTime(11 * 60 * 1000);
      await service.list();
      expect(requestCount).toBe(1);

      vi.useRealTimers();
    });

    it('should cache separately for different groupIds', async () => {
      vi.useFakeTimers();

      // First request without filter
      await service.list();

      // Track API calls
      let requestCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/search/property-group`, async ({ request }) => {
          requestCount++;
          const body = await request.json() as Record<string, unknown>;
          const ids = body.ids as string[] | undefined;
          if (ids?.includes(MOCK_PROPERTY_GROUP_SUPPORT_ID)) {
            return HttpResponse.json({
              data: [MOCK_PROPERTY_GROUP_SUPPORT],
              total: 1,
            });
          }
          return HttpResponse.json({ data: MOCK_PROPERTY_GROUP_LIST, total: 3 });
        })
      );

      // Request with different filter should not use cache
      await service.list(MOCK_PROPERTY_GROUP_SUPPORT_ID);
      expect(requestCount).toBe(1);

      vi.useRealTimers();
    });

    it('should map Shopware response to PropertyGroup entities', async () => {
      const result = await service.list();

      expect(result[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        displayType: expect.any(String),
        sortingType: expect.any(String),
        filterable: expect.any(Boolean),
        visibleOnProductDetailPage: expect.any(Boolean),
        position: expect.any(Number),
        options: expect.any(Array),
      });
    });

    it('should sort property groups by position', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/property-group`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: MOCK_PROPERTY_GROUP_LIST, total: 3 });
        })
      );

      await service.list();

      const sort = capturedBody.sort as Array<{ field: string; order: string }>;
      expect(sort).toBeDefined();
      expect(sort[0]).toMatchObject({ field: 'position', order: 'ASC' });
    });

    it('should return empty array for no results', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/property-group`, () => {
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.list('non-existent-id');

      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // Entity Mapping Tests
  // ===========================================================================
  describe('entity mapping', () => {
    it('should map all property group fields correctly', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/property-group`, () => {
          return HttpResponse.json({
            data: [MOCK_PROPERTY_GROUP_SUPPORT],
            total: 1,
          });
        })
      );

      const result = await service.list();

      expect(result[0]).toMatchObject({
        id: MOCK_PROPERTY_GROUP_SUPPORT_ID,
        name: 'Support',
        description: 'Support-Optionen fuer Software',
        displayType: 'text',
        sortingType: 'position',
        filterable: true,
        visibleOnProductDetailPage: true,
        position: 1,
      });
    });

    it('should map property options correctly', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/property-group`, () => {
          return HttpResponse.json({
            data: [MOCK_PROPERTY_GROUP_SUPPORT],
            total: 1,
          });
        })
      );

      const result = await service.list();

      expect(result[0].options).toHaveLength(2);
      expect(result[0].options[0]).toMatchObject({
        id: expect.any(String),
        name: 'Ohne Support',
        position: 1,
        colorHexCode: null,
        mediaId: null,
      });
    });

    it('should handle property groups without options', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/property-group`, () => {
          return HttpResponse.json({
            data: [{
              ...MOCK_PROPERTY_GROUP_SUPPORT,
              options: undefined,
            }],
            total: 1,
          });
        })
      );

      const result = await service.list();

      expect(result[0].options).toEqual([]);
    });

    it('should handle null description', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/property-group`, () => {
          return HttpResponse.json({
            data: [{
              ...MOCK_PROPERTY_GROUP_SUPPORT,
              description: null,
            }],
            total: 1,
          });
        })
      );

      const result = await service.list();

      expect(result[0].description).toBeNull();
    });
  });
});
