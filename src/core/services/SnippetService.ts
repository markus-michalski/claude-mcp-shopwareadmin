/**
 * SnippetService - Business logic for product snippets
 *
 * Implements methods for the mmd-product-snippet plugin:
 * - list: Get all snippets with optional filters
 * - getByIdentifier: Get snippet by unique identifier
 * - getMultiple: Get multiple snippets by identifiers
 */
import type { Logger } from '../../infrastructure/logging/Logger.js';
import type {
  ShopwareApiClient,
  SearchCriteria,
  SearchFilter,
} from '../../infrastructure/shopware/ShopwareApiClient.js';
import type { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import type { Snippet } from '../domain/Content.js';

/**
 * Cache TTL for snippets: 10 minutes (snippets change rarely)
 */
const SNIPPET_CACHE_TTL = 10 * 60 * 1000;

/**
 * Cache key prefix for snippets
 */
const CACHE_PREFIX = 'snippet:';

/**
 * Shopware raw snippet response structure
 */
interface ShopwareSnippet {
  id: string;
  identifier: string;
  name: string;
  content: string;
  active: boolean;
  locale: string;
  position?: number;
  createdAt: string;
  updatedAt: string;
}

export class SnippetService {
  constructor(
    private readonly api: ShopwareApiClient,
    private readonly cache: InMemoryCache,
    private readonly logger: Logger
  ) {}

  // ===========================================================================
  // list() - Get all snippets with optional filters
  // ===========================================================================

  /**
   * List all snippets for a given locale
   *
   * @param locale - Locale code (e.g., 'de-DE', 'en-GB')
   * @param activeOnly - Only return active snippets (default: true)
   * @returns Array of snippets sorted by position
   */
  async list(locale: string, activeOnly = true): Promise<Snippet[]> {
    const cacheKey = `${CACHE_PREFIX}list:${locale}:${activeOnly}`;

    // Check cache
    const cached = this.cache.get<Snippet[]>(cacheKey);
    if (cached) {
      this.logger.debug('Snippet list from cache', { key: cacheKey });
      return cached;
    }

    // Build search criteria
    const filters: SearchFilter[] = [
      { type: 'equals', field: 'locale', value: locale },
    ];

    if (activeOnly) {
      filters.push({ type: 'equals', field: 'active', value: true });
    }

    const criteria: SearchCriteria = {
      limit: 100,
      filter: filters,
      sort: [{ field: 'position', order: 'ASC' }],
    };

    this.logger.debug('Fetching snippets', { locale, activeOnly });

    const response = await this.api.search<ShopwareSnippet>(
      'mmd-product-snippet',
      criteria
    );

    const snippets = response.data.map((s) => this.mapToSnippet(s));

    // Sort by position (in case API didn't sort)
    snippets.sort((a, b) => a.position - b.position);

    // Cache the result
    this.cache.set(cacheKey, snippets, SNIPPET_CACHE_TTL);

    return snippets;
  }

  // ===========================================================================
  // getByIdentifier() - Get snippet by unique identifier
  // ===========================================================================

  /**
   * Get a single snippet by its identifier
   *
   * @param identifier - Unique snippet identifier (e.g., 'requirements')
   * @param locale - Locale code
   * @returns Snippet or null if not found
   */
  async getByIdentifier(
    identifier: string,
    locale: string
  ): Promise<Snippet | null> {
    const cacheKey = `${CACHE_PREFIX}identifier:${identifier}:${locale}`;

    // Check cache
    const cached = this.cache.get<Snippet | null>(cacheKey);
    if (cached !== null) {
      this.logger.debug('Snippet from cache', { key: cacheKey });
      return cached;
    }

    // Build search criteria - only active snippets
    const criteria: SearchCriteria = {
      limit: 1,
      filter: [
        { type: 'equals', field: 'identifier', value: identifier },
        { type: 'equals', field: 'locale', value: locale },
        { type: 'equals', field: 'active', value: true },
      ],
    };

    this.logger.debug('Fetching snippet by identifier', { identifier, locale });

    const response = await this.api.search<ShopwareSnippet>(
      'mmd-product-snippet',
      criteria
    );

    const rawSnippet = response.data[0];
    if (!rawSnippet) {
      // Cache null result to avoid repeated lookups
      this.cache.set(cacheKey, null, SNIPPET_CACHE_TTL);
      return null;
    }

    const snippet = this.mapToSnippet(rawSnippet);

    // Cache the result
    this.cache.set(cacheKey, snippet, SNIPPET_CACHE_TTL);

    return snippet;
  }

  // ===========================================================================
  // getMultiple() - Get multiple snippets by identifiers
  // ===========================================================================

  /**
   * Get multiple snippets by their identifiers
   *
   * @param identifiers - Array of snippet identifiers
   * @param locale - Locale code
   * @returns Array of found snippets in requested order
   */
  async getMultiple(
    identifiers: string[],
    locale: string
  ): Promise<Snippet[]> {
    if (identifiers.length === 0) {
      return [];
    }

    // Fetch all snippets for the locale and filter
    const allSnippets = await this.list(locale, true);

    // Filter and maintain order
    const snippetMap = new Map(allSnippets.map((s) => [s.identifier, s]));
    const result: Snippet[] = [];

    for (const identifier of identifiers) {
      const snippet = snippetMap.get(identifier);
      if (snippet) {
        result.push(snippet);
      }
    }

    return result;
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Map Shopware response to Snippet entity
   */
  private mapToSnippet(raw: ShopwareSnippet): Snippet {
    return {
      id: raw.id,
      identifier: raw.identifier,
      name: raw.name,
      content: raw.content,
      active: raw.active,
      locale: raw.locale,
      position: raw.position ?? 0,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}
