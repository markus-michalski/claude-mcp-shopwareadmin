/**
 * Tests for WikiJsService
 *
 * TDD implementation for checking Wiki.js documentation existence.
 * The service checks if a documentation page exists for a software product
 * and returns the URL with metadata.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/setup.js';
import { createMockLogger } from '../../test/fixtures.js';
import { WikiJsService } from './WikiJsService.js';
import { InMemoryCache } from '../cache/InMemoryCache.js';
import type { Logger } from '../logging/Logger.js';

const WIKIJS_BASE_URL = 'https://faq.markus-michalski.net';

describe('WikiJsService', () => {
  let service: WikiJsService;
  let cache: InMemoryCache;
  const logger = createMockLogger() as unknown as Logger;

  beforeEach(() => {
    cache = new InMemoryCache(logger);
    service = new WikiJsService(WIKIJS_BASE_URL, cache, logger);
  });

  // ===========================================================================
  // buildDocUrl() - Generate documentation URLs
  // ===========================================================================
  describe('buildDocUrl', () => {
    it('should generate correct URL with default locale (de)', () => {
      const url = service.buildDocUrl('oxid7', 'mlm-gallery', 'de');

      expect(url).toBe('https://faq.markus-michalski.net/de/oxid7/mlm-gallery');
    });

    it('should generate correct URL with English locale', () => {
      const url = service.buildDocUrl('oxid7', 'mlm-gallery', 'en');

      expect(url).toBe('https://faq.markus-michalski.net/en/oxid7/mlm-gallery');
    });

    it('should generate correct URL for Shopware 6 system', () => {
      const url = service.buildDocUrl('shopware6', 'my-plugin', 'de');

      expect(url).toBe('https://faq.markus-michalski.net/de/shopware6/my-plugin');
    });

    it('should generate correct URL for osTicket system', () => {
      const url = service.buildDocUrl('osticket', 'subticket-manager', 'de');

      expect(url).toBe('https://faq.markus-michalski.net/de/osticket/subticket-manager');
    });

    it('should handle slugs with special characters', () => {
      const url = service.buildDocUrl('oxid7', 'multi-image-gallery', 'de');

      expect(url).toBe('https://faq.markus-michalski.net/de/oxid7/multi-image-gallery');
    });

    it('should not add trailing slash', () => {
      const url = service.buildDocUrl('oxid7', 'mlm-gallery', 'de');

      expect(url.endsWith('/')).toBe(false);
    });
  });

  // ===========================================================================
  // checkDocumentation() - Check if documentation exists
  // ===========================================================================
  describe('checkDocumentation', () => {
    it('should return DocumentationInfo when page exists (200)', async () => {
      server.use(
        http.head(`${WIKIJS_BASE_URL}/de/oxid7/mlm-gallery`, () => {
          return new HttpResponse(null, { status: 200 });
        })
      );

      const result = await service.checkDocumentation({
        system: 'oxid7',
        slug: 'mlm-gallery',
      });

      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        exists: true,
        url: 'https://faq.markus-michalski.net/de/oxid7/mlm-gallery',
        locale: 'de',
      });
    });

    it('should return null when page does not exist (404)', async () => {
      server.use(
        http.head(`${WIKIJS_BASE_URL}/de/shopware6/unknown-plugin`, () => {
          return new HttpResponse(null, { status: 404 });
        })
      );

      const result = await service.checkDocumentation({
        system: 'shopware6',
        slug: 'unknown-plugin',
      });

      expect(result).toBeNull();
    });

    it('should use default locale "de" when not specified', async () => {
      let requestedUrl: string | null = null;

      server.use(
        http.head(`${WIKIJS_BASE_URL}/:locale/:system/:slug`, ({ request }) => {
          requestedUrl = request.url;
          return new HttpResponse(null, { status: 200 });
        })
      );

      await service.checkDocumentation({
        system: 'oxid7',
        slug: 'mlm-gallery',
      });

      expect(requestedUrl).toBe('https://faq.markus-michalski.net/de/oxid7/mlm-gallery');
    });

    it('should use specified locale when provided', async () => {
      let requestedUrl: string | null = null;

      server.use(
        http.head(`${WIKIJS_BASE_URL}/:locale/:system/:slug`, ({ request }) => {
          requestedUrl = request.url;
          return new HttpResponse(null, { status: 200 });
        })
      );

      await service.checkDocumentation({
        system: 'oxid7',
        slug: 'mlm-gallery',
        locale: 'en',
      });

      expect(requestedUrl).toBe('https://faq.markus-michalski.net/en/oxid7/mlm-gallery');
    });

    it('should fallback to "en" when "de" does not exist', async () => {
      let requestCount = 0;

      server.use(
        http.head(`${WIKIJS_BASE_URL}/de/oxid7/english-only`, () => {
          requestCount++;
          return new HttpResponse(null, { status: 404 });
        }),
        http.head(`${WIKIJS_BASE_URL}/en/oxid7/english-only`, () => {
          requestCount++;
          return new HttpResponse(null, { status: 200 });
        })
      );

      const result = await service.checkDocumentation({
        system: 'oxid7',
        slug: 'english-only',
        locale: 'de',
      });

      expect(requestCount).toBe(2);
      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        exists: true,
        url: 'https://faq.markus-michalski.net/en/oxid7/english-only',
        locale: 'en',
      });
    });

    it('should NOT fallback when requested locale is already "en"', async () => {
      let requestCount = 0;

      server.use(
        http.head(`${WIKIJS_BASE_URL}/:locale/:system/:slug`, () => {
          requestCount++;
          return new HttpResponse(null, { status: 404 });
        })
      );

      const result = await service.checkDocumentation({
        system: 'oxid7',
        slug: 'nonexistent',
        locale: 'en',
      });

      expect(requestCount).toBe(1);
      expect(result).toBeNull();
    });

    it('should cache results for 1 hour', async () => {
      vi.useFakeTimers();

      server.use(
        http.head(`${WIKIJS_BASE_URL}/de/oxid7/cached-doc`, () => {
          return new HttpResponse(null, { status: 200 });
        })
      );

      // First request
      await service.checkDocumentation({
        system: 'oxid7',
        slug: 'cached-doc',
      });

      // Track subsequent requests
      let requestCount = 0;
      server.use(
        http.head(`${WIKIJS_BASE_URL}/:locale/:system/:slug`, () => {
          requestCount++;
          return new HttpResponse(null, { status: 200 });
        })
      );

      // Second request should use cache
      await service.checkDocumentation({
        system: 'oxid7',
        slug: 'cached-doc',
      });
      expect(requestCount).toBe(0); // Cache hit

      // Advance 61 minutes (past 1 hour cache)
      vi.advanceTimersByTime(61 * 60 * 1000);

      // Third request should miss cache
      await service.checkDocumentation({
        system: 'oxid7',
        slug: 'cached-doc',
      });
      expect(requestCount).toBe(1); // Cache miss, new request

      vi.useRealTimers();
    });

    it('should also cache negative results (404)', async () => {
      vi.useFakeTimers();

      server.use(
        http.head(`${WIKIJS_BASE_URL}/de/oxid7/not-found`, () => {
          return new HttpResponse(null, { status: 404 });
        }),
        http.head(`${WIKIJS_BASE_URL}/en/oxid7/not-found`, () => {
          return new HttpResponse(null, { status: 404 });
        })
      );

      // First request
      const result1 = await service.checkDocumentation({
        system: 'oxid7',
        slug: 'not-found',
      });
      expect(result1).toBeNull();

      // Track subsequent requests
      let requestCount = 0;
      server.use(
        http.head(`${WIKIJS_BASE_URL}/:locale/:system/:slug`, () => {
          requestCount++;
          return new HttpResponse(null, { status: 404 });
        })
      );

      // Second request should use cache
      const result2 = await service.checkDocumentation({
        system: 'oxid7',
        slug: 'not-found',
      });
      expect(result2).toBeNull();
      expect(requestCount).toBe(0); // Cache hit

      vi.useRealTimers();
    });

    it('should return null on server error (500)', async () => {
      server.use(
        http.head(`${WIKIJS_BASE_URL}/de/oxid7/error-page`, () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      const result = await service.checkDocumentation({
        system: 'oxid7',
        slug: 'error-page',
      });

      expect(result).toBeNull();
    });

    it('should return null on timeout', async () => {
      server.use(
        http.head(`${WIKIJS_BASE_URL}/de/oxid7/slow-page`, async () => {
          // Simulate slow response (longer than 5 second timeout)
          await new Promise((resolve) => setTimeout(resolve, 10000));
          return new HttpResponse(null, { status: 200 });
        })
      );

      const result = await service.checkDocumentation({
        system: 'oxid7',
        slug: 'slow-page',
      });

      expect(result).toBeNull();
    }, 15000); // Increase test timeout

    it('should return null on network error', async () => {
      server.use(
        http.head(`${WIKIJS_BASE_URL}/de/oxid7/network-error`, () => {
          return HttpResponse.error();
        })
      );

      const result = await service.checkDocumentation({
        system: 'oxid7',
        slug: 'network-error',
      });

      expect(result).toBeNull();
    });

    it('should handle osticket system', async () => {
      server.use(
        http.head(`${WIKIJS_BASE_URL}/de/osticket/subticket-manager`, () => {
          return new HttpResponse(null, { status: 200 });
        })
      );

      const result = await service.checkDocumentation({
        system: 'osticket',
        slug: 'subticket-manager',
      });

      expect(result).not.toBeNull();
      expect(result?.url).toBe('https://faq.markus-michalski.net/de/osticket/subticket-manager');
    });

    it('should handle shopware6 system', async () => {
      server.use(
        http.head(`${WIKIJS_BASE_URL}/de/shopware6/my-plugin`, () => {
          return new HttpResponse(null, { status: 200 });
        })
      );

      const result = await service.checkDocumentation({
        system: 'shopware6',
        slug: 'my-plugin',
      });

      expect(result).not.toBeNull();
      expect(result?.url).toBe('https://faq.markus-michalski.net/de/shopware6/my-plugin');
    });
  });

  // ===========================================================================
  // Cache key generation
  // ===========================================================================
  describe('cache behavior', () => {
    it('should use different cache keys for different systems', async () => {
      vi.useFakeTimers();

      server.use(
        http.head(`${WIKIJS_BASE_URL}/:locale/:system/:slug`, ({ params }) => {
          // Return 200 for oxid7, 404 for shopware6
          if (params.system === 'oxid7') {
            return new HttpResponse(null, { status: 200 });
          }
          return new HttpResponse(null, { status: 404 });
        })
      );

      // Check oxid7 - should exist
      const oxid7Result = await service.checkDocumentation({
        system: 'oxid7',
        slug: 'mlm-gallery',
      });
      expect(oxid7Result?.exists).toBe(true);

      // Check shopware6 - should not exist (different cache entry)
      server.use(
        http.head(`${WIKIJS_BASE_URL}/:locale/:system/:slug`, () => {
          return new HttpResponse(null, { status: 404 });
        })
      );

      const sw6Result = await service.checkDocumentation({
        system: 'shopware6',
        slug: 'mlm-gallery',
      });
      expect(sw6Result).toBeNull();

      vi.useRealTimers();
    });

    it('should use different cache keys for different locales', async () => {
      vi.useFakeTimers();

      server.use(
        http.head(`${WIKIJS_BASE_URL}/:locale/:system/:slug`, ({ params }) => {
          // Return 200 for de, 404 for en
          if (params.locale === 'de') {
            return new HttpResponse(null, { status: 200 });
          }
          return new HttpResponse(null, { status: 404 });
        })
      );

      // Check de - should exist
      const deResult = await service.checkDocumentation({
        system: 'oxid7',
        slug: 'mlm-gallery',
        locale: 'de',
      });
      expect(deResult?.exists).toBe(true);

      // Check en - should not exist (different cache entry)
      const enResult = await service.checkDocumentation({
        system: 'oxid7',
        slug: 'mlm-gallery',
        locale: 'en',
      });
      expect(enResult).toBeNull();

      vi.useRealTimers();
    });
  });
});
