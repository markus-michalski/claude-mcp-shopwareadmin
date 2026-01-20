/**
 * Re-export all tool input schemas
 */

// Product schemas
export {
  ProductCreateInput,
  ProductGetInput,
  ProductListInput,
  ProductSetActiveInput,
  ProductUpdateInput,
  SearchProductsInput,
} from './schemas/ProductSchemas.js';

// Category schemas
export {
  CategoryListInput,
  CategoryGetInput,
  CategoryGenerateContentInput,
  CategoryUpdateInput,
} from './schemas/CategorySchemas.js';

// Content schemas
export {
  ProductGenerateContentInput,
  ProductGenerateSeoInput,
  VariantGenerateContentInput,
  ContentUpdateInput,
} from './schemas/ContentSchemas.js';

// Helper schemas
export {
  GetPropertiesInput,
  GetManufacturersInput,
  SnippetListInput,
} from './schemas/HelperSchemas.js';

// Mail template schemas
export {
  MailTemplateListInput,
  MailTemplateGetInput,
  MailTemplateUpdateInput,
  MailTemplateSendTestInput,
} from './schemas/MailTemplateSchemas.js';

// Flow schemas
export {
  FlowListInput,
  FlowGetInput,
  FlowToggleInput,
} from './schemas/FlowSchemas.js';

// Re-export types
export type { ProductCreateInput as ProductCreateInputType } from './schemas/ProductSchemas.js';
export type { ProductGetInput as ProductGetInputType } from './schemas/ProductSchemas.js';
export type { ProductListInput as ProductListInputType } from './schemas/ProductSchemas.js';
export type { ProductSetActiveInput as ProductSetActiveInputType } from './schemas/ProductSchemas.js';
export type { ProductUpdateInput as ProductUpdateInputType } from './schemas/ProductSchemas.js';
export type { SearchProductsInput as SearchProductsInputType } from './schemas/ProductSchemas.js';
