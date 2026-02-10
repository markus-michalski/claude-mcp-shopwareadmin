/**
 * SEO URL Service
 *
 * Handles SEO URL listing, auditing, updating, and regeneration.
 * Provides tools for SEO URL health checks and optimization.
 */

import type { Logger } from '../../infrastructure/logging/Logger.js';
import type { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import type {
  ShopwareApiClient,
  SearchCriteria,
  SearchFilter,
} from '../../infrastructure/shopware/ShopwareApiClient.js';
import type {
  SeoUrl,
  SeoUrlListItem,
  SeoUrlAuditResult,
  SeoUrlAuditIssue,
} from '../domain/SeoUrl.js';
import type {
  SeoUrlListInput,
  SeoUrlAuditInput,
  SeoUrlUpdateInput,
  SeoUrlGenerateInput,
} from '../../application/schemas/SeoUrlSchemas.js';
import { ErrorCode, MCPError } from '../domain/Errors.js';

/**
 * Maps raw Shopware seo_url data to our domain list item
 */
function mapToListItem(raw: Record<string, unknown>): SeoUrlListItem {
  return {
    id: raw.id as string,
    seoPathInfo: (raw.seoPathInfo as string) ?? '',
    pathInfo: (raw.pathInfo as string) ?? '',
    routeName: (raw.routeName as string) ?? '',
    isCanonical: (raw.isCanonical as boolean) ?? false,
    isModified: (raw.isModified as boolean) ?? false,
    isDeleted: (raw.isDeleted as boolean) ?? false,
    salesChannelName: extractSalesChannelName(raw),
    foreignKey: (raw.foreignKey as string) ?? '',
  };
}

/**
 * Maps raw Shopware seo_url data to our full domain entity
 */
function mapToSeoUrl(raw: Record<string, unknown>): SeoUrl {
  return {
    id: raw.id as string,
    salesChannelId: (raw.salesChannelId as string) ?? null,
    salesChannelName: extractSalesChannelName(raw),
    languageId: (raw.languageId as string) ?? '',
    foreignKey: (raw.foreignKey as string) ?? '',
    routeName: (raw.routeName as string) ?? '',
    pathInfo: (raw.pathInfo as string) ?? '',
    seoPathInfo: (raw.seoPathInfo as string) ?? '',
    isCanonical: (raw.isCanonical as boolean) ?? false,
    isModified: (raw.isModified as boolean) ?? false,
    isDeleted: (raw.isDeleted as boolean) ?? false,
    entityName: deriveEntityName(raw.routeName as string),
    entityIdentifier: null,
    createdAt: (raw.createdAt as string) ?? '',
    updatedAt: (raw.updatedAt as string) ?? '',
  };
}

/**
 * Extract sales channel name from nested association
 */
function extractSalesChannelName(raw: Record<string, unknown>): string | null {
  const sc = raw.salesChannel as Record<string, unknown> | undefined;
  if (sc) {
    const translated = sc.translated as Record<string, unknown> | undefined;
    return (translated?.name as string) ?? (sc.name as string) ?? null;
  }
  return null;
}

/**
 * Derive entity name from route name
 */
function deriveEntityName(routeName: string | null): string | null {
  if (!routeName) return null;
  const map: Record<string, string> = {
    'frontend.detail.page': 'product',
    'frontend.navigation.page': 'category',
    'frontend.landing.page': 'landing_page',
  };
  return map[routeName] ?? null;
}

export class SeoUrlService {
  constructor(
    private readonly api: ShopwareApiClient,
    private readonly cache: InMemoryCache,
    private readonly logger: Logger
  ) {}

  /**
   * List SEO URLs with optional filters
   */
  async list(
    input: SeoUrlListInput
  ): Promise<{ urls: SeoUrlListItem[]; total: number }> {
    const filters: SearchFilter[] = [];

    if (input.routeName) {
      filters.push({ type: 'equals', field: 'routeName', value: input.routeName });
    }
    if (input.salesChannelId) {
      filters.push({ type: 'equals', field: 'salesChannelId', value: input.salesChannelId });
    }
    if (input.foreignKey) {
      filters.push({ type: 'equals', field: 'foreignKey', value: input.foreignKey });
    }
    if (input.isCanonical !== undefined) {
      filters.push({ type: 'equals', field: 'isCanonical', value: input.isCanonical });
    }
    if (input.isDeleted !== undefined) {
      filters.push({ type: 'equals', field: 'isDeleted', value: input.isDeleted });
    }

    const criteria: SearchCriteria = {
      sort: [{ field: 'seoPathInfo', order: 'ASC' }],
      limit: input.limit ?? 25,
      page: Math.floor((input.offset ?? 0) / (input.limit ?? 25)) + 1,
      associations: {
        salesChannel: {},
      },
    };

    if (filters.length > 0) {
      criteria.filter = filters;
    }

    // Use term for search (Shopware full-text search on the entity)
    if (input.search) {
      criteria.term = input.search;
    }

    this.logger.debug('Listing SEO URLs', { filters: filters.length });

    const response = await this.api.search<Record<string, unknown>>('seo-url', criteria);

    return {
      urls: response.data.map(mapToListItem),
      total: response.total,
    };
  }

  /**
   * Audit SEO URLs for common issues:
   * - Entities without canonical URL
   * - Duplicate SEO paths
   * - Deleted but not cleaned up URLs
   */
  async audit(input: SeoUrlAuditInput): Promise<SeoUrlAuditResult> {
    const filters: SearchFilter[] = [];

    if (input.routeName) {
      filters.push({ type: 'equals', field: 'routeName', value: input.routeName });
    }
    if (input.salesChannelId) {
      filters.push({ type: 'equals', field: 'salesChannelId', value: input.salesChannelId });
    }

    const limit = input.limit ?? 200;

    // Fetch all URLs for analysis
    const criteria: SearchCriteria = {
      sort: [
        { field: 'foreignKey', order: 'ASC' },
        { field: 'isCanonical', order: 'DESC' },
      ],
      limit,
      associations: {
        salesChannel: {},
      },
    };

    if (filters.length > 0) {
      criteria.filter = filters;
    }

    this.logger.info('Starting SEO URL audit', { routeName: input.routeName, limit });

    const response = await this.api.search<Record<string, unknown>>('seo-url', criteria);
    const urls = response.data.map(mapToListItem);
    const issues: SeoUrlAuditIssue[] = [];

    // Check 1: Deleted URLs that should be cleaned up
    const deletedUrls = urls.filter(u => u.isDeleted);
    for (const url of deletedUrls) {
      issues.push({
        type: 'deleted_url',
        severity: 'warning',
        seoUrl: url,
        description: `SEO URL "${url.seoPathInfo}" is marked as deleted but still exists in database`,
      });
    }

    // Check 2: Duplicate SEO paths (same seoPathInfo for same sales channel)
    const pathMap = new Map<string, SeoUrlListItem[]>();
    for (const url of urls) {
      if (url.isDeleted) continue;
      const key = `${url.salesChannelName ?? 'default'}::${url.seoPathInfo}`;
      const existing = pathMap.get(key) ?? [];
      existing.push(url);
      pathMap.set(key, existing);
    }
    for (const [, group] of pathMap) {
      const first = group[0];
      if (group.length > 1 && first) {
        // Only flag if multiple canonicals or unclear canonical
        const canonicals = group.filter(u => u.isCanonical);
        if (canonicals.length > 1) {
          issues.push({
            type: 'duplicate_path',
            severity: 'error',
            seoUrl: first,
            description: `Duplicate canonical SEO path "${first.seoPathInfo}" - ${group.length} URLs share the same path`,
            relatedUrls: group.slice(1),
          });
        }
      }
    }

    // Check 3: Entities without canonical URL
    const entityMap = new Map<string, SeoUrlListItem[]>();
    for (const url of urls) {
      if (url.isDeleted) continue;
      const key = `${url.foreignKey}::${url.salesChannelName ?? 'default'}`;
      const existing = entityMap.get(key) ?? [];
      existing.push(url);
      entityMap.set(key, existing);
    }
    for (const [, group] of entityMap) {
      const first = group[0];
      if (!first) continue;
      const hasCanonical = group.some(u => u.isCanonical);
      if (!hasCanonical) {
        const issue: SeoUrlAuditIssue = {
          type: 'no_canonical',
          severity: 'error',
          seoUrl: first,
          description: `Entity has ${group.length} SEO URL(s) but none is set as canonical`,
        };
        if (group.length > 1) {
          issue.relatedUrls = group.slice(1);
        }
        issues.push(issue);
      }
    }

    // Aggregate issue counts
    const issuesByType: Record<string, number> = {};
    for (const issue of issues) {
      issuesByType[issue.type] = (issuesByType[issue.type] ?? 0) + 1;
    }

    this.logger.info('SEO URL audit complete', {
      totalChecked: urls.length,
      issueCount: issues.length,
    });

    return {
      totalUrlsChecked: urls.length,
      issueCount: issues.length,
      issuesByType,
      issues,
      routeFilter: input.routeName ?? null,
      salesChannelFilter: input.salesChannelId ?? null,
    };
  }

  /**
   * Update a single SEO URL (path, canonical status, deleted flag)
   */
  async update(
    id: string,
    data: Omit<SeoUrlUpdateInput, 'id'>
  ): Promise<SeoUrl> {
    const payload: Record<string, unknown> = {};

    if (data.seoPathInfo !== undefined) {
      payload.seoPathInfo = data.seoPathInfo;
      // Setting seoPathInfo marks it as manually modified
      payload.isModified = true;
    }
    if (data.isCanonical !== undefined) {
      payload.isCanonical = data.isCanonical;
    }
    if (data.isDeleted !== undefined) {
      payload.isDeleted = data.isDeleted;
    }

    if (Object.keys(payload).length === 0) {
      throw new MCPError(
        'No update data provided',
        ErrorCode.INVALID_INPUT,
        false
      );
    }

    this.logger.info('Updating SEO URL', { id, fields: Object.keys(payload) });

    await this.api.request('PATCH', `/api/seo-url/${id}`, payload);

    // Fetch the updated URL
    const criteria: SearchCriteria = {
      filter: [{ type: 'equals', field: 'id', value: id }],
      associations: { salesChannel: {} },
      limit: 1,
    };

    const response = await this.api.search<Record<string, unknown>>('seo-url', criteria);

    const updated = response.data[0];
    if (!updated) {
      throw new MCPError(
        `SEO URL ${id} not found after update`,
        ErrorCode.NOT_FOUND,
        false
      );
    }

    return mapToSeoUrl(updated);
  }

  /**
   * Trigger SEO URL regeneration for a specific route and sales channel.
   *
   * NOTE: Only non-modified URLs (isModified=false) will be regenerated.
   * Manually modified URLs are preserved.
   */
  async generate(input: SeoUrlGenerateInput): Promise<{ success: boolean; message: string }> {
    this.logger.info('Triggering SEO URL generation', {
      routeName: input.routeName,
      salesChannelId: input.salesChannelId,
    });

    try {
      await this.api.request('POST', '/api/_action/seo-url/create-custom-url', {
        routeName: input.routeName,
        salesChannelId: input.salesChannelId,
      });

      return {
        success: true,
        message: `SEO URL regeneration triggered for ${input.routeName} in sales channel ${input.salesChannelId}. Only non-modified URLs will be regenerated.`,
      };
    } catch (error) {
      // Fallback: try the canonical generation endpoint
      this.logger.warn('Custom URL creation failed, trying canonical endpoint', {
        error: String(error),
      });

      try {
        await this.api.request('POST', '/api/_action/seo-url/canonical', {
          routeName: input.routeName,
          salesChannelId: input.salesChannelId,
        });

        return {
          success: true,
          message: `SEO URL canonical regeneration triggered for ${input.routeName}. Only non-modified URLs will be regenerated.`,
        };
      } catch (fallbackError) {
        throw new MCPError(
          `SEO URL generation failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
          ErrorCode.API_ERROR,
          true
        );
      }
    }
  }
}
