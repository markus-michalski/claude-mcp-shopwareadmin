/**
 * Tests for ContentService
 *
 * Tests all content generation methods with TDD approach:
 * - detectStyle: Determine style from category breadcrumb
 * - generateContentPrompt: Generate prompt for product description
 * - generateSeoPrompt: Generate prompt for SEO metadata
 * - generateVariantPrompt: Generate prompt for variant descriptions
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/setup.js';
import { BASE_URL } from '../../test/handlers.js';
import {
  MOCK_PRODUCT,
  MOCK_PRODUCT_ID,
  MOCK_PRODUCT_CREATIVE,
  MOCK_PRODUCT_SOFTWARE,
  MOCK_CATEGORY,
  MOCK_CATEGORY_STICKDATEIEN,
  MOCK_CATEGORY_GALLERY,
  MOCK_CATEGORY_GALLERY_ID,
  MOCK_CATEGORY_STICKDATEIEN_ID,
  MOCK_CATEGORY_OXID7,
  MOCK_SNIPPET_LIST_ACTIVE,
  MOCK_SNIPPET_REQUIREMENTS,
  MOCK_SNIPPET_COMPATIBILITY,
  createMockLogger,
} from '../../test/fixtures.js';
import { ContentService } from './ContentService.js';
import { ProductService } from './ProductService.js';
import { CategoryService } from './CategoryService.js';
import { SnippetService } from './SnippetService.js';
import { ShopwareApiClient } from '../../infrastructure/shopware/ShopwareApiClient.js';
import { ShopwareAuthenticator } from '../../infrastructure/shopware/ShopwareAuthenticator.js';
import { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import { WikiJsService } from '../../infrastructure/wikijs/WikiJsService.js';
import type { Logger } from '../../infrastructure/logging/Logger.js';
import type { ContentStyle } from '../domain/Content.js';

describe('ContentService', () => {
  let contentService: ContentService;
  let productService: ProductService;
  let categoryService: CategoryService;
  let snippetService: SnippetService;
  let wikiService: WikiJsService;
  let client: ShopwareApiClient;
  let cache: InMemoryCache;
  const logger = createMockLogger() as unknown as Logger;

  beforeEach(() => {
    const authenticator = new ShopwareAuthenticator(
      BASE_URL,
      'test-client-id',
      'test-client-secret',
      logger
    );
    client = new ShopwareApiClient(BASE_URL, authenticator, logger);
    cache = new InMemoryCache(logger);
    productService = new ProductService(client, cache, logger);
    categoryService = new CategoryService(client, cache, logger);
    snippetService = new SnippetService(client, cache, logger);
    wikiService = new WikiJsService('https://faq.markus-michalski.net', cache, logger);
    contentService = new ContentService(
      productService,
      categoryService,
      snippetService,
      wikiService,
      logger
    );
  });

  // ===========================================================================
  // detectStyle() - Determine style from category breadcrumb
  // ===========================================================================
  describe('detectStyle', () => {
    it('should detect "software" style for Software category', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product`, () => {
          return HttpResponse.json({
            data: [MOCK_PRODUCT_SOFTWARE],
            total: 1,
          });
        }),
        http.post(`${BASE_URL}/api/search/category`, () => {
          return HttpResponse.json({
            data: [MOCK_CATEGORY_GALLERY],
            total: 1,
          });
        })
      );

      const style = await contentService.detectStyle(MOCK_PRODUCT_ID);

      expect(style).toBe('software');
    });

    it('should detect "creative" style for Stickdateien category', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product`, () => {
          return HttpResponse.json({
            data: [MOCK_PRODUCT_CREATIVE],
            total: 1,
          });
        }),
        http.post(`${BASE_URL}/api/search/category`, () => {
          return HttpResponse.json({
            data: [MOCK_CATEGORY_STICKDATEIEN],
            total: 1,
          });
        })
      );

      const style = await contentService.detectStyle('prod-osterhase-uuid');

      expect(style).toBe('creative');
    });

    it('should detect "creative" style for Genaehtes category', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product`, () => {
          return HttpResponse.json({
            data: [{
              ...MOCK_PRODUCT_CREATIVE,
              categories: [{ ...MOCK_CATEGORY_STICKDATEIEN, name: 'Genaehtes', breadcrumb: ['Katalog', 'Genaehtes'] }],
            }],
            total: 1,
          });
        }),
        http.post(`${BASE_URL}/api/search/category`, () => {
          return HttpResponse.json({
            data: [{ ...MOCK_CATEGORY_STICKDATEIEN, name: 'Genaehtes', breadcrumb: ['Katalog', 'Genaehtes'] }],
            total: 1,
          });
        })
      );

      const style = await contentService.detectStyle('test-id');

      expect(style).toBe('creative');
    });

    it('should detect "creative" style for 3D-Druck category', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product`, () => {
          return HttpResponse.json({
            data: [{
              ...MOCK_PRODUCT_CREATIVE,
              categories: [{ ...MOCK_CATEGORY_STICKDATEIEN, name: '3D-Druck', breadcrumb: ['Katalog', '3D-Druck'] }],
            }],
            total: 1,
          });
        }),
        http.post(`${BASE_URL}/api/search/category`, () => {
          return HttpResponse.json({
            data: [{ ...MOCK_CATEGORY_STICKDATEIEN, name: '3D-Druck', breadcrumb: ['Katalog', '3D-Druck'] }],
            total: 1,
          });
        })
      );

      const style = await contentService.detectStyle('test-id');

      expect(style).toBe('creative');
    });

    it('should detect style from nested category (Software/OXID 7/Galerie-Module)', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product`, () => {
          return HttpResponse.json({
            data: [MOCK_PRODUCT_SOFTWARE],
            total: 1,
          });
        }),
        http.post(`${BASE_URL}/api/search/category`, () => {
          return HttpResponse.json({
            data: [MOCK_CATEGORY_GALLERY],
            total: 1,
          });
        })
      );

      const style = await contentService.detectStyle(MOCK_PRODUCT_ID);

      // Should find 'Software' in breadcrumb and return 'software'
      expect(style).toBe('software');
    });

    it('should default to "creative" for unknown categories', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product`, () => {
          return HttpResponse.json({
            data: [{
              ...MOCK_PRODUCT,
              categories: [{ id: 'unknown-cat', name: 'Unknown', breadcrumb: ['Katalog', 'Unknown'] }],
            }],
            total: 1,
          });
        }),
        http.post(`${BASE_URL}/api/search/category`, () => {
          return HttpResponse.json({
            data: [{ id: 'unknown-cat', name: 'Unknown', breadcrumb: ['Katalog', 'Unknown'] }],
            total: 1,
          });
        })
      );

      const style = await contentService.detectStyle('test-id');

      expect(style).toBe('creative');
    });

    it('should throw error for non-existent product', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product`, () => {
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      await expect(contentService.detectStyle('non-existent')).rejects.toThrow();
    });
  });

  // ===========================================================================
  // generateContentPrompt() - Generate prompt for product description
  // ===========================================================================
  describe('generateContentPrompt', () => {
    beforeEach(() => {
      // Setup default mocks
      server.use(
        http.post(`${BASE_URL}/api/search/product`, () => {
          return HttpResponse.json({
            data: [MOCK_PRODUCT_SOFTWARE],
            total: 1,
          });
        }),
        http.post(`${BASE_URL}/api/search/category`, () => {
          return HttpResponse.json({
            data: [MOCK_CATEGORY_GALLERY],
            total: 1,
          });
        }),
        http.post(`${BASE_URL}/api/search/mmd-product-snippet`, () => {
          return HttpResponse.json({
            data: MOCK_SNIPPET_LIST_ACTIVE,
            total: 3,
          });
        })
      );
    });

    it('should return a ContentGenerationPrompt object', async () => {
      const prompt = await contentService.generateContentPrompt({
        productId: MOCK_PRODUCT_ID,
        maxLength: 1000,
      });

      expect(prompt).toMatchObject({
        style: expect.any(String),
        profile: expect.any(Object),
        context: expect.any(Object),
        maxLength: 1000,
        prompt: expect.any(String),
      });
    });

    it('should include product context in prompt', async () => {
      const prompt = await contentService.generateContentPrompt({
        productId: MOCK_PRODUCT_ID,
        maxLength: 1000,
      });

      expect(prompt.context).toMatchObject({
        name: expect.any(String),
        productNumber: expect.any(String),
        categoryPath: expect.any(String),
      });
    });

    it('should include style profile in prompt', async () => {
      const prompt = await contentService.generateContentPrompt({
        productId: MOCK_PRODUCT_ID,
        maxLength: 1000,
      });

      expect(prompt.profile).toMatchObject({
        style: expect.any(String),
        tonality: expect.any(String),
        addressing: expect.any(String),
        structure: expect.any(Array),
        targetAudience: expect.any(String),
      });
    });

    it('should use provided style override', async () => {
      const prompt = await contentService.generateContentPrompt({
        productId: MOCK_PRODUCT_ID,
        style: 'creative',
        maxLength: 1000,
      });

      expect(prompt.style).toBe('creative');
      expect(prompt.profile.style).toBe('creative');
    });

    it('should include snippets for software style', async () => {
      const prompt = await contentService.generateContentPrompt({
        productId: MOCK_PRODUCT_ID,
        maxLength: 1000,
        includeSnippets: true,
      });

      expect(prompt.availableSnippets).toBeDefined();
      expect(prompt.availableSnippets.length).toBeGreaterThan(0);
    });

    it('should filter snippets by provided identifiers', async () => {
      const prompt = await contentService.generateContentPrompt({
        productId: MOCK_PRODUCT_ID,
        maxLength: 1000,
        includeSnippets: true,
        snippetIds: ['requirements'],
      });

      expect(prompt.availableSnippets).toHaveLength(1);
      expect(prompt.availableSnippets[0].identifier).toBe('requirements');
    });

    it('should NOT include snippets for creative style', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product`, () => {
          return HttpResponse.json({
            data: [MOCK_PRODUCT_CREATIVE],
            total: 1,
          });
        }),
        http.post(`${BASE_URL}/api/search/category`, () => {
          return HttpResponse.json({
            data: [MOCK_CATEGORY_STICKDATEIEN],
            total: 1,
          });
        })
      );

      const prompt = await contentService.generateContentPrompt({
        productId: 'prod-osterhase-uuid',
        maxLength: 1000,
        includeSnippets: true,
      });

      // Creative style should not have snippets
      expect(prompt.availableSnippets).toEqual([]);
    });

    it('should include maxLength in prompt', async () => {
      const prompt = await contentService.generateContentPrompt({
        productId: MOCK_PRODUCT_ID,
        maxLength: 2000,
      });

      expect(prompt.maxLength).toBe(2000);
      expect(prompt.prompt).toContain('2000');
    });

    it('should generate human-readable prompt text', async () => {
      const prompt = await contentService.generateContentPrompt({
        productId: MOCK_PRODUCT_ID,
        maxLength: 1000,
      });

      // Prompt should contain product name and style instructions
      expect(prompt.prompt).toContain(MOCK_PRODUCT_SOFTWARE.name);
      expect(prompt.prompt.length).toBeGreaterThan(100);
    });
  });

  // ===========================================================================
  // generateSeoPrompt() - Generate prompt for SEO metadata
  // ===========================================================================
  describe('generateSeoPrompt', () => {
    beforeEach(() => {
      server.use(
        http.post(`${BASE_URL}/api/search/product`, () => {
          return HttpResponse.json({
            data: [MOCK_PRODUCT_SOFTWARE],
            total: 1,
          });
        }),
        http.post(`${BASE_URL}/api/search/category`, () => {
          return HttpResponse.json({
            data: [MOCK_CATEGORY_GALLERY],
            total: 1,
          });
        })
      );
    });

    it('should return a SeoGenerationPrompt object', async () => {
      const prompt = await contentService.generateSeoPrompt({
        productId: MOCK_PRODUCT_ID,
      });

      expect(prompt).toMatchObject({
        style: expect.any(String),
        profile: expect.any(Object),
        productName: expect.any(String),
        categoryPath: expect.any(String),
        constraints: expect.any(Object),
        prompt: expect.any(String),
      });
    });

    it('should include SEO constraints', async () => {
      const prompt = await contentService.generateSeoPrompt({
        productId: MOCK_PRODUCT_ID,
        maxTitleLength: 60,
        maxDescriptionLength: 155,
      });

      expect(prompt.constraints).toMatchObject({
        maxTitleLength: 60,
        maxDescriptionLength: 155,
      });
    });

    it('should use default SEO constraints if not provided', async () => {
      const prompt = await contentService.generateSeoPrompt({
        productId: MOCK_PRODUCT_ID,
      });

      expect(prompt.constraints.maxTitleLength).toBe(60);
      expect(prompt.constraints.maxDescriptionLength).toBe(155);
    });

    it('should include existing description if available', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product`, () => {
          return HttpResponse.json({
            data: [{
              ...MOCK_PRODUCT_SOFTWARE,
              description: '<p>Existing product description</p>',
            }],
            total: 1,
          });
        })
      );

      const prompt = await contentService.generateSeoPrompt({
        productId: MOCK_PRODUCT_ID,
      });

      expect(prompt.existingDescription).toContain('Existing product description');
    });

    it('should generate SEO-focused prompt text', async () => {
      const prompt = await contentService.generateSeoPrompt({
        productId: MOCK_PRODUCT_ID,
      });

      // Prompt should contain SEO-related instructions
      expect(prompt.prompt).toMatch(/meta|seo|title|description/i);
    });
  });

  // ===========================================================================
  // generateVariantPrompt() - Generate prompt for variant descriptions
  // ===========================================================================
  describe('generateVariantPrompt', () => {
    beforeEach(() => {
      server.use(
        http.post(`${BASE_URL}/api/search/product`, () => {
          return HttpResponse.json({
            data: [{
              ...MOCK_PRODUCT_SOFTWARE,
              children: [{
                id: 'variant-1',
                productNumber: 'MM-GALLERY-7-SUPPORT',
                name: 'Mit Support',
                active: false,
                stock: 999,
                price: MOCK_PRODUCT.price,
                options: [
                  { id: 'opt-1', name: 'Ja', group: { id: 'grp-1', name: 'Support' } },
                ],
              }],
            }],
            total: 1,
          });
        }),
        http.post(`${BASE_URL}/api/search/category`, () => {
          return HttpResponse.json({
            data: [MOCK_CATEGORY_GALLERY],
            total: 1,
          });
        })
      );
    });

    it('should return a ContentGenerationPrompt for variant', async () => {
      const prompt = await contentService.generateVariantPrompt({
        variantId: 'variant-1',
        inheritFromParent: true,
      });

      expect(prompt).toMatchObject({
        style: expect.any(String),
        profile: expect.any(Object),
        context: expect.any(Object),
        prompt: expect.any(String),
      });
    });

    it('should include variant options in context', async () => {
      const prompt = await contentService.generateVariantPrompt({
        variantId: 'variant-1',
        inheritFromParent: true,
        focusOnOptions: true,
      });

      // Prompt should mention variant options
      expect(prompt.prompt).toMatch(/support|variante|option/i);
    });

    it('should inherit parent product context', async () => {
      const prompt = await contentService.generateVariantPrompt({
        variantId: 'variant-1',
        inheritFromParent: true,
      });

      // Context should include parent product info
      expect(prompt.context.name).toContain('Gallery');
    });
  });

  // ===========================================================================
  // Integration Tests
  // ===========================================================================
  describe('integration', () => {
    it('should handle complete content generation workflow', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/product`, () => {
          return HttpResponse.json({
            data: [MOCK_PRODUCT_SOFTWARE],
            total: 1,
          });
        }),
        http.post(`${BASE_URL}/api/search/category`, () => {
          return HttpResponse.json({
            data: [MOCK_CATEGORY_GALLERY],
            total: 1,
          });
        }),
        http.post(`${BASE_URL}/api/search/mmd-product-snippet`, () => {
          return HttpResponse.json({
            data: MOCK_SNIPPET_LIST_ACTIVE,
            total: 3,
          });
        })
      );

      // Step 1: Detect style
      const style = await contentService.detectStyle(MOCK_PRODUCT_ID);
      expect(style).toBe('software');

      // Step 2: Generate content prompt
      const contentPrompt = await contentService.generateContentPrompt({
        productId: MOCK_PRODUCT_ID,
        style,
        maxLength: 1500,
        includeSnippets: true,
      });
      expect(contentPrompt.style).toBe('software');
      expect(contentPrompt.availableSnippets.length).toBeGreaterThan(0);

      // Step 3: Generate SEO prompt
      const seoPrompt = await contentService.generateSeoPrompt({
        productId: MOCK_PRODUCT_ID,
        style,
      });
      expect(seoPrompt.style).toBe('software');
    });
  });
});
