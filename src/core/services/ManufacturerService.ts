/**
 * ManufacturerService - Business logic for manufacturer management
 *
 * Implements manufacturer methods:
 * - list: Get all manufacturers with optional search and limit
 */
import type { Logger } from '../../infrastructure/logging/Logger.js';
import type {
  ShopwareApiClient,
  SearchCriteria,
} from '../../infrastructure/shopware/ShopwareApiClient.js';
import type { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import type { Manufacturer, ManufacturerMedia } from '../domain/Manufacturer.js';

/**
 * Cache TTL for manufacturers: 10 minutes (rarely change)
 */
const MANUFACTURER_CACHE_TTL = 10 * 60 * 1000;

/**
 * Cache key prefix for manufacturers
 */
const CACHE_PREFIX = 'manufacturer:';

/**
 * Default limit for list queries
 */
const DEFAULT_LIMIT = 25;

/**
 * Shopware raw manufacturer response structure
 */
interface ShopwareManufacturer {
  id: string;
  name: string;
  link: string | null;
  description: string | null;
  media?: {
    id: string;
    url: string | null;
    alt: string | null;
  } | null;
}

export class ManufacturerService {
  constructor(
    private readonly api: ShopwareApiClient,
    private readonly cache: InMemoryCache,
    private readonly logger: Logger
  ) {}

  // ===========================================================================
  // list() - Get all manufacturers with optional search
  // ===========================================================================

  /**
   * List manufacturers with optional search
   *
   * @param search - Optional search term to filter by name
   * @param limit - Maximum number of results (default: 25)
   * @returns Array of manufacturers sorted by name
   */
  async list(search?: string, limit?: number): Promise<Manufacturer[]> {
    const effectiveLimit = limit ?? DEFAULT_LIMIT;

    // Only cache when no search term
    const cacheKey = `${CACHE_PREFIX}list:${effectiveLimit}`;

    if (!search) {
      const cached = this.cache.get<Manufacturer[]>(cacheKey);
      if (cached) {
        this.logger.debug('Manufacturer list from cache', { key: cacheKey });
        return cached;
      }
    }

    // Build search criteria
    const criteria: SearchCriteria = {
      limit: effectiveLimit,
      sort: [{ field: 'name', order: 'ASC' }],
      associations: {
        media: {},
      },
    };

    // Add search term if provided
    if (search) {
      criteria.term = search;
    }

    this.logger.debug('Fetching manufacturers', { search, limit: effectiveLimit });

    const response = await this.api.search<ShopwareManufacturer>(
      'product-manufacturer',
      criteria
    );

    const manufacturers = response.data.map((m) => this.mapToManufacturer(m));

    // Only cache when no search term
    if (!search) {
      this.cache.set(cacheKey, manufacturers, MANUFACTURER_CACHE_TTL);
    }

    return manufacturers;
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Map Shopware response to Manufacturer entity
   */
  private mapToManufacturer(raw: ShopwareManufacturer): Manufacturer {
    return {
      id: raw.id,
      name: raw.name,
      link: raw.link,
      description: raw.description,
      media: raw.media ? this.mapMedia(raw.media) : null,
    };
  }

  /**
   * Map media object
   */
  private mapMedia(raw: NonNullable<ShopwareManufacturer['media']>): ManufacturerMedia {
    return {
      id: raw.id,
      url: raw.url,
      alt: raw.alt,
    };
  }
}
