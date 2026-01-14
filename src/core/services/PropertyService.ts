/**
 * PropertyService - Business logic for property group management
 *
 * Implements property methods:
 * - list: Get all property groups with optional filter
 */
import type { Logger } from '../../infrastructure/logging/Logger.js';
import type {
  ShopwareApiClient,
  SearchCriteria,
} from '../../infrastructure/shopware/ShopwareApiClient.js';
import type { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import type {
  PropertyGroup,
  PropertyOption,
  PropertyDisplayType,
  PropertySortingType,
} from '../domain/PropertyGroup.js';

/**
 * Cache TTL for property groups: 10 minutes (rarely change)
 */
const PROPERTY_CACHE_TTL = 10 * 60 * 1000;

/**
 * Cache key prefix for property groups
 */
const CACHE_PREFIX = 'property:';

/**
 * Shopware raw property group response structure
 */
interface ShopwarePropertyGroup {
  id: string;
  name: string;
  description: string | null;
  displayType: string;
  sortingType: string;
  filterable: boolean;
  visibleOnProductDetailPage: boolean;
  position: number;
  options?: ShopwarePropertyOption[];
}

/**
 * Shopware raw property option response structure
 */
interface ShopwarePropertyOption {
  id: string;
  name: string;
  position: number;
  colorHexCode: string | null;
  mediaId: string | null;
}

export class PropertyService {
  constructor(
    private readonly api: ShopwareApiClient,
    private readonly cache: InMemoryCache,
    private readonly logger: Logger
  ) {}

  // ===========================================================================
  // list() - Get all property groups with optional filter
  // ===========================================================================

  /**
   * List property groups with optional filter
   *
   * @param groupId - Optional: Filter by specific group ID
   * @returns Array of property groups sorted by position
   */
  async list(groupId?: string): Promise<PropertyGroup[]> {
    const cacheKey = `${CACHE_PREFIX}list:${groupId ?? 'all'}`;

    // Check cache
    const cached = this.cache.get<PropertyGroup[]>(cacheKey);
    if (cached) {
      this.logger.debug('Property group list from cache', { key: cacheKey });
      return cached;
    }

    // Build search criteria
    const criteria: SearchCriteria = {
      limit: 100,
      sort: [{ field: 'position', order: 'ASC' }],
      associations: {
        options: {},
      },
    };

    // Filter by specific group ID
    if (groupId) {
      criteria.ids = [groupId];
    }

    this.logger.debug('Fetching property groups', { groupId });

    const response = await this.api.search<ShopwarePropertyGroup>(
      'property-group',
      criteria
    );

    const propertyGroups = response.data.map((pg) => this.mapToPropertyGroup(pg));

    // Cache the result
    this.cache.set(cacheKey, propertyGroups, PROPERTY_CACHE_TTL);

    return propertyGroups;
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Map Shopware response to PropertyGroup entity
   */
  private mapToPropertyGroup(raw: ShopwarePropertyGroup): PropertyGroup {
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description,
      displayType: raw.displayType as PropertyDisplayType,
      sortingType: raw.sortingType as PropertySortingType,
      filterable: raw.filterable,
      visibleOnProductDetailPage: raw.visibleOnProductDetailPage,
      position: raw.position,
      options: raw.options ? raw.options.map((o) => this.mapOption(o)) : [],
    };
  }

  /**
   * Map property option
   */
  private mapOption(raw: ShopwarePropertyOption): PropertyOption {
    return {
      id: raw.id,
      name: raw.name,
      position: raw.position,
      colorHexCode: raw.colorHexCode,
      mediaId: raw.mediaId,
    };
  }
}
