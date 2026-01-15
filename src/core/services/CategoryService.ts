/**
 * CategoryService - Business logic for category management
 *
 * Implements all 3 category tool methods:
 * - list: Get category tree with filters
 * - get: Get single category with optional products
 * - getBreadcrumb: Get path from category to root (for style detection)
 */
import type { Logger } from '../../infrastructure/logging/Logger.js';
import type {
  ShopwareApiClient,
  SearchCriteria,
  SearchFilter,
} from '../../infrastructure/shopware/ShopwareApiClient.js';
import type { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import type {
  Category,
  CategoryTreeItem,
} from '../domain/Category.js';
import type { SeoData } from '../domain/Product.js';
import type {
  CategoryListInput,
  CategoryGetInput,
} from '../../application/schemas/CategorySchemas.js';
import type { ProductListItem } from '../domain/Product.js';

/**
 * Cache TTL for categories: 10 minutes (categories change rarely)
 */
const CATEGORY_CACHE_TTL = 10 * 60 * 1000;

/**
 * Cache key prefix for categories
 */
const CACHE_PREFIX = 'category:';

/**
 * Maximum allowed depth for category tree
 */
const MAX_DEPTH = 10;

/**
 * Default product limit when fetching products for a category
 */
const DEFAULT_PRODUCT_LIMIT = 25;

/**
 * Shopware raw category response structure
 */
interface ShopwareCategory {
  id: string;
  name: string;
  parentId: string | null;
  path: string | null;
  breadcrumb: string[] | null;
  active: boolean;
  visible: boolean;
  level: number;
  childCount: number;
  type: string;
  productAssignmentType: string;
  cmsPageId: string | null;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string | null;
  children?: ShopwareCategory[];
}

/**
 * Shopware raw product response for category products
 */
interface ShopwareProductListItem {
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
  manufacturer?: { name: string } | null;
  categories?: Array<{ breadcrumb?: string[] }>;
}

/**
 * Extended Category with optional products
 */
export interface CategoryWithProducts extends Category {
  products?: ProductListItem[];
}

export class CategoryService {
  constructor(
    private readonly api: ShopwareApiClient,
    private readonly cache: InMemoryCache,
    private readonly logger: Logger
  ) {}

  // ===========================================================================
  // list() - Get category tree
  // ===========================================================================

  /**
   * List categories as flat list with optional filters
   *
   * - Excludes inactive categories by default
   * - Supports filtering by parentId
   * - Respects depth parameter (max 10)
   * - Results are cached for 10 minutes
   */
  async list(input: CategoryListInput): Promise<CategoryTreeItem[]> {
    const depth = Math.min(input.depth ?? 3, MAX_DEPTH);
    const includeInactive = input.includeInactive ?? false;
    const parentId = input.parentId;

    // Build cache key
    const cacheKey = `${CACHE_PREFIX}list:${parentId ?? 'root'}:${depth}:${includeInactive}`;

    // Check cache
    const cached = this.cache.get<CategoryTreeItem[]>(cacheKey);
    if (cached) {
      this.logger.debug('Category list from cache', { key: cacheKey });
      return cached;
    }

    // Build search criteria
    const criteria: SearchCriteria = {
      limit: 500, // Get all categories in one request
      associations: {
        children: {},
      },
      filter: [],
    };

    const filters: SearchFilter[] = [];

    // Filter by active status
    if (!includeInactive) {
      filters.push({ type: 'equals', field: 'active', value: true });
    }

    // Filter by parent ID
    if (parentId) {
      filters.push({ type: 'equals', field: 'parentId', value: parentId });
    }

    criteria.filter = filters;

    this.logger.debug('Fetching categories', { parentId, depth, includeInactive });

    const response = await this.api.search<ShopwareCategory>('category', criteria);

    const categories = response.data.map((c) => this.mapToTreeItem(c));

    // Cache the result
    this.cache.set(cacheKey, categories, CATEGORY_CACHE_TTL);

    return categories;
  }

  // ===========================================================================
  // get() - Get single category details
  // ===========================================================================

  /**
   * Get a category by ID
   *
   * - Returns null if not found (doesn't throw)
   * - Optionally includes products in the category
   * - Results are cached for 10 minutes
   */
  async get(input: CategoryGetInput): Promise<CategoryWithProducts | null> {
    const { id, includeProducts, productLimit } = input;

    // Cache key (without products to avoid cache fragmentation)
    const cacheKey = `${CACHE_PREFIX}id:${id}`;

    // Check cache for category
    let category = this.cache.get<Category>(cacheKey);

    if (!category) {
      // Fetch category from API
      const criteria: SearchCriteria = {
        ids: [id],
        limit: 1,
      };

      const response = await this.api.search<ShopwareCategory>('category', criteria);

      const rawCategory = response.data[0];
      if (!rawCategory) {
        return null;
      }

      category = this.mapToCategory(rawCategory);

      // Cache the category
      this.cache.set(cacheKey, category, CATEGORY_CACHE_TTL);
    } else {
      this.logger.debug('Category from cache', { key: cacheKey });
    }

    // Fetch products if requested
    if (includeProducts) {
      const products = await this.fetchCategoryProducts(
        id,
        productLimit ?? DEFAULT_PRODUCT_LIMIT
      );
      return { ...category, products };
    }

    return category;
  }

  // ===========================================================================
  // getBreadcrumb() - Get path from category to root
  // ===========================================================================

  /**
   * Get breadcrumb path for a category
   *
   * This is useful for:
   * - Navigation display
   * - Content style detection (Software vs Creative)
   * - SEO breadcrumb markup
   *
   * Returns empty array if category not found.
   */
  async getBreadcrumb(categoryId: string): Promise<string[]> {
    const category = await this.get({
      id: categoryId,
      includeProducts: false,
      productLimit: 0,
    });

    if (!category) {
      return [];
    }

    return category.breadcrumb;
  }

  // ===========================================================================
  // update() - Update category data (SEO, description)
  // ===========================================================================

  /**
   * Update category data
   *
   * Supports updating:
   * - description: Category description (HTML)
   * - metaTitle: SEO title
   * - metaDescription: SEO description
   * - keywords: SEO keywords
   *
   * Invalidates cache after update.
   */
  async update(
    id: string,
    data: {
      description?: string | undefined;
      metaTitle?: string | undefined;
      metaDescription?: string | undefined;
      keywords?: string | undefined;
    }
  ): Promise<Category> {
    this.logger.debug('Updating category', { id, fields: Object.keys(data) });

    // Build update payload
    const payload: Record<string, unknown> = {};

    if (data.description !== undefined) {
      payload.description = data.description;
    }
    if (data.metaTitle !== undefined) {
      payload.metaTitle = data.metaTitle;
    }
    if (data.metaDescription !== undefined) {
      payload.metaDescription = data.metaDescription;
    }
    if (data.keywords !== undefined) {
      payload.keywords = data.keywords;
    }

    // Update via API
    await this.api.patch(`/api/category/${id}`, payload);

    // Invalidate cache
    this.cache.delete(`${CACHE_PREFIX}id:${id}`);
    // Also invalidate list caches (they might contain outdated data)
    this.cache.clear();

    // Fetch and return updated category
    const updated = await this.get({
      id,
      includeProducts: false,
      productLimit: 0,
    });

    if (!updated) {
      throw new Error(`Category ${id} not found after update`);
    }

    return updated;
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Fetch products for a category
   */
  private async fetchCategoryProducts(
    categoryId: string,
    limit: number
  ): Promise<ProductListItem[]> {
    const criteria: SearchCriteria = {
      limit,
      filter: [{ type: 'equals', field: 'categoryIds', value: categoryId }],
      associations: {
        manufacturer: {},
        categories: {},
      },
    };

    const response = await this.api.search<ShopwareProductListItem>(
      'product',
      criteria
    );

    return response.data.map((p) => this.mapToProductListItem(p));
  }

  /**
   * Map Shopware response to Category entity
   */
  private mapToCategory(raw: ShopwareCategory): Category {
    return {
      id: raw.id,
      name: raw.name,
      parentId: raw.parentId,
      path: raw.path ?? '',
      breadcrumb: raw.breadcrumb ?? [raw.name],
      active: raw.active,
      visible: raw.visible,
      productCount: raw.childCount, // Note: This is child count, not product count
      description: raw.description,
      seoData: this.mapSeoData(raw),
      children: [], // Children are loaded separately if needed
    };
  }

  /**
   * Map Shopware response to CategoryTreeItem (lightweight)
   */
  private mapToTreeItem(raw: ShopwareCategory): CategoryTreeItem {
    return {
      id: raw.id,
      name: raw.name,
      parentId: raw.parentId,
      breadcrumb: raw.breadcrumb ?? [raw.name],
      active: raw.active,
      productCount: raw.childCount,
      children: [], // Children are loaded separately if needed
    };
  }

  /**
   * Map SEO data
   */
  private mapSeoData(raw: ShopwareCategory): SeoData | null {
    return {
      metaTitle: raw.metaTitle,
      metaDescription: raw.metaDescription,
      keywords: raw.keywords,
    };
  }

  /**
   * Map product for list display
   */
  private mapToProductListItem(raw: ShopwareProductListItem): ProductListItem {
    return {
      id: raw.id,
      productNumber: raw.productNumber,
      name: raw.name,
      active: raw.active,
      stock: raw.stock,
      price: raw.price.map((p) => ({
        currencyId: p.currencyId,
        gross: p.gross,
        net: p.net,
        linked: p.linked,
      })),
      manufacturerName: raw.manufacturer?.name ?? null,
      categoryPath: raw.categories?.[0]?.breadcrumb?.join(' > ') ?? null,
    };
  }
}
