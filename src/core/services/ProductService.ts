/**
 * ProductService - Business logic for product management
 *
 * Implements all 6 product tool methods:
 * - create: Create new product (ALWAYS inactive!)
 * - get: Get product by ID or productNumber
 * - list: List products with filters
 * - setActive: Activate/deactivate product
 * - update: Update product data
 * - search: Full-text search
 */
import type { Logger } from '../../infrastructure/logging/Logger.js';
import type { ShopwareApiClient, SearchCriteria, SearchFilter, ShopwareSearchResponse } from '../../infrastructure/shopware/ShopwareApiClient.js';
import type { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import type {
  Product,
  ProductListItem,
  CategoryReference,
  ProductVariant,
  PropertyValue,
  ProductMedia,
  VariantOption,
  Price,
  SeoData,
} from '../domain/Product.js';
import type {
  ProductCreateInput,
  ProductGetInput,
  ProductListInput,
  ProductUpdateInput,
} from '../../application/schemas/ProductSchemas.js';
import { MCPError, ErrorCode } from '../domain/Errors.js';

/**
 * Cache TTL for individual products: 5 minutes
 */
const PRODUCT_CACHE_TTL = 5 * 60 * 1000;

/**
 * Cache key prefix for products
 */
const CACHE_PREFIX = 'product:';

/**
 * Default 19% tax rate ID (German standard rate)
 * This should be fetched from config or API in production
 */
const DEFAULT_TAX_ID = '1950c5d2b90c4c5b9c1cf1a9e8e8e8e8';

/**
 * Default EUR currency ID
 * This should be fetched from config or API in production
 */
const DEFAULT_CURRENCY_ID = 'b7d2554b0ce847cd82f3ac9bd1c0dfca';

/**
 * Standard associations to load with products
 */
const PRODUCT_ASSOCIATIONS: Record<string, SearchCriteria | object> = {
  categories: {},
  manufacturer: {},
  children: {
    associations: {
      options: {
        associations: {
          group: {},
        },
      },
    },
  },
  properties: {
    associations: {
      group: {},
    },
  },
  media: {
    associations: {
      media: {},
    },
  },
  cover: {
    associations: {
      media: {},
    },
  },
};

/**
 * Shopware raw product response structure
 */
interface ShopwareProduct {
  id: string;
  productNumber: string;
  name: string;
  description: string | null;
  active: boolean;
  stock: number;
  ean: string | null;
  price: Array<{
    currencyId: string;
    gross: number;
    net: number;
    linked: boolean;
  }>;
  taxId: string;
  manufacturerId: string | null;
  manufacturer?: {
    id: string;
    name: string;
  } | null;
  categories?: Array<{
    id: string;
    name: string;
    breadcrumb?: string[];
    path?: string;
  }>;
  children?: Array<ShopwareProductVariant>;
  properties?: Array<{
    id: string;
    name: string;
    group?: { id: string; name: string } | null;
  }>;
  media?: Array<{
    id: string;
    position: number;
    media?: {
      url: string | null;
      alt: string | null;
    } | null;
  }>;
  coverId: string | null;
  customFields: Record<string, unknown> | null;
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ShopwareProductVariant {
  id: string;
  productNumber: string;
  name: string;
  active: boolean;
  stock: number;
  price: Array<{
    currencyId: string;
    gross: number;
    net: number;
    linked: boolean;
  }>;
  options?: Array<{
    id: string;
    name: string;
    group?: { id: string; name: string } | null;
  }>;
}

export class ProductService {
  constructor(
    private readonly api: ShopwareApiClient,
    private readonly cache: InMemoryCache,
    private readonly logger: Logger
  ) {}

  // ===========================================================================
  // create() - Create new product (ALWAYS inactive!)
  // ===========================================================================

  /**
   * Create a new product
   *
   * IMPORTANT: Products are ALWAYS created with active: false for safety.
   * Use setActive() to activate after review.
   */
  async create(input: ProductCreateInput): Promise<Product> {
    this.logger.info('Creating new product', { productNumber: input.productNumber });

    const taxId = input.taxId ?? DEFAULT_TAX_ID;
    const taxRate = this.getTaxRateForId(taxId);
    const netPrice = input.price / (1 + taxRate / 100);

    const payload = {
      name: input.name,
      productNumber: input.productNumber,
      active: false, // ALWAYS inactive on creation!
      stock: input.stock ?? 0,
      description: input.description ?? null,
      ean: input.ean ?? null,
      manufacturerId: input.manufacturerId ?? null,
      taxId,
      price: [
        {
          currencyId: DEFAULT_CURRENCY_ID,
          gross: input.price,
          net: Math.round(netPrice * 100) / 100,
          linked: true,
        },
      ],
      categories: [{ id: input.categoryId }],
    };

    try {
      const response = await this.api.post<{ data: ShopwareProduct }>('/api/product', payload);
      const product = this.mapToProduct(response.data);

      this.logger.info('Product created', { id: product.id, productNumber: product.productNumber });

      return product;
    } catch (error) {
      if (error instanceof MCPError) {
        // Check for duplicate product number
        if (error.message.includes('DUPLICATE_PRODUCT_NUMBER') || error.message.includes('already exists')) {
          throw new MCPError(
            `Product number "${input.productNumber}" already exists`,
            ErrorCode.PRODUCT_NUMBER_EXISTS,
            false,
            'Use a unique product number'
          );
        }
        throw error;
      }
      throw error;
    }
  }

  // ===========================================================================
  // get() - Get product by ID or productNumber
  // ===========================================================================

  /**
   * Get a product by ID or product number
   *
   * Returns null if not found (doesn't throw).
   * Results are cached for 5 minutes.
   */
  async get(input: ProductGetInput): Promise<Product | null> {
    const cacheKey = input.id
      ? `${CACHE_PREFIX}id:${input.id}`
      : `${CACHE_PREFIX}number:${input.productNumber}`;

    // Check cache first
    const cached = this.cache.get<Product>(cacheKey);
    if (cached) {
      this.logger.debug('Product from cache', { key: cacheKey });
      return cached;
    }

    // Build search criteria
    const criteria: SearchCriteria = {
      limit: 1,
      associations: PRODUCT_ASSOCIATIONS,
      filter: [],
    };

    if (input.id) {
      criteria.ids = [input.id];
    } else if (input.productNumber) {
      criteria.filter = [
        { type: 'equals', field: 'productNumber', value: input.productNumber },
      ];
    }

    try {
      const response = await this.api.search<ShopwareProduct>('product', criteria);

      const rawProduct = response.data[0];
      if (!rawProduct) {
        return null;
      }

      const product = this.mapToProduct(rawProduct);

      // Cache the result
      this.cache.set(cacheKey, product, PRODUCT_CACHE_TTL);

      // Also cache by both ID and productNumber for cross-lookup
      if (input.id) {
        this.cache.set(`${CACHE_PREFIX}number:${product.productNumber}`, product, PRODUCT_CACHE_TTL);
      } else {
        this.cache.set(`${CACHE_PREFIX}id:${product.id}`, product, PRODUCT_CACHE_TTL);
      }

      return product;
    } catch (error) {
      if (error instanceof MCPError && error.code === ErrorCode.NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  // ===========================================================================
  // list() - List products with filters
  // ===========================================================================

  /**
   * List products with filters
   *
   * Lists are NOT cached to ensure fresh data.
   */
  async list(input: ProductListInput): Promise<{ products: ProductListItem[]; total: number }> {
    const criteria: SearchCriteria = {
      limit: input.limit ?? 25,
      page: input.offset ? Math.floor(input.offset / (input.limit ?? 25)) + 1 : 1,
      associations: {
        manufacturer: {},
        categories: {},
      },
      filter: [],
    };

    const filters: SearchFilter[] = [];

    // Filter by category
    if (input.categoryId) {
      filters.push({ type: 'equals', field: 'categoryIds', value: input.categoryId });
    }

    // Filter by active status
    if (input.active !== undefined) {
      filters.push({ type: 'equals', field: 'active', value: input.active });
    }

    // Search in name and productNumber
    if (input.search) {
      filters.push({
        type: 'multi',
        operator: 'OR',
        queries: [
          { type: 'contains', field: 'name', value: input.search },
          { type: 'contains', field: 'productNumber', value: input.search },
        ],
      });
    }

    criteria.filter = filters;

    const response = await this.api.search<ShopwareProduct>('product', criteria);

    const products = response.data.map((p) => this.mapToListItem(p));

    return {
      products,
      total: response.total,
    };
  }

  // ===========================================================================
  // setActive() - Activate/deactivate product
  // ===========================================================================

  /**
   * Set product active status
   */
  async setActive(id: string, active: boolean): Promise<void> {
    this.logger.info('Setting product active status', { id, active });

    try {
      await this.api.patch(`/api/product/${id}`, { active });
      this.invalidateCache(id);
      this.logger.info('Product active status updated', { id, active });
    } catch (error) {
      if (error instanceof MCPError && error.code === ErrorCode.NOT_FOUND) {
        throw MCPError.notFound('Product', id);
      }
      throw error;
    }
  }

  // ===========================================================================
  // update() - Update product data
  // ===========================================================================

  /**
   * Update product data
   */
  async update(id: string, data: Partial<Omit<ProductUpdateInput, 'id'>>): Promise<Product> {
    this.logger.info('Updating product', { id, fields: Object.keys(data) });

    const payload: Record<string, unknown> = {};

    if (data.name !== undefined) payload.name = data.name;
    if (data.description !== undefined) payload.description = data.description;
    if (data.ean !== undefined) payload.ean = data.ean;
    if (data.stock !== undefined) payload.stock = data.stock;
    if (data.manufacturerId !== undefined) payload.manufacturerId = data.manufacturerId;

    // Handle price update
    if (data.price !== undefined) {
      const taxRate = 19; // TODO: Get from product's current tax rate
      const netPrice = data.price / (1 + taxRate / 100);
      payload.price = [
        {
          currencyId: DEFAULT_CURRENCY_ID,
          gross: data.price,
          net: Math.round(netPrice * 100) / 100,
          linked: true,
        },
      ];
    }

    try {
      await this.api.patch(`/api/product/${id}`, payload);
      this.invalidateCache(id);

      // Fetch and return updated product
      const updated = await this.get({ id });
      if (!updated) {
        throw MCPError.notFound('Product', id);
      }

      return updated;
    } catch (error) {
      if (error instanceof MCPError && error.code === ErrorCode.NOT_FOUND) {
        throw MCPError.notFound('Product', id);
      }
      throw error;
    }
  }

  // ===========================================================================
  // search() - Full-text search
  // ===========================================================================

  /**
   * Full-text search for products
   */
  async search(query: string, limit: number): Promise<Product[]> {
    this.logger.debug('Searching products', { query, limit });

    const criteria: SearchCriteria = {
      term: query,
      limit,
      associations: PRODUCT_ASSOCIATIONS,
    };

    const response = await this.api.search<ShopwareProduct>('product', criteria);

    return response.data.map((p) => this.mapToProduct(p));
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Get tax rate for a tax ID
   *
   * Currently returns hardcoded values, should fetch from API in production
   */
  private getTaxRateForId(taxId: string): number {
    // Hardcoded for now - should be fetched from /api/tax
    const taxRates: Record<string, number> = {
      '1950c5d2b90c4c5b9c1cf1a9e8e8e8e8': 19, // Standard
      '7000c5d2b90c4c5b9c1cf1a9e8e8e8e8': 7, // Reduced
    };
    return taxRates[taxId] ?? 19;
  }

  /**
   * Invalidate cache for a product
   */
  private invalidateCache(id: string): void {
    // Get the product first to find productNumber (if cached)
    const cached = this.cache.get<Product>(`${CACHE_PREFIX}id:${id}`);
    if (cached) {
      this.cache.delete(`${CACHE_PREFIX}number:${cached.productNumber}`);
    }
    this.cache.delete(`${CACHE_PREFIX}id:${id}`);
  }

  /**
   * Map Shopware response to Product entity
   */
  private mapToProduct(raw: ShopwareProduct): Product {
    return {
      id: raw.id,
      productNumber: raw.productNumber,
      name: raw.name,
      description: raw.description,
      active: raw.active,
      stock: raw.stock,
      ean: raw.ean,
      price: this.mapPrices(raw.price),
      manufacturerId: raw.manufacturerId,
      manufacturerName: raw.manufacturer?.name ?? null,
      categories: this.mapCategories(raw.categories ?? []),
      variants: this.mapVariants(raw.children ?? []),
      properties: this.mapProperties(raw.properties ?? []),
      media: this.mapMedia(raw.media ?? []),
      seoData: this.mapSeoData(raw),
      customFields: raw.customFields ?? {},
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  /**
   * Map Shopware response to ProductListItem
   */
  private mapToListItem(raw: ShopwareProduct): ProductListItem {
    return {
      id: raw.id,
      productNumber: raw.productNumber,
      name: raw.name,
      active: raw.active,
      stock: raw.stock,
      price: this.mapPrices(raw.price),
      manufacturerName: raw.manufacturer?.name ?? null,
      categoryPath: raw.categories?.[0]?.breadcrumb?.join(' > ') ?? null,
    };
  }

  /**
   * Map price array
   */
  private mapPrices(prices: ShopwareProduct['price']): Price[] {
    return prices.map((p) => ({
      currencyId: p.currencyId,
      gross: p.gross,
      net: p.net,
      linked: p.linked,
    }));
  }

  /**
   * Map categories to CategoryReference[]
   */
  private mapCategories(
    categories: NonNullable<ShopwareProduct['categories']>
  ): CategoryReference[] {
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      path: c.breadcrumb?.join(' > ') ?? c.path ?? '',
    }));
  }

  /**
   * Map children to ProductVariant[]
   */
  private mapVariants(children: ShopwareProductVariant[]): ProductVariant[] {
    return children.map((v) => ({
      id: v.id,
      productNumber: v.productNumber,
      name: v.name,
      active: v.active,
      stock: v.stock,
      price: this.mapPrices(v.price),
      options: this.mapVariantOptions(v.options ?? []),
    }));
  }

  /**
   * Map variant options
   */
  private mapVariantOptions(
    options: NonNullable<ShopwareProductVariant['options']>
  ): VariantOption[] {
    return options.map((o) => ({
      id: o.id,
      name: o.name,
      groupName: o.group?.name ?? null,
    }));
  }

  /**
   * Map properties
   */
  private mapProperties(
    properties: NonNullable<ShopwareProduct['properties']>
  ): PropertyValue[] {
    return properties.map((p) => ({
      id: p.id,
      name: p.name,
      groupName: p.group?.name ?? null,
    }));
  }

  /**
   * Map media
   */
  private mapMedia(media: NonNullable<ShopwareProduct['media']>): ProductMedia[] {
    return media
      .sort((a, b) => a.position - b.position)
      .map((m) => ({
        id: m.id,
        url: m.media?.url ?? null,
        alt: m.media?.alt ?? null,
        position: m.position,
      }));
  }

  /**
   * Map SEO data
   */
  private mapSeoData(raw: ShopwareProduct): SeoData | null {
    return {
      metaTitle: raw.metaTitle,
      metaDescription: raw.metaDescription,
      keywords: raw.keywords,
    };
  }
}
