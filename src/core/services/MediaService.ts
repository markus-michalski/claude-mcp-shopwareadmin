/**
 * MediaService - Business logic for media management
 *
 * Implements all 6 media tool methods:
 * - list: List media with filters (hasAlt for BFSG audit)
 * - get: Get media details with thumbnails, folder, products
 * - update: Update alt text and title (BFSG compliance)
 * - search: Full-text search across media
 * - auditAlt: Find product media missing alt text
 * - uploadFromUrl: Upload media from URL
 */
import type { Logger } from '../../infrastructure/logging/Logger.js';
import type {
  ShopwareApiClient,
  SearchCriteria,
  SearchFilter,
} from '../../infrastructure/shopware/ShopwareApiClient.js';
import type { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import type {
  Media,
  MediaListItem,
  MediaAuditResult,
  MediaAuditItem,
  MediaProductReference,
  MediaUploadResult,
} from '../domain/Media.js';
import type {
  MediaListInput,
  MediaGetInput,
  MediaUpdateInput,
  MediaSearchInput,
  MediaAuditAltInput,
  MediaUploadUrlInput,
} from '../../application/schemas/MediaSchemas.js';
import { MCPError, ErrorCode } from '../domain/Errors.js';

/**
 * Cache TTL for media: 5 minutes
 */
const MEDIA_CACHE_TTL = 5 * 60 * 1000;

/**
 * Cache key prefix for media
 */
const CACHE_PREFIX = 'media:';

/**
 * Associations for detailed media view
 */
const MEDIA_DETAIL_ASSOCIATIONS = {
  thumbnails: {},
  mediaFolder: {},
  productMedia: {
    associations: {
      product: {},
    },
  },
};

/**
 * Shopware raw media response structure
 */
interface ShopwareMedia {
  id: string;
  fileName: string;
  fileExtension: string;
  mimeType: string;
  fileSize: number;
  url: string | null;
  alt: string | null;
  title: string | null;
  mediaFolderId: string | null;
  mediaFolder?: {
    id: string;
    name: string;
  } | null;
  thumbnails?: Array<{
    id: string;
    width: number;
    height: number;
    url: string;
  }>;
  productMedia?: Array<{
    id: string;
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
 * Shopware raw product-media response (for audit)
 */
interface ShopwareProductMedia {
  id: string;
  productId: string;
  mediaId: string;
  position: number;
  media?: ShopwareMedia | null;
  product?: {
    id: string;
    productNumber: string;
    name: string;
    active: boolean;
  } | null;
}

export class MediaService {
  constructor(
    private readonly api: ShopwareApiClient,
    private readonly cache: InMemoryCache,
    private readonly logger: Logger
  ) {}

  // ===========================================================================
  // list() - List media with filters
  // ===========================================================================

  /**
   * List media with optional filters
   *
   * The hasAlt filter is the key feature for BFSG compliance:
   * - hasAlt: false -> Find all media missing alt text
   * - hasAlt: true -> Find all media with alt text
   *
   * Lists are NOT cached to ensure fresh data.
   */
  async list(input: MediaListInput): Promise<{
    media: MediaListItem[];
    total: number;
  }> {
    const criteria: SearchCriteria = {
      limit: input.limit ?? 25,
      page: input.offset ? Math.floor(input.offset / (input.limit ?? 25)) + 1 : 1,
      filter: [],
      sort: [{ field: 'createdAt', order: 'DESC' }],
    };

    const filters: SearchFilter[] = [];

    // Filter by media folder
    if (input.mediaFolderId) {
      filters.push({
        type: 'equals',
        field: 'mediaFolderId',
        value: input.mediaFolderId,
      });
    }

    // Filter by MIME type prefix (e.g., "image/", "video/")
    if (input.mimeTypePrefix) {
      filters.push({
        type: 'prefix',
        field: 'mimeType',
        value: input.mimeTypePrefix,
      });
    }

    // Filter by ALT text presence (BFSG compliance)
    if (input.hasAlt !== undefined) {
      if (input.hasAlt) {
        // Has alt text: NOT NULL filter
        filters.push({
          type: 'not',
          field: 'alt',
          value: null,
        });
      } else {
        // Missing alt text: NULL filter
        filters.push({
          type: 'equals',
          field: 'alt',
          value: null,
        });
      }
    }

    criteria.filter = filters;

    const response = await this.api.search<ShopwareMedia>('media', criteria);

    const media = response.data.map((m) => this.mapToListItem(m));

    return {
      media,
      total: response.total,
    };
  }

  // ===========================================================================
  // get() - Get media details
  // ===========================================================================

  /**
   * Get a media item by ID with full details
   *
   * Includes thumbnails, folder info, and which products use it.
   * Results are cached for 5 minutes.
   */
  async get(input: MediaGetInput): Promise<Media | null> {
    const cacheKey = `${CACHE_PREFIX}id:${input.id}`;

    // Check cache first
    const cached = this.cache.get<Media>(cacheKey);
    if (cached) {
      this.logger.debug('Media from cache', { key: cacheKey });
      return cached;
    }

    const criteria: SearchCriteria = {
      limit: 1,
      ids: [input.id],
      associations: MEDIA_DETAIL_ASSOCIATIONS,
    };

    try {
      const response = await this.api.search<ShopwareMedia>('media', criteria);

      const raw = response.data[0];
      if (!raw) {
        return null;
      }

      const media = this.mapToMedia(raw);

      // Cache the result
      this.cache.set(cacheKey, media, MEDIA_CACHE_TTL);

      return media;
    } catch (error) {
      if (error instanceof MCPError && error.code === ErrorCode.NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  // ===========================================================================
  // update() - Update media metadata (alt, title)
  // ===========================================================================

  /**
   * Update media metadata
   *
   * Primarily used for adding/updating alt text (BFSG compliance).
   * Only updates provided fields.
   */
  async update(
    id: string,
    data: Partial<Omit<MediaUpdateInput, 'id'>>
  ): Promise<Media> {
    this.logger.info('Updating media', { id, fields: Object.keys(data) });

    const payload: Record<string, unknown> = {};

    if (data.alt !== undefined) payload.alt = data.alt;
    if (data.title !== undefined) payload.title = data.title;

    if (Object.keys(payload).length === 0) {
      throw MCPError.invalidInput('At least one field (alt or title) must be provided');
    }

    try {
      await this.api.patch(`/api/media/${id}`, payload);
      this.invalidateCache(id);

      // Fetch and return updated media
      const updated = await this.get({ id });
      if (!updated) {
        throw MCPError.notFound('Media', id);
      }

      this.logger.info('Media updated', { id, fields: Object.keys(payload) });
      return updated;
    } catch (error) {
      if (error instanceof MCPError && error.code === ErrorCode.NOT_FOUND) {
        throw MCPError.notFound('Media', id);
      }
      throw error;
    }
  }

  // ===========================================================================
  // search() - Full-text search across media
  // ===========================================================================

  /**
   * Search media by term (fileName, alt, title)
   *
   * Uses Shopware's built-in search functionality.
   * Results are NOT cached.
   */
  async search(query: string, limit: number): Promise<MediaListItem[]> {
    const criteria: SearchCriteria = {
      term: query,
      limit,
    };

    const response = await this.api.search<ShopwareMedia>('media', criteria);

    return response.data.map((m) => this.mapToListItem(m));
  }

  // ===========================================================================
  // auditAlt() - BFSG compliance audit
  // ===========================================================================

  /**
   * Audit product media for missing alt texts
   *
   * This is the key BFSG compliance tool. It searches through
   * product-media associations to find images that are used on
   * products but lack alt text.
   *
   * Results are grouped by media item and include affected products.
   */
  async auditAlt(input: MediaAuditAltInput): Promise<MediaAuditResult> {
    this.logger.info('Starting BFSG alt text audit', {
      onlyActive: input.onlyActive,
      limit: input.limit,
    });

    const criteria: SearchCriteria = {
      limit: input.limit ?? 100,
      associations: {
        media: {},
        product: {},
      },
      filter: [
        {
          type: 'equals',
          field: 'media.alt',
          value: null,
        },
      ],
    };

    // Only check active products
    if (input.onlyActive) {
      (criteria.filter as SearchFilter[]).push({
        type: 'equals',
        field: 'product.active',
        value: true,
      });
    }

    // Filter to images only (skip documents, videos etc.)
    (criteria.filter as SearchFilter[]).push({
      type: 'prefix',
      field: 'media.mimeType',
      value: 'image/',
    });

    let response;
    try {
      response = await this.api.search<ShopwareProductMedia>('product-media', criteria);
    } catch (error) {
      // Fallback: if product-media search fails, try via media entity
      this.logger.warn('product-media search failed, falling back to media search', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.auditAltFallback(input);
    }

    // Group results by media ID
    const mediaMap = new Map<string, MediaAuditItem>();
    const affectedProducts = new Set<string>();

    for (const pm of response.data) {
      if (!pm.media || !pm.product) continue;

      const existing = mediaMap.get(pm.mediaId);
      const productRef: MediaProductReference = {
        productId: pm.product.id,
        productNumber: pm.product.productNumber,
        productName: pm.product.name,
        active: pm.product.active,
      };

      affectedProducts.add(pm.product.id);

      if (existing) {
        existing.products.push(productRef);
      } else {
        mediaMap.set(pm.mediaId, {
          mediaId: pm.media.id,
          fileName: pm.media.fileName,
          url: pm.media.url,
          alt: pm.media.alt,
          title: pm.media.title,
          products: [productRef],
        });
      }
    }

    const items = Array.from(mediaMap.values());

    const result: MediaAuditResult = {
      totalMediaChecked: response.total,
      missingAltCount: items.length,
      affectedProductCount: affectedProducts.size,
      items,
    };

    this.logger.info('BFSG audit complete', {
      totalChecked: result.totalMediaChecked,
      missingAlt: result.missingAltCount,
      affectedProducts: result.affectedProductCount,
    });

    return result;
  }

  /**
   * Fallback audit method using media entity directly
   * Used when product-media search is not available
   */
  private async auditAltFallback(input: MediaAuditAltInput): Promise<MediaAuditResult> {
    this.logger.info('Using fallback audit via media entity');

    const criteria: SearchCriteria = {
      limit: input.limit ?? 100,
      associations: {
        productMedia: {
          associations: {
            product: {},
          },
        },
      },
      filter: [
        { type: 'equals', field: 'alt', value: null },
        { type: 'prefix', field: 'mimeType', value: 'image/' },
      ],
    };

    const response = await this.api.search<ShopwareMedia>('media', criteria);

    const items: MediaAuditItem[] = [];
    const affectedProducts = new Set<string>();

    for (const raw of response.data) {
      // Only include media that is actually used on products
      const products: MediaProductReference[] = [];
      if (raw.productMedia) {
        for (const pm of raw.productMedia) {
          if (!pm.product) continue;
          if (input.onlyActive && !pm.product.active) continue;
          products.push({
            productId: pm.product.id,
            productNumber: pm.product.productNumber,
            productName: pm.product.name,
            active: pm.product.active,
          });
          affectedProducts.add(pm.product.id);
        }
      }

      if (products.length > 0) {
        items.push({
          mediaId: raw.id,
          fileName: raw.fileName,
          url: raw.url,
          alt: raw.alt,
          title: raw.title,
          products,
        });
      }
    }

    return {
      totalMediaChecked: response.total,
      missingAltCount: items.length,
      affectedProductCount: affectedProducts.size,
      items,
    };
  }

  // ===========================================================================
  // uploadFromUrl() - Upload media from URL
  // ===========================================================================

  /**
   * Upload media from a URL
   *
   * Two-step process:
   * 1. Create media entity (with optional alt/title)
   * 2. Trigger URL download via Shopware action endpoint
   */
  async uploadFromUrl(input: MediaUploadUrlInput): Promise<MediaUploadResult> {
    this.logger.info('Uploading media from URL', { url: input.url });

    // Extract filename and extension from URL
    const urlPath = new URL(input.url).pathname;
    const lastSegment = urlPath.split('/').pop() ?? 'upload';
    const dotIndex = lastSegment.lastIndexOf('.');
    const fileName = dotIndex > 0 ? lastSegment.substring(0, dotIndex) : lastSegment;
    const fileExtension = dotIndex > 0 ? lastSegment.substring(dotIndex + 1) : 'jpg';

    // Step 1: Create media entity
    const createPayload: Record<string, unknown> = {};
    if (input.alt) createPayload.alt = input.alt;
    if (input.title) createPayload.title = input.title;
    if (input.mediaFolderId) createPayload.mediaFolderId = input.mediaFolderId;

    let mediaId: string;
    try {
      const createResponse = await this.api.post<{ data: { id: string } }>(
        '/api/media?_response=detail',
        createPayload
      );
      mediaId = createResponse.data.id;
    } catch (error) {
      throw new MCPError(
        `Failed to create media entity: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.API_ERROR,
        true,
        'Check if media folder ID is valid'
      );
    }

    // Step 2: Upload from URL
    try {
      await this.api.post(
        `/api/_action/media/${mediaId}/upload?extension=${fileExtension}&fileName=${encodeURIComponent(fileName)}`,
        { url: input.url }
      );

      this.logger.info('Media uploaded from URL', { mediaId, fileName });

      // Fetch the created media to get the URL
      const media = await this.get({ id: mediaId });

      return {
        success: true,
        mediaId,
        fileName: media?.fileName ?? fileName,
        url: media?.url ?? null,
      };
    } catch (error) {
      // Media entity was created but upload failed - clean up
      this.logger.error('Upload failed, cleaning up media entity', {
        mediaId,
        error: error instanceof Error ? error.message : String(error),
      });

      try {
        await this.api.delete(`/api/media/${mediaId}`);
      } catch {
        this.logger.warn('Failed to clean up media entity after upload failure', { mediaId });
      }

      throw new MCPError(
        `Failed to upload media from URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.API_ERROR,
        true,
        'Verify the URL is accessible and points to a valid media file'
      );
    }
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Map Shopware response to full Media entity
   */
  private mapToMedia(raw: ShopwareMedia): Media {
    const products: MediaProductReference[] = [];
    if (raw.productMedia) {
      for (const pm of raw.productMedia) {
        if (pm.product) {
          products.push({
            productId: pm.product.id,
            productNumber: pm.product.productNumber,
            productName: pm.product.name,
            active: pm.product.active,
          });
        }
      }
    }

    return {
      id: raw.id,
      fileName: raw.fileName,
      fileExtension: raw.fileExtension,
      mimeType: raw.mimeType,
      fileSize: raw.fileSize,
      url: raw.url,
      alt: raw.alt,
      title: raw.title,
      mediaFolderId: raw.mediaFolderId,
      folder: raw.mediaFolder
        ? { id: raw.mediaFolder.id, name: raw.mediaFolder.name }
        : null,
      thumbnails: (raw.thumbnails ?? []).map((t) => ({
        id: t.id,
        width: t.width,
        height: t.height,
        url: t.url,
      })),
      products,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  /**
   * Map Shopware response to lightweight MediaListItem
   */
  private mapToListItem(raw: ShopwareMedia): MediaListItem {
    return {
      id: raw.id,
      fileName: raw.fileName,
      fileExtension: raw.fileExtension,
      mimeType: raw.mimeType,
      fileSize: raw.fileSize,
      url: raw.url,
      alt: raw.alt,
      title: raw.title,
      createdAt: raw.createdAt,
    };
  }

  /**
   * Invalidate cache for a media item
   */
  private invalidateCache(id: string): void {
    this.cache.delete(`${CACHE_PREFIX}id:${id}`);
  }
}
