/**
 * Tests for ManufacturerService
 *
 * Tests all manufacturer methods with TDD approach:
 * - list: Get all manufacturers with optional search
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/setup.js';
import { BASE_URL } from '../../test/handlers.js';
import {
  MOCK_MANUFACTURER_LIST,
  MOCK_MANUFACTURER_ID,
  MOCK_MANUFACTURER,
  MOCK_MANUFACTURER_2,
  createMockLogger,
} from '../../test/fixtures.js';
import { ManufacturerService } from './ManufacturerService.js';
import { ShopwareApiClient } from '../../infrastructure/shopware/ShopwareApiClient.js';
import { ShopwareAuthenticator } from '../../infrastructure/shopware/ShopwareAuthenticator.js';
import { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import type { Logger } from '../../infrastructure/logging/Logger.js';

describe('ManufacturerService', () => {
  let service: ManufacturerService;
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
    service = new ManufacturerService(client, cache, logger);
  });

  // ===========================================================================
  // list() - Get all manufacturers with optional search
  // ===========================================================================
  describe('list', () => {
    it('should return all manufacturers', async () => {
      const result = await service.list();

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should filter manufacturers by search term', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/product-manufacturer`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          // Filter by search term
          const term = (capturedBody.term as string)?.toLowerCase() || '';
          const filtered = MOCK_MANUFACTURER_LIST.filter(
            (m) => m.name.toLowerCase().includes(term)
          );
          return HttpResponse.json({ data: filtered, total: filtered.length });
        })
      );

      const result = await service.list('Kreativ');

      expect(capturedBody.term).toBe('Kreativ');
      expect(result.length).toBe(1);
      expect(result[0].name).toContain('Kreativ');
    });

    it('should respect limit parameter', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/product-manufacturer`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: MOCK_MANUFACTURER_LIST, total: 2 });
        })
      );

      await service.list(undefined, 5);

      expect(capturedBody.limit).toBe(5);
    });

    it('should use default limit of 25', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/product-manufacturer`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: MOCK_MANUFACTURER_LIST, total: 2 });
        })
      );

      await service.list();

      expect(capturedBody.limit).toBe(25);
    });

    it('should cache results for 10 minutes', async () => {
      vi.useFakeTimers();

      // First request
      await service.list();

      // Track API calls
      let requestCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/search/product-manufacturer`, () => {
          requestCount++;
          return HttpResponse.json({ data: MOCK_MANUFACTURER_LIST, total: 2 });
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

    it('should NOT cache when search term is provided', async () => {
      let requestCount = 0;

      server.use(
        http.post(`${BASE_URL}/api/search/product-manufacturer`, () => {
          requestCount++;
          return HttpResponse.json({ data: MOCK_MANUFACTURER_LIST, total: 2 });
        })
      );

      await service.list('test');
      await service.list('test');

      expect(requestCount).toBe(2); // No caching for search
    });

    it('should map Shopware response to Manufacturer entities', async () => {
      const result = await service.list();

      expect(result[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        link: expect.any(String),
      });
    });

    it('should return empty array for no matches', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product-manufacturer`, () => {
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.list('NonExistent');

      expect(result).toEqual([]);
    });

    it('should sort manufacturers by name', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/product-manufacturer`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: MOCK_MANUFACTURER_LIST, total: 2 });
        })
      );

      await service.list();

      const sort = capturedBody.sort as Array<{ field: string; order: string }>;
      expect(sort).toBeDefined();
      expect(sort[0]).toMatchObject({ field: 'name', order: 'ASC' });
    });
  });

  // ===========================================================================
  // Entity Mapping Tests
  // ===========================================================================
  describe('entity mapping', () => {
    it('should map all manufacturer fields correctly', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product-manufacturer`, () => {
          return HttpResponse.json({
            data: [{
              id: MOCK_MANUFACTURER_ID,
              name: 'MM Kreativ',
              link: 'https://mm-kreativ.de',
              description: 'OXID module development',
              media: {
                id: 'media-uuid',
                url: 'https://example.com/logo.png',
                alt: 'MM Kreativ Logo',
              },
            }],
            total: 1,
          });
        })
      );

      const result = await service.list();

      expect(result[0]).toMatchObject({
        id: MOCK_MANUFACTURER_ID,
        name: 'MM Kreativ',
        link: 'https://mm-kreativ.de',
        description: 'OXID module development',
        media: {
          id: 'media-uuid',
          url: 'https://example.com/logo.png',
          alt: 'MM Kreativ Logo',
        },
      });
    });

    it('should handle null fields gracefully', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product-manufacturer`, () => {
          return HttpResponse.json({
            data: [{
              id: MOCK_MANUFACTURER_ID,
              name: 'Test Manufacturer',
              link: null,
              description: null,
              media: null,
            }],
            total: 1,
          });
        })
      );

      const result = await service.list();

      expect(result[0]).toMatchObject({
        id: MOCK_MANUFACTURER_ID,
        name: 'Test Manufacturer',
        link: null,
        description: null,
        media: null,
      });
    });
  });
});
