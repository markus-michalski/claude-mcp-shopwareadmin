/**
 * WikiJsService - Check documentation existence in Wiki.js
 *
 * This service checks if documentation pages exist for software products
 * in the Wiki.js documentation at https://faq.markus-michalski.net.
 *
 * URL structure: {baseUrl}/{locale}/{system}/{slug}
 * Example: https://faq.markus-michalski.net/de/oxid7/mlm-gallery
 */
import type { InMemoryCache } from '../cache/InMemoryCache.js';
import type { Logger } from '../logging/Logger.js';

/**
 * Supported shop/software systems
 */
export type System = 'oxid7' | 'shopware6' | 'osticket';

/**
 * Supported locales for documentation
 */
export type Locale = 'de' | 'en';

/**
 * Parameters for checking documentation
 */
export interface CheckDocumentationParams {
  system: System;
  slug: string;
  locale?: Locale;
}

/**
 * Information about a documentation page
 */
export interface DocumentationInfo {
  exists: boolean;
  url: string;
  locale: string;
  title?: string;
}

/**
 * Cache TTL: 1 hour (documentation changes rarely)
 */
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Request timeout: 5 seconds (Wiki.js can be slow)
 */
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Service for checking Wiki.js documentation existence
 */
export class WikiJsService {
  constructor(
    private readonly baseUrl: string,
    private readonly cache: InMemoryCache,
    private readonly logger: Logger
  ) {}

  /**
   * Build the documentation URL for a given system and slug
   *
   * @param system The software system (oxid7, shopware6, osticket)
   * @param slug The documentation slug (e.g., mlm-gallery)
   * @param locale The locale (de, en)
   * @returns The full documentation URL
   */
  buildDocUrl(system: string, slug: string, locale: string): string {
    return `${this.baseUrl}/${encodeURIComponent(locale)}/${encodeURIComponent(system)}/${encodeURIComponent(slug)}`;
  }

  /**
   * Check if documentation exists for a software product
   *
   * Makes a HEAD request to the Wiki.js URL to check if the page exists.
   * If the requested locale (default: de) does not exist, it falls back to 'en'.
   *
   * @param params The check parameters
   * @returns DocumentationInfo if exists, null otherwise
   */
  async checkDocumentation(
    params: CheckDocumentationParams
  ): Promise<DocumentationInfo | null> {
    // Skip doc check if no Wiki.js URL is configured
    if (!this.baseUrl) {
      return null;
    }

    const { system, slug, locale = 'de' } = params;

    // Check cache first
    const cacheKey = this.buildCacheKey(system, slug, locale);
    const cached = this.cache.get<DocumentationInfo | null>(cacheKey);
    if (cached !== null) {
      this.logger.debug('Documentation check cache hit', { system, slug, locale });
      return cached;
    }

    // Check if cache has explicit null (negative cache)
    const negativeCacheKey = `${cacheKey}:negative`;
    const negativeCached = this.cache.get<boolean>(negativeCacheKey);
    if (negativeCached === true) {
      this.logger.debug('Documentation check negative cache hit', { system, slug, locale });
      return null;
    }

    // Try the requested locale first
    const result = await this.tryCheckUrl(system, slug, locale);
    if (result) {
      this.cache.set(cacheKey, result, CACHE_TTL_MS);
      return result;
    }

    // Fallback to English if German was requested and not found
    if (locale === 'de') {
      this.logger.debug('Falling back to English documentation', { system, slug });
      const enResult = await this.tryCheckUrl(system, slug, 'en');
      if (enResult) {
        this.cache.set(cacheKey, enResult, CACHE_TTL_MS);
        return enResult;
      }
    }

    // Cache negative result
    this.cache.set(negativeCacheKey, true, CACHE_TTL_MS);
    this.logger.debug('Documentation not found', { system, slug, locale });
    return null;
  }

  /**
   * Try to check if a URL exists via HEAD request
   */
  private async tryCheckUrl(
    system: string,
    slug: string,
    locale: string
  ): Promise<DocumentationInfo | null> {
    const url = this.buildDocUrl(system, slug, locale);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        this.logger.debug('Documentation page exists', { url, status: response.status });
        return {
          exists: true,
          url,
          locale,
        };
      }

      if (response.status === 404) {
        this.logger.debug('Documentation page not found', { url });
        return null;
      }

      // Other error status codes (500, etc.)
      this.logger.warn('Documentation check failed with status', { url, status: response.status });
      return null;
    } catch (error) {
      // Handle timeout, network errors, etc.
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          this.logger.warn('Documentation check timed out', { url });
        } else {
          this.logger.warn('Documentation check failed', { url, error: error.message });
        }
      }
      return null;
    }
  }

  /**
   * Build cache key for documentation check
   */
  private buildCacheKey(system: string, slug: string, locale: string): string {
    return `wikijs:doc:${system}:${slug}:${locale}`;
  }
}
