/**
 * ContentService - Business logic for content generation prompts
 *
 * IMPORTANT: This service does NOT generate content itself!
 * It prepares prompts that Claude then uses for actual generation.
 *
 * Implements content methods:
 * - detectStyle: Determine style from category breadcrumb
 * - generateContentPrompt: Generate prompt for product description
 * - generateSeoPrompt: Generate prompt for SEO metadata
 * - generateVariantPrompt: Generate prompt for variant descriptions
 */
import type { Logger } from '../../infrastructure/logging/Logger.js';
import type { WikiJsService } from '../../infrastructure/wikijs/WikiJsService.js';
import type { ProductService } from './ProductService.js';
import type { CategoryService } from './CategoryService.js';
import type { SnippetService } from './SnippetService.js';
import type { Product } from '../domain/Product.js';
import {
  CATEGORY_STYLE_MAP,
  STYLE_PROFILES,
  type ContentStyle,
  type StyleProfile,
  type ProductContext,
  type ContentGenerationPrompt,
  type SeoGenerationPrompt,
  type SnippetInfo,
} from '../domain/Content.js';
import type {
  ProductGenerateContentInput,
  ProductGenerateSeoInput,
  VariantGenerateContentInput,
} from '../../application/schemas/ContentSchemas.js';
import { MCPError, ErrorCode } from '../domain/Errors.js';

/**
 * Default SEO constraints
 */
const DEFAULT_SEO_CONSTRAINTS = {
  maxTitleLength: 60,
  maxDescriptionLength: 155,
};

export class ContentService {
  constructor(
    private readonly productService: ProductService,
    private readonly categoryService: CategoryService,
    private readonly snippetService: SnippetService,
    private readonly wikiService: WikiJsService,
    private readonly logger: Logger
  ) {}

  // ===========================================================================
  // detectStyle() - Determine style from category breadcrumb
  // ===========================================================================

  /**
   * Detect content style based on product's category path
   *
   * Uses CATEGORY_STYLE_MAP to determine if content should be
   * 'creative' (personal, warm, du) or 'software' (professional, sachlich, Sie)
   *
   * @param productId - Product ID to analyze
   * @returns Detected content style
   */
  async detectStyle(productId: string): Promise<ContentStyle> {
    this.logger.debug('Detecting style for product', { productId });

    // Fetch product with categories
    const product = await this.productService.get({ id: productId });
    if (!product) {
      throw new MCPError(
        `Product not found: ${productId}`,
        ErrorCode.NOT_FOUND,
        false
      );
    }

    // Get first category (primary)
    const primaryCategory = product.categories[0];
    if (!primaryCategory) {
      this.logger.warn('Product has no category, defaulting to creative', { productId });
      return 'creative';
    }

    // Get full breadcrumb from category
    const categoryId = primaryCategory.id;
    const breadcrumb = await this.categoryService.getBreadcrumb(categoryId);

    // Check each breadcrumb segment against style map
    for (const segment of breadcrumb) {
      const mappedStyle = CATEGORY_STYLE_MAP[segment];
      if (mappedStyle) {
        this.logger.info('Style detected from breadcrumb', {
          productId,
          segment,
          style: mappedStyle,
        });
        return mappedStyle;
      }
    }

    // Default to creative if no match
    this.logger.debug('No style match found, defaulting to creative', { productId });
    return 'creative';
  }

  /**
   * Detect content style from a breadcrumb path (synchronous helper)
   *
   * @param breadcrumb - Category breadcrumb array
   * @returns Detected content style
   */
  detectStyleFromBreadcrumb(breadcrumb: string[]): ContentStyle {
    for (const segment of breadcrumb) {
      const mappedStyle = CATEGORY_STYLE_MAP[segment];
      if (mappedStyle) {
        return mappedStyle;
      }
    }
    return 'creative';
  }

  // ===========================================================================
  // generateContentPrompt() - Generate prompt for product description
  // ===========================================================================

  /**
   * Generate a prompt for product description generation
   *
   * This returns all the data Claude needs to generate a product description.
   * The actual generation happens in the MCP tool handler.
   *
   * @param input - Content generation input
   * @returns ContentGenerationPrompt with all context and instructions
   */
  async generateContentPrompt(
    input: ProductGenerateContentInput
  ): Promise<ContentGenerationPrompt> {
    const { productId, maxLength, includeSnippets = true, snippetIds } = input;

    // Fetch product
    const product = await this.productService.get({ id: productId });
    if (!product) {
      throw new MCPError(
        `Product not found: ${productId}`,
        ErrorCode.NOT_FOUND,
        false
      );
    }

    // Determine style (use override or detect)
    const style = input.style ?? (await this.detectStyle(productId));
    const profile = STYLE_PROFILES[style];

    // Build product context
    const context = this.buildProductContext(product);

    // Get available snippets for software style
    let availableSnippets: SnippetInfo[] = [];
    if (style === 'software' && includeSnippets) {
      availableSnippets = await this.fetchSnippetInfo(snippetIds);
    }

    // Generate the prompt text
    const promptText = this.buildContentPromptText(
      product,
      profile,
      context,
      maxLength,
      availableSnippets
    );

    return {
      style,
      profile,
      context,
      wikiUrl: null, // TODO: Implement Wiki.js integration
      availableSnippets,
      maxLength,
      prompt: promptText,
    };
  }

  // ===========================================================================
  // generateSeoPrompt() - Generate prompt for SEO metadata
  // ===========================================================================

  /**
   * Generate a prompt for SEO metadata generation
   *
   * @param input - SEO generation input
   * @returns SeoGenerationPrompt with all context and instructions
   */
  async generateSeoPrompt(
    input: ProductGenerateSeoInput
  ): Promise<SeoGenerationPrompt> {
    const { productId, maxTitleLength, maxDescriptionLength } = input;

    // Fetch product
    const product = await this.productService.get({ id: productId });
    if (!product) {
      throw new MCPError(
        `Product not found: ${productId}`,
        ErrorCode.NOT_FOUND,
        false
      );
    }

    // Determine style (use override or detect)
    const style = input.style ?? (await this.detectStyle(productId));
    const profile = STYLE_PROFILES[style];

    // Build category path
    const categoryPath = product.categories[0]?.path ?? '';

    // Get existing description
    const existingDescription = product.description
      ? this.stripHtml(product.description)
      : null;

    // Build constraints
    const constraints = {
      maxTitleLength: maxTitleLength ?? DEFAULT_SEO_CONSTRAINTS.maxTitleLength,
      maxDescriptionLength:
        maxDescriptionLength ?? DEFAULT_SEO_CONSTRAINTS.maxDescriptionLength,
    };

    // Generate prompt text
    const promptText = this.buildSeoPromptText(
      product,
      profile,
      constraints,
      existingDescription
    );

    return {
      style,
      profile,
      productName: product.name,
      categoryPath,
      existingDescription,
      constraints,
      prompt: promptText,
    };
  }

  // ===========================================================================
  // generateVariantPrompt() - Generate prompt for variant descriptions
  // ===========================================================================

  /**
   * Generate a prompt for variant-specific description
   *
   * @param input - Variant content generation input
   * @returns ContentGenerationPrompt for variant
   */
  async generateVariantPrompt(
    input: VariantGenerateContentInput
  ): Promise<ContentGenerationPrompt> {
    const { variantId, inheritFromParent = true, focusOnOptions = true } = input;

    // Fetch variant product (variants are products in Shopware)
    const variant = await this.productService.get({ id: variantId });
    if (!variant) {
      throw new MCPError(
        `Variant not found: ${variantId}`,
        ErrorCode.NOT_FOUND,
        false
      );
    }

    // If inheriting from parent, we need to fetch parent product
    let parentProduct: Product | null = null;
    if (inheritFromParent && variant.categories.length > 0) {
      // In Shopware, variant's parent can be found through the category
      // For now, use the variant's own data
      parentProduct = variant;
    }

    const product = parentProduct ?? variant;

    // Determine style
    const style = await this.detectStyle(product.id);
    const profile = STYLE_PROFILES[style];

    // Build context including variant info
    const context = this.buildProductContext(product);

    // Build variant-specific prompt
    const promptText = this.buildVariantPromptText(
      variant,
      product,
      profile,
      focusOnOptions
    );

    return {
      style,
      profile,
      context,
      wikiUrl: null,
      availableSnippets: [],
      maxLength: 500, // Variants typically need shorter descriptions
      prompt: promptText,
    };
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Build ProductContext from Product entity
   */
  private buildProductContext(product: Product): ProductContext {
    return {
      name: product.name,
      productNumber: product.productNumber,
      categoryPath:
        product.categories[0]?.path ??
        product.categories[0]?.name ??
        'Uncategorized',
      manufacturerName: product.manufacturerName,
      variantCount: product.variants.length,
      properties: product.properties.map(
        (p) => `${p.groupName ?? 'Property'}: ${p.name}`
      ),
      existingDescription: product.description
        ? this.stripHtml(product.description)
        : null,
    };
  }

  /**
   * Fetch snippet info for available snippets
   *
   * Note: Translations are resolved by Shopware based on API language context.
   */
  private async fetchSnippetInfo(
    identifiers?: string[]
  ): Promise<SnippetInfo[]> {
    if (identifiers && identifiers.length > 0) {
      const snippets = await this.snippetService.getMultiple(identifiers);
      return snippets.map((s) => ({
        id: s.id,
        identifier: s.identifier,
        name: s.name,
      }));
    }

    // Get all active snippets
    const allSnippets = await this.snippetService.list(true);
    return allSnippets.map((s) => ({
      id: s.id,
      identifier: s.identifier,
      name: s.name,
    }));
  }

  /**
   * Build the actual prompt text for content generation
   */
  private buildContentPromptText(
    product: Product,
    profile: StyleProfile,
    context: ProductContext,
    maxLength: number,
    availableSnippets: SnippetInfo[]
  ): string {
    const lines: string[] = [];

    lines.push(`# Produktbeschreibung generieren`);
    lines.push('');
    lines.push(`## Produkt: ${product.name}`);
    lines.push(`- Artikelnummer: ${product.productNumber}`);
    lines.push(`- Kategorie: ${context.categoryPath}`);
    if (context.manufacturerName) {
      lines.push(`- Hersteller: ${context.manufacturerName}`);
    }
    if (context.variantCount > 0) {
      lines.push(`- Varianten: ${context.variantCount}`);
    }
    lines.push('');

    lines.push(`## Stil: ${profile.style === 'creative' ? 'Kreativ' : 'Software'}`);
    lines.push(`- Tonalitaet: ${profile.tonality}`);
    lines.push(`- Ansprache: ${profile.addressing}`);
    lines.push(`- Zielgruppe: ${profile.targetAudience}`);
    lines.push('');

    lines.push(`## Struktur`);
    profile.structure.forEach((s, i) => {
      lines.push(`${i + 1}. ${s}`);
    });
    lines.push('');

    lines.push(`## Vorgaben`);
    lines.push(`- Maximale Laenge: ${maxLength} Zeichen`);
    lines.push(`- Beispiel-Einstieg: "${profile.exampleIntro}"`);
    lines.push('');

    if (availableSnippets.length > 0) {
      lines.push(`## Verfuegbare Snippets (einbinden wenn passend)`);
      availableSnippets.forEach((s) => {
        lines.push(`- ${s.identifier}: ${s.name}`);
      });
      lines.push('');
    }

    if (context.properties.length > 0) {
      lines.push(`## Eigenschaften`);
      context.properties.forEach((p) => {
        lines.push(`- ${p}`);
      });
      lines.push('');
    }

    if (context.existingDescription) {
      lines.push(`## Bestehende Beschreibung (zur Referenz)`);
      lines.push(context.existingDescription.slice(0, 500));
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Build the actual prompt text for SEO generation
   */
  private buildSeoPromptText(
    product: Product,
    profile: StyleProfile,
    constraints: { maxTitleLength: number; maxDescriptionLength: number },
    existingDescription: string | null
  ): string {
    const lines: string[] = [];

    lines.push(`# SEO-Daten generieren`);
    lines.push('');
    lines.push(`## Produkt: ${product.name}`);
    lines.push(`- Artikelnummer: ${product.productNumber}`);
    lines.push(`- Kategorie: ${product.categories[0]?.path ?? 'N/A'}`);
    lines.push('');

    lines.push(`## Stil: ${profile.style === 'creative' ? 'Kreativ' : 'Software'}`);
    lines.push(`- Tonalitaet: ${profile.tonality}`);
    lines.push(`- Zielgruppe: ${profile.targetAudience}`);
    lines.push('');

    lines.push(`## SEO-Vorgaben`);
    lines.push(`- Meta Title: max. ${constraints.maxTitleLength} Zeichen`);
    lines.push(`- Meta Description: max. ${constraints.maxDescriptionLength} Zeichen`);
    lines.push(`- Keywords: 3-5 relevante Suchbegriffe`);
    lines.push('');

    lines.push(`## Anforderungen`);
    lines.push(`- Title: Produktname + wichtigstes Keyword + optional Marke`);
    lines.push(`- Description: USP + Call-to-Action, Nutzen betonen`);
    lines.push(`- Keine Keyword-Stuffing, natuerlich klingende Texte`);
    lines.push('');

    if (existingDescription) {
      lines.push(`## Produktbeschreibung (als Kontext)`);
      lines.push(existingDescription.slice(0, 300));
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Build prompt text for variant description
   */
  private buildVariantPromptText(
    variant: Product,
    parentProduct: Product,
    profile: StyleProfile,
    focusOnOptions: boolean
  ): string {
    const lines: string[] = [];

    lines.push(`# Varianten-Beschreibung generieren`);
    lines.push('');
    lines.push(`## Hauptprodukt: ${parentProduct.name}`);
    lines.push(`## Variante: ${variant.name}`);
    lines.push(`- Artikelnummer: ${variant.productNumber}`);
    lines.push('');

    if (focusOnOptions && variant.variants.length > 0) {
      lines.push(`## Varianten-Optionen`);
      variant.variants[0]?.options.forEach((opt) => {
        lines.push(`- ${opt.groupName ?? 'Option'}: ${opt.name}`);
      });
      lines.push('');
    }

    lines.push(`## Stil: ${profile.style === 'creative' ? 'Kreativ' : 'Software'}`);
    lines.push(`- Tonalitaet: ${profile.tonality}`);
    lines.push('');

    lines.push(`## Anforderungen`);
    lines.push(`- Kurze Beschreibung (max. 500 Zeichen)`);
    lines.push(`- Fokus auf Unterschiede zur Basisvariante`);
    if (focusOnOptions) {
      lines.push(`- Varianten-Optionen hervorheben`);
    }
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Strip HTML tags from string
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }
}
