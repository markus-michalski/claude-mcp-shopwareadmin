/**
 * Price structure for products
 */
export interface Price {
  currencyId: string;
  gross: number;
  net: number;
  linked: boolean;
}

/**
 * SEO metadata for products and categories
 */
export interface SeoData {
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string | null;
}

/**
 * Category reference (lightweight, for product associations)
 */
export interface CategoryReference {
  id: string;
  name: string;
  path: string; // e.g., "Software/OXID 7"
}

/**
 * Property value assigned to a product
 */
export interface PropertyValue {
  id: string;
  name: string;
  groupName: string | null;
}

/**
 * Variant option (e.g., Color: Red)
 */
export interface VariantOption {
  id: string;
  name: string;
  groupName: string | null;
}

/**
 * Product media (images, videos, etc.)
 */
export interface ProductMedia {
  id: string;
  url: string | null;
  alt: string | null;
  position: number;
}

/**
 * Product variant (child product)
 */
export interface ProductVariant {
  id: string;
  productNumber: string;
  name: string;
  active: boolean;
  price: Price[];
  stock: number;
  options: VariantOption[];
}

/**
 * Complete product entity
 */
export interface Product {
  id: string;
  productNumber: string;
  name: string;
  description: string | null;
  active: boolean;
  price: Price[];
  stock: number;
  ean: string | null;
  manufacturerId: string | null;
  manufacturerName: string | null;
  categories: CategoryReference[];
  variants: ProductVariant[];
  properties: PropertyValue[];
  media: ProductMedia[];
  seoData: SeoData | null;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lightweight product for list views
 */
export interface ProductListItem {
  id: string;
  productNumber: string;
  name: string;
  active: boolean;
  price: Price[];
  stock: number;
  manufacturerName: string | null;
  categoryPath: string | null;
}

/**
 * Input for creating a new product
 */
export interface CreateProductInput {
  name: string;
  productNumber: string;
  price: number; // Gross price in EUR
  categoryId: string;
  description?: string;
  ean?: string;
  manufacturerId?: string;
  taxId?: string;
  stock?: number;
}

/**
 * Input for updating a product
 */
export interface UpdateProductInput {
  id: string;
  name?: string;
  price?: number;
  description?: string;
  ean?: string;
  stock?: number;
  manufacturerId?: string;
}

/**
 * Product search/filter options
 */
export interface ProductSearchOptions {
  categoryId?: string;
  active?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}
