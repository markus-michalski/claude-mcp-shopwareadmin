/**
 * Content style identifier (dynamic, defined in content-profiles.json)
 */
export type ContentStyle = string;

/**
 * Style profile configuration for content generation
 */
export interface StyleProfile {
  style: ContentStyle;
  tonality: string;
  addressing: 'du' | 'Sie';
  structure: string[];
  targetAudience: string;
  exampleIntro: string;
  includeSnippets: boolean;
}

/**
 * Product context for content generation
 */
export interface ProductContext {
  name: string;
  productNumber: string;
  categoryPath: string;
  manufacturerName: string | null;
  variantCount: number;
  properties: string[];
  existingDescription: string | null;
}

/**
 * Generated content result
 */
export interface GeneratedContent {
  description: string;
  style: ContentStyle;
  wordCount: number;
  generatedAt: string;
}

/**
 * Generated SEO data result
 */
export interface GeneratedSeo {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  style: ContentStyle;
  generatedAt: string;
}

/**
 * Prompt for content generation (returned to Claude for actual generation)
 */
export interface ContentGenerationPrompt {
  style: ContentStyle;
  profile: StyleProfile;
  context: ProductContext;
  wikiUrl: string | null;
  availableSnippets: SnippetInfo[];
  maxLength: number;
  prompt: string;
}

/**
 * Prompt for SEO generation
 */
export interface SeoGenerationPrompt {
  style: ContentStyle;
  profile: StyleProfile;
  productName: string;
  categoryPath: string;
  existingDescription: string | null;
  constraints: {
    maxTitleLength: number;
    maxDescriptionLength: number;
  };
  prompt: string;
}

/**
 * Snippet info for software products
 */
export interface SnippetInfo {
  id: string;
  identifier: string;
  name: string;
}

/**
 * Full snippet entity from mmd_product_snippet plugin
 *
 * Note: This plugin uses Shopware's standard translation system.
 * The entity has no locale/position fields - translations are
 * handled via mmd_product_snippet_translation association.
 */
export interface Snippet {
  id: string;
  identifier: string;
  name: string;
  content: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lightweight snippet for list views
 */
export interface SnippetListItem {
  id: string;
  identifier: string;
  name: string;
  active: boolean;
}

/**
 * Software system types for Wiki.js integration
 */
export type SoftwareSystem = 'oxid7' | 'shopware6' | 'osticket';
