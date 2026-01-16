import { z } from 'zod';
import { shopwareId, shopwareIdOptional } from './validators.js';

// =============================================================================
// Product Tool Input Schemas
// =============================================================================

/**
 * product_create - Create a new product (always inactive!)
 */
export const ProductCreateInput = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name too long')
    .describe('Product name'),
  productNumber: z
    .string()
    .min(1, 'Product number is required')
    .max(64, 'Product number too long')
    .describe('Unique product number/SKU'),
  price: z
    .number()
    .positive('Price must be positive')
    .describe('Gross price in EUR'),
  categoryId: shopwareId('Invalid category ID format').describe(
    'Category ID to assign the product to'
  ),
  description: z
    .string()
    .max(65535, 'Description too long')
    .optional()
    .describe('Product description (HTML allowed)'),
  ean: z
    .string()
    .max(50, 'EAN too long')
    .optional()
    .describe('EAN/GTIN barcode'),
  manufacturerId: shopwareIdOptional('Invalid manufacturer ID format').describe(
    'Manufacturer/brand ID'
  ),
  taxId: shopwareIdOptional('Invalid tax ID format').describe(
    'Tax rate ID (defaults to 19% standard rate)'
  ),
  stock: z
    .number()
    .int('Stock must be integer')
    .nonnegative('Stock cannot be negative')
    .default(0)
    .describe('Initial stock quantity'),
  salesChannelId: shopwareIdOptional('Invalid sales channel ID format').describe(
    'Sales channel ID (uses default from config if not provided)'
  ),
  tags: z
    .array(z.string().min(1).max(255))
    .optional()
    .describe('Array of tag names (will be created if not existing)'),
  searchKeywords: z
    .array(z.string().min(1).max(255))
    .optional()
    .describe('Custom search keywords for better findability'),
});
export type ProductCreateInput = z.infer<typeof ProductCreateInput>;

/**
 * product_get - Get product details
 */
export const ProductGetInput = z
  .object({
    id: shopwareIdOptional('Invalid product ID format').describe('Product ID'),
    productNumber: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe('Product number/SKU'),
  })
  .refine(
    (data) => data.id ?? data.productNumber,
    { message: 'Either id or productNumber must be provided' }
  );
export type ProductGetInput = z.infer<typeof ProductGetInput>;

/**
 * product_list - List products with filters
 */
export const ProductListInput = z.object({
  categoryId: shopwareIdOptional('Invalid category ID format').describe(
    'Filter by category'
  ),
  active: z
    .boolean()
    .optional()
    .describe('Filter by active status (true=active, false=inactive)'),
  search: z
    .string()
    .max(255, 'Search term too long')
    .optional()
    .describe('Search in name and product number'),
  limit: z
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(25)
    .describe('Maximum results to return'),
  offset: z
    .number()
    .int()
    .min(0, 'Offset cannot be negative')
    .default(0)
    .describe('Offset for pagination'),
});
export type ProductListInput = z.infer<typeof ProductListInput>;

/**
 * product_set_active - Activate or deactivate a product
 */
export const ProductSetActiveInput = z.object({
  id: shopwareId('Invalid product ID format').describe('Product ID to update'),
  active: z
    .boolean()
    .describe('New active status'),
});
export type ProductSetActiveInput = z.infer<typeof ProductSetActiveInput>;

/**
 * product_update - Update product data
 */
export const ProductUpdateInput = z.object({
  id: shopwareId('Invalid product ID format').describe('Product ID to update'),
  name: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .describe('New product name'),
  price: z
    .number()
    .positive()
    .optional()
    .describe('New gross price in EUR'),
  description: z
    .string()
    .max(65535)
    .optional()
    .describe('New description (HTML allowed)'),
  ean: z
    .string()
    .max(50)
    .optional()
    .describe('New EAN/GTIN'),
  stock: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('New stock quantity'),
  manufacturerId: shopwareIdOptional('Invalid manufacturer ID format').describe(
    'New manufacturer ID'
  ),
  customFields: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Custom fields as key-value object (e.g., {"custom_stickdatei_stickmaß": "12,0 x 14,8 cm"})'),
  // SEO fields
  metaTitle: z
    .string()
    .max(255)
    .optional()
    .describe('SEO meta title'),
  metaDescription: z
    .string()
    .max(255)
    .optional()
    .describe('SEO meta description'),
  keywords: z
    .string()
    .max(255)
    .optional()
    .describe('SEO keywords (comma-separated)'),
  // Search & Tags
  tags: z
    .array(z.string().min(1).max(255))
    .optional()
    .describe('Array of tag names (will be created if not existing)'),
  searchKeywords: z
    .array(z.string().min(1).max(255))
    .optional()
    .describe('Custom search keywords for better findability'),
});
export type ProductUpdateInput = z.infer<typeof ProductUpdateInput>;

/**
 * search_products - Full-text search
 */
export const SearchProductsInput = z.object({
  query: z
    .string()
    .min(2, 'Search query must be at least 2 characters')
    .max(255, 'Search query too long')
    .describe('Search term'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe('Maximum results'),
});
export type SearchProductsInput = z.infer<typeof SearchProductsInput>;
