/**
 * Cross-Selling domain types
 *
 * Defines the structure of cross-selling entities for the
 * Shopware 6 Admin API. Supports both manual product lists
 * and dynamic product streams.
 */

/**
 * Cross-selling type
 */
export type CrossSellingType = 'productList' | 'productStream';

/**
 * Sort options for cross-selling
 */
export type CrossSellingSortBy = 'name' | 'cheapestPrice' | 'releaseDate' | 'productNumber';

/**
 * Assigned product in a cross-selling group
 */
export interface CrossSellingProduct {
  productId: string;
  productNumber: string;
  productName: string;
  active: boolean;
  position: number;
}

/**
 * Complete cross-selling entity
 */
export interface CrossSelling {
  id: string;
  productId: string;
  name: string;
  type: CrossSellingType;
  active: boolean;
  position: number;
  sortBy: string | null;
  sortDirection: string | null;
  limit: number;
  productStreamId: string | null;
  productStreamName: string | null;
  assignedProducts: CrossSellingProduct[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Lightweight cross-selling for list views
 */
export interface CrossSellingListItem {
  id: string;
  name: string;
  type: CrossSellingType;
  active: boolean;
  position: number;
  assignedProductCount: number;
}

/**
 * Cross-selling suggestion context (for AI-based recommendations)
 */
export interface CrossSellingSuggestionContext {
  sourceProduct: {
    id: string;
    name: string;
    productNumber: string;
    categoryPath: string | null;
    price: number | null;
    properties: string[];
  };
  candidates: Array<{
    id: string;
    name: string;
    productNumber: string;
    price: number | null;
    categoryPath: string | null;
  }>;
  existingCrossSellings: string[];
}
