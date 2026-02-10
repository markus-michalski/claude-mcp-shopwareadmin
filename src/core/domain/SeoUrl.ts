/**
 * SEO URL domain types
 *
 * Defines the structure of SEO URLs and audit results
 * for the Shopware 6 Admin API.
 */

/**
 * Route names used by Shopware for SEO URLs
 */
export type SeoUrlRouteName =
  | 'frontend.detail.page'
  | 'frontend.navigation.page'
  | 'frontend.landing.page';

/**
 * Entity type derived from route name (for display purposes)
 */
export type SeoUrlEntityType = 'product' | 'category' | 'landing_page';

/**
 * Complete SEO URL entity
 */
export interface SeoUrl {
  id: string;
  salesChannelId: string | null;
  salesChannelName: string | null;
  languageId: string;
  foreignKey: string;
  routeName: string;
  pathInfo: string;
  seoPathInfo: string;
  isCanonical: boolean;
  isModified: boolean;
  isDeleted: boolean;
  entityName: string | null;
  entityIdentifier: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lightweight SEO URL for list views
 */
export interface SeoUrlListItem {
  id: string;
  seoPathInfo: string;
  pathInfo: string;
  routeName: string;
  isCanonical: boolean;
  isModified: boolean;
  isDeleted: boolean;
  salesChannelName: string | null;
  foreignKey: string;
}

/**
 * SEO URL audit issue types
 */
export type SeoUrlIssueType =
  | 'no_canonical'
  | 'duplicate_path'
  | 'deleted_url'
  | 'orphaned_url';

/**
 * Single audit issue
 */
export interface SeoUrlAuditIssue {
  type: SeoUrlIssueType;
  severity: 'error' | 'warning' | 'info';
  seoUrl: SeoUrlListItem;
  description: string;
  /** Additional context (e.g., conflicting URLs for duplicates) */
  relatedUrls?: SeoUrlListItem[];
}

/**
 * SEO URL audit result
 */
export interface SeoUrlAuditResult {
  totalUrlsChecked: number;
  issueCount: number;
  issuesByType: Record<string, number>;
  issues: SeoUrlAuditIssue[];
  routeFilter: string | null;
  salesChannelFilter: string | null;
}
