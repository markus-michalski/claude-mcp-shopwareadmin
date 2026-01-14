import type { SeoData } from './Product.js';

/**
 * Complete category entity
 */
export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  path: string; // Internal path like "|root|software|oxid7|"
  breadcrumb: string[]; // Human-readable: ["Software", "OXID 7"]
  active: boolean;
  visible: boolean;
  productCount: number;
  description: string | null;
  seoData: SeoData | null;
  children: Category[];
}

/**
 * Lightweight category for tree views
 */
export interface CategoryTreeItem {
  id: string;
  name: string;
  parentId: string | null;
  breadcrumb: string[];
  active: boolean;
  productCount: number;
  children: CategoryTreeItem[];
}

/**
 * Category tree with flat list for efficient lookup
 */
export interface CategoryTree {
  root: CategoryTreeItem;
  flatList: CategoryTreeItem[];
}

/**
 * Options for listing categories
 */
export interface CategoryListOptions {
  parentId?: string;
  depth?: number;
  includeInactive?: boolean;
}

/**
 * Options for getting a single category
 */
export interface CategoryGetOptions {
  includeProducts?: boolean;
  productLimit?: number;
}
