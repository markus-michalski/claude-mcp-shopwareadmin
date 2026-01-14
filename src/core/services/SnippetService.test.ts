/**
 * Tests for SnippetService
 *
 * Tests all snippet methods with TDD approach:
 * - list: Get all snippets with optional filters
 * - getByIdentifier: Get snippet by unique identifier
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/setup.js';
import { BASE_URL } from '../../test/handlers.js';
import {
  MOCK_SNIPPET_LIST,
  MOCK_SNIPPET_LIST_ACTIVE,
  MOCK_SNIPPET_REQUIREMENTS,
  MOCK_SNIPPET_REQUIREMENTS_ID,
  MOCK_SNIPPET_COMPATIBILITY,
  MOCK_SNIPPET_INACTIVE,
  createMockLogger,
} from '../../test/fixtures.js';
import { SnippetService } from './SnippetService.js';
import { ShopwareApiClient } from '../../infrastructure/shopware/ShopwareApiClient.js';
import { ShopwareAuthenticator } from '../../infrastructure/shopware/ShopwareAuthenticator.js';
import { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import type { Logger } from '../../infrastructure/logging/Logger.js';

describe('SnippetService', () => {
  let service: SnippetService;
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
    service = new SnippetService(client, cache, logger);
  });

  // ===========================================================================
  // list() - Get all snippets with optional filters
  // ===========================================================================
  describe('list', () => {
    it('should return all snippets for given locale', async () => {
      const result = await service.list('de-DE');

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should filter active snippets only by default', async () => {
      const result = await service.list('de-DE', true);

      // All returned snippets should be active
      expect(result.every((s) => s.active)).toBe(true);
    });

    it('should include inactive snippets when activeOnly is false', async () => {
      const result = await service.list('de-DE', false);

      // Should include at least one inactive snippet
      const hasInactive = result.some((s) => !s.active);
      expect(hasInactive).toBe(true);
    });

    it('should cache results for 10 minutes', async () => {
      vi.useFakeTimers();

      // First request
      await service.list('de-DE', true);

      // Track API calls
      let requestCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/search/mmd-product-snippet`, () => {
          requestCount++;
          return HttpResponse.json({ data: MOCK_SNIPPET_LIST_ACTIVE, total: 3 });
        })
      );

      // Second request should use cache
      await service.list('de-DE', true);
      expect(requestCount).toBe(0);

      // After 11 minutes, cache should be expired
      vi.advanceTimersByTime(11 * 60 * 1000);
      await service.list('de-DE', true);
      expect(requestCount).toBe(1);

      vi.useRealTimers();
    });

    it('should send correct locale filter to API', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/mmd-product-snippet`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: MOCK_SNIPPET_LIST_ACTIVE, total: 3 });
        })
      );

      await service.list('en-GB', true);

      const filters = capturedBody.filter as Array<{ field: string; value: unknown }>;
      const localeFilter = filters?.find((f) => f.field === 'locale');
      expect(localeFilter?.value).toBe('en-GB');
    });

    it('should map Shopware response to Snippet entities', async () => {
      const result = await service.list('de-DE', true);

      expect(result[0]).toMatchObject({
        id: expect.any(String),
        identifier: expect.any(String),
        name: expect.any(String),
        content: expect.any(String),
        active: true,
        locale: 'de-DE',
      });
    });

    it('should sort snippets by position', async () => {
      const result = await service.list('de-DE', true);

      // Verify positions are in ascending order
      for (let i = 1; i < result.length; i++) {
        expect(result[i].position).toBeGreaterThanOrEqual(result[i - 1].position);
      }
    });
  });

  // ===========================================================================
  // getByIdentifier() - Get snippet by unique identifier
  // ===========================================================================
  describe('getByIdentifier', () => {
    it('should return snippet by identifier', async () => {
      const result = await service.getByIdentifier('requirements', 'de-DE');

      expect(result).not.toBeNull();
      expect(result?.identifier).toBe('requirements');
    });

    it('should return null for non-existent identifier', async () => {
      const result = await service.getByIdentifier('non-existent', 'de-DE');

      expect(result).toBeNull();
    });

    it('should filter by locale', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/mmd-product-snippet`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_SNIPPET_REQUIREMENTS], total: 1 });
        })
      );

      await service.getByIdentifier('requirements', 'en-GB');

      const filters = capturedBody.filter as Array<{ field: string; value: unknown }>;
      const localeFilter = filters?.find((f) => f.field === 'locale');
      expect(localeFilter?.value).toBe('en-GB');
    });

    it('should cache individual snippets', async () => {
      vi.useFakeTimers();

      // First request
      await service.getByIdentifier('requirements', 'de-DE');

      // Track API calls
      let requestCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/search/mmd-product-snippet`, () => {
          requestCount++;
          return HttpResponse.json({ data: [MOCK_SNIPPET_REQUIREMENTS], total: 1 });
        })
      );

      // Second request should use cache
      await service.getByIdentifier('requirements', 'de-DE');
      expect(requestCount).toBe(0);

      vi.useRealTimers();
    });

    it('should only return active snippets', async () => {
      // The inactive snippet should not be returned
      const result = await service.getByIdentifier('deprecated-snippet', 'de-DE');

      expect(result).toBeNull();
    });

    it('should return full snippet with content', async () => {
      const result = await service.getByIdentifier('requirements', 'de-DE');

      expect(result).toMatchObject({
        id: MOCK_SNIPPET_REQUIREMENTS_ID,
        identifier: 'requirements',
        name: 'Systemanforderungen',
        content: expect.stringContaining('PHP 8.1'),
        active: true,
      });
    });
  });

  // ===========================================================================
  // getMultiple() - Get multiple snippets by identifiers
  // ===========================================================================
  describe('getMultiple', () => {
    it('should return multiple snippets by identifiers', async () => {
      const result = await service.getMultiple(
        ['requirements', 'compatibility'],
        'de-DE'
      );

      expect(result).toHaveLength(2);
      expect(result.map((s) => s.identifier)).toContain('requirements');
      expect(result.map((s) => s.identifier)).toContain('compatibility');
    });

    it('should skip non-existent identifiers', async () => {
      const result = await service.getMultiple(
        ['requirements', 'non-existent', 'compatibility'],
        'de-DE'
      );

      expect(result).toHaveLength(2);
    });

    it('should return empty array for no matches', async () => {
      const result = await service.getMultiple(
        ['non-existent-1', 'non-existent-2'],
        'de-DE'
      );

      expect(result).toEqual([]);
    });

    it('should maintain order of requested identifiers', async () => {
      const result = await service.getMultiple(
        ['compatibility', 'requirements'],
        'de-DE'
      );

      expect(result[0].identifier).toBe('compatibility');
      expect(result[1].identifier).toBe('requirements');
    });
  });

  // ===========================================================================
  // Entity Mapping Tests
  // ===========================================================================
  describe('entity mapping', () => {
    it('should map all snippet fields correctly', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/mmd-product-snippet`, () => {
          return HttpResponse.json({
            data: [MOCK_SNIPPET_REQUIREMENTS],
            total: 1,
          });
        })
      );

      const result = await service.getByIdentifier('requirements', 'de-DE');

      expect(result).toMatchObject({
        id: MOCK_SNIPPET_REQUIREMENTS_ID,
        identifier: 'requirements',
        name: 'Systemanforderungen',
        content: expect.any(String),
        active: true,
        locale: 'de-DE',
        position: 1,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('should handle missing optional fields', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/mmd-product-snippet`, () => {
          return HttpResponse.json({
            data: [{
              ...MOCK_SNIPPET_REQUIREMENTS,
              position: undefined,
            }],
            total: 1,
          });
        })
      );

      const result = await service.getByIdentifier('requirements', 'de-DE');

      expect(result).not.toBeNull();
      expect(result?.position).toBe(0); // Default value
    });
  });
});
