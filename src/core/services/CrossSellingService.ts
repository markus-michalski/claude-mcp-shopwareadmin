/**
 * CrossSellingService - Business logic for cross-selling management
 *
 * Implements 5 cross-selling tool methods:
 * - list: List cross-sellings for a product
 * - get: Get cross-selling details with assigned products
 * - create: Create a new cross-selling group
 * - update: Update cross-selling (name, products, position, etc.)
 * - suggest: Generate AI suggestion context for cross-selling recommendations
 */
import type { Logger } from '../../infrastructure/logging/Logger.js';
import type {
  ShopwareApiClient,
  SearchCriteria,
} from '../../infrastructure/shopware/ShopwareApiClient.js';
import type { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import type {
  CrossSelling,
  CrossSellingListItem,
  CrossSellingProduct,
  CrossSellingSuggestionContext,
} from '../domain/CrossSelling.js';
import type {
  CrossSellingListInput,
  CrossSellingGetInput,
  CrossSellingCreateInput,
  CrossSellingUpdateInput,
  CrossSellingSuggestInput,
} from '../../application/schemas/CrossSellingSchemas.js';
import { MCPError, ErrorCode } from '../domain/Errors.js';

/**
 * Cache TTL: 5 minutes
 */
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Cache key prefix
 */
const CACHE_PREFIX = 'crossselling:';

/**
 * Associations for detail view
 */
const DETAIL_ASSOCIATIONS = {
  assignedProducts: {
    associations: {
      product: {},
    },
    sort: [{ field: 'position', order: 'ASC' as const }],
  },
  productStream: {},
};

/**
 * Shopware raw cross-selling response
 */
interface ShopwareCrossSelling {
  id: string;
  productId: string;
  name: string;
  type: string;
  active: boolean;
  position: number;
  sortBy: string | null;
  sortDirection: string | null;
  limit: number;
  productStreamId: string | null;
  productStream?: {
    name: string;
  } | null;
  assignedProducts?: Array<{
    id: string;
    productId: string;
    position: number;
    product?: {
      id: string;
      productNumber: string;
      name: string;
      active: boolean;
    } | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Shopware raw product response (for suggestions)
 */
interface ShopwareProductForSuggestion {
  id: string;
  productNumber: string;
  name: string;
  active: boolean;
  price?: Array<{ gross: number }>;
  categories?: Array<{
    id: string;
    name: string;
    breadcrumb?: string[];
  }>;
  properties?: Array<{
    name: string;
    group?: { name: string } | null;
  }>;
}

export class CrossSellingService {
  constructor(
    private readonly api: ShopwareApiClient,
    private readonly cache: InMemoryCache,
    private readonly logger: Logger
  ) {}

  // ===========================================================================
  // list() - List cross-sellings for a product
  // ===========================================================================

  /**
   * List all cross-selling groups for a product
   */
  async list(input: CrossSellingListInput): Promise<CrossSellingListItem[]> {
    const criteria: SearchCriteria = {
      limit: 50,
      filter: [
        { type: 'equals', field: 'productId', value: input.productId },
      ],
      associations: {
        assignedProducts: {},
      },
      sort: [{ field: 'position', order: 'ASC' }],
    };

    const response = await this.api.search<ShopwareCrossSelling>(
      'product-cross-selling',
      criteria
    );

    return response.data.map((cs) => ({
      id: cs.id,
      name: cs.name,
      type: cs.type as 'productList' | 'productStream',
      active: cs.active,
      position: cs.position,
      assignedProductCount: cs.assignedProducts?.length ?? 0,
    }));
  }

  // ===========================================================================
  // get() - Get cross-selling details
  // ===========================================================================

  /**
   * Get a cross-selling by ID with all assigned products
   */
  async get(input: CrossSellingGetInput): Promise<CrossSelling | null> {
    const cacheKey = `${CACHE_PREFIX}id:${input.id}`;

    const cached = this.cache.get<CrossSelling>(cacheKey);
    if (cached) {
      this.logger.debug('CrossSelling from cache', { key: cacheKey });
      return cached;
    }

    const criteria: SearchCriteria = {
      limit: 1,
      ids: [input.id],
      associations: DETAIL_ASSOCIATIONS,
    };

    try {
      const response = await this.api.search<ShopwareCrossSelling>(
        'product-cross-selling',
        criteria
      );

      const raw = response.data[0];
      if (!raw) return null;

      const cs = this.mapToCrossSelling(raw);
      this.cache.set(cacheKey, cs, CACHE_TTL);

      return cs;
    } catch (error) {
      if (error instanceof MCPError && error.code === ErrorCode.NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  // ===========================================================================
  // create() - Create a cross-selling group
  // ===========================================================================

  /**
   * Create a new cross-selling group for a product
   */
  async create(input: CrossSellingCreateInput): Promise<CrossSelling> {
    this.logger.info('Creating cross-selling', {
      productId: input.productId,
      name: input.name,
      type: input.type,
    });

    const payload: Record<string, unknown> = {
      productId: input.productId,
      name: input.name,
      type: input.type ?? 'productList',
      active: input.active ?? true,
      position: input.position ?? 1,
      limit: input.limit ?? 24,
    };

    if (input.sortBy) payload.sortBy = input.sortBy;
    if (input.sortDirection) payload.sortDirection = input.sortDirection;

    // Product stream type
    if (input.productStreamId) {
      payload.productStreamId = input.productStreamId;
    }

    // Manual product list
    if (input.assignedProductIds && input.assignedProductIds.length > 0) {
      payload.assignedProducts = input.assignedProductIds.map((pid, idx) => ({
        productId: pid,
        position: idx + 1,
      }));
    }

    try {
      const response = await this.api.post<{ data: { id: string } }>(
        '/api/product-cross-selling?_response=detail',
        payload
      );
      if (!response) {
        throw new MCPError(
          'Failed to create cross-selling: empty API response',
          ErrorCode.API_ERROR,
          true
        );
      }

      const created = await this.get({ id: response.data.id });
      if (!created) {
        throw new MCPError(
          'Cross-selling created but could not be retrieved',
          ErrorCode.API_ERROR,
          true
        );
      }

      this.logger.info('Cross-selling created', { id: created.id, name: created.name });
      return created;
    } catch (error) {
      if (error instanceof MCPError) throw error;
      throw new MCPError(
        `Failed to create cross-selling: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.API_ERROR,
        true,
        'Verify the product ID and assigned product IDs exist'
      );
    }
  }

  // ===========================================================================
  // update() - Update cross-selling
  // ===========================================================================

  /**
   * Update an existing cross-selling group
   */
  async update(
    id: string,
    data: Partial<Omit<CrossSellingUpdateInput, 'id'>>
  ): Promise<CrossSelling> {
    this.logger.info('Updating cross-selling', { id, fields: Object.keys(data) });

    const payload: Record<string, unknown> = {};

    if (data.name !== undefined) payload.name = data.name;
    if (data.active !== undefined) payload.active = data.active;
    if (data.position !== undefined) payload.position = data.position;
    if (data.sortBy !== undefined) payload.sortBy = data.sortBy;
    if (data.sortDirection !== undefined) payload.sortDirection = data.sortDirection;
    if (data.limit !== undefined) payload.limit = data.limit;

    // Replace assigned products
    if (data.assignedProductIds !== undefined) {
      payload.assignedProducts = data.assignedProductIds.map((pid, idx) => ({
        productId: pid,
        position: idx + 1,
      }));
    }

    try {
      await this.api.patch(`/api/product-cross-selling/${id}`, payload);
      this.invalidateCache(id);

      const updated = await this.get({ id });
      if (!updated) {
        throw MCPError.notFound('Cross-selling', id);
      }

      this.logger.info('Cross-selling updated', { id });
      return updated;
    } catch (error) {
      if (error instanceof MCPError) throw error;
      throw new MCPError(
        `Failed to update cross-selling: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.API_ERROR,
        true
      );
    }
  }

  // ===========================================================================
  // suggest() - Generate AI suggestion context
  // ===========================================================================

  /**
   * Generate context for AI-based cross-selling suggestions
   *
   * Fetches the source product, its category neighbors,
   * and existing cross-sellings to provide Claude with
   * enough context to make smart recommendations.
   */
  async suggest(input: CrossSellingSuggestInput): Promise<CrossSellingSuggestionContext> {
    this.logger.info('Generating cross-selling suggestion context', {
      productId: input.productId,
    });

    // 1. Fetch source product with categories and properties
    const productCriteria: SearchCriteria = {
      limit: 1,
      ids: [input.productId],
      associations: {
        categories: {},
        properties: {
          associations: { group: {} },
        },
      },
    };

    const productResponse = await this.api.search<ShopwareProductForSuggestion>(
      'product',
      productCriteria
    );
    const sourceProduct = productResponse.data[0];
    if (!sourceProduct) {
      throw MCPError.notFound('Product', input.productId);
    }

    // 2. Get existing cross-sellings to avoid duplicates
    const existingCS = await this.list({ productId: input.productId });
    const existingCrossSellingNames = existingCS.map((cs) => cs.name);

    // 3. Find candidate products from same categories
    const categoryIds = sourceProduct.categories?.map((c) => c.id) ?? [];
    let candidates: ShopwareProductForSuggestion[] = [];

    if (categoryIds.length > 0) {
      const candidateCriteria: SearchCriteria = {
        limit: input.limit ?? 20,
        filter: [
          { type: 'equalsAny', field: 'categories.id', value: categoryIds },
          { type: 'not', field: 'id', value: input.productId },
          { type: 'equals', field: 'active', value: true },
          { type: 'equals', field: 'parentId', value: null }, // Exclude variants
        ],
        associations: {
          categories: {},
        },
      };

      const candidateResponse = await this.api.search<ShopwareProductForSuggestion>(
        'product',
        candidateCriteria
      );
      candidates = candidateResponse.data;
    }

    // 4. Build suggestion context
    const categoryPath = sourceProduct.categories?.[0]?.breadcrumb?.join(' > ')
      ?? sourceProduct.categories?.[0]?.name
      ?? null;

    const properties = sourceProduct.properties?.map((p) =>
      p.group?.name ? `${p.group.name}: ${p.name}` : p.name
    ) ?? [];

    return {
      sourceProduct: {
        id: sourceProduct.id,
        name: sourceProduct.name,
        productNumber: sourceProduct.productNumber,
        categoryPath,
        price: sourceProduct.price?.[0]?.gross ?? null,
        properties,
      },
      candidates: candidates.map((c) => ({
        id: c.id,
        name: c.name,
        productNumber: c.productNumber,
        price: c.price?.[0]?.gross ?? null,
        categoryPath: c.categories?.[0]?.breadcrumb?.join(' > ')
          ?? c.categories?.[0]?.name
          ?? null,
      })),
      existingCrossSellings: existingCrossSellingNames,
    };
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Map Shopware response to CrossSelling entity
   */
  private mapToCrossSelling(raw: ShopwareCrossSelling): CrossSelling {
    const assignedProducts: CrossSellingProduct[] = (raw.assignedProducts ?? [])
      .sort((a, b) => a.position - b.position)
      .filter((ap) => ap.product != null)
      .map((ap) => ({
        productId: ap.product!.id,
        productNumber: ap.product!.productNumber,
        productName: ap.product!.name,
        active: ap.product!.active,
        position: ap.position,
      }));

    return {
      id: raw.id,
      productId: raw.productId,
      name: raw.name,
      type: raw.type as 'productList' | 'productStream',
      active: raw.active,
      position: raw.position,
      sortBy: raw.sortBy,
      sortDirection: raw.sortDirection,
      limit: raw.limit,
      productStreamId: raw.productStreamId,
      productStreamName: raw.productStream?.name ?? null,
      assignedProducts,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  /**
   * Invalidate cache for a cross-selling
   */
  private invalidateCache(id: string): void {
    this.cache.delete(`${CACHE_PREFIX}id:${id}`);
  }
}
