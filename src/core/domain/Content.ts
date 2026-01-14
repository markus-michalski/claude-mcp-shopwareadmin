/**
 * Content style types
 */
export type ContentStyle = 'creative' | 'software';

/**
 * Style profile configuration
 */
export interface StyleProfile {
  style: ContentStyle;
  tonality: string;
  addressing: 'du' | 'Sie';
  structure: string[];
  targetAudience: string;
  exampleIntro: string;
}

/**
 * Predefined style profiles for content generation
 */
export const STYLE_PROFILES: Record<ContentStyle, StyleProfile> = {
  creative: {
    style: 'creative',
    tonality: 'Persoenlich, warm, emotional',
    addressing: 'du',
    structure: [
      'Emotionaler Einstieg (Frage/Anekdote)',
      'Was ist es?',
      'Technische Details (Format, Groesse)',
      'Anwendungstipps',
    ],
    targetAudience: 'Hobbybastler, Kreative, DIY-Enthusiasten',
    exampleIntro: 'Was waere denn Ostern ohne den Osterhasen?',
  },
  software: {
    style: 'software',
    tonality: 'Professionell, sachlich, loesungsorientiert',
    addressing: 'Sie',
    structure: [
      'Problem-Statement',
      'Loesungsansatz',
      'Feature-Tabelle',
      'Systemanforderungen',
      'Dokumentations-Links',
    ],
    targetAudience: 'Shop-Betreiber, Entwickler, Agenturen',
    exampleIntro: 'Spam-Schutz ohne Google, ohne Cookies, ohne Bild-Puzzles.',
  },
};

/**
 * Category path to style mapping
 */
export const CATEGORY_STYLE_MAP: Record<string, ContentStyle> = {
  'Software': 'software',
  'Stickdateien': 'creative',
  'Genaehtes': 'creative',
  '3D-Druck': 'creative',
};

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
 * Full snippet entity from mmd-product-snippet plugin
 */
export interface Snippet {
  id: string;
  identifier: string;
  name: string;
  content: string;
  active: boolean;
  locale: string;
  position: number;
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
  locale: string;
}

/**
 * Software system types for Wiki.js integration
 */
export type SoftwareSystem = 'oxid7' | 'shopware6' | 'osticket';
