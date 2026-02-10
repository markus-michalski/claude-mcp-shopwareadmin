#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { loadConfig, validateConfig } from './config/Configuration.js';
import { Logger } from './infrastructure/logging/Logger.js';
import { InMemoryCache } from './infrastructure/cache/InMemoryCache.js';
import { ShopwareAuthenticator } from './infrastructure/shopware/ShopwareAuthenticator.js';
import { ShopwareApiClient } from './infrastructure/shopware/ShopwareApiClient.js';
import { WikiJsService } from './infrastructure/wikijs/WikiJsService.js';
import { MCPError } from './core/domain/Errors.js';

// Import services
import { ProductService } from './core/services/ProductService.js';
import { CategoryService } from './core/services/CategoryService.js';
import { ContentService } from './core/services/ContentService.js';
import { SnippetService } from './core/services/SnippetService.js';
import { ManufacturerService } from './core/services/ManufacturerService.js';
import { PropertyService } from './core/services/PropertyService.js';
import { MailTemplateService } from './core/services/MailTemplateService.js';
import { FlowService } from './core/services/FlowService.js';
import { MediaService } from './core/services/MediaService.js';
import { OrderService } from './core/services/OrderService.js';
import { CrossSellingService } from './core/services/CrossSellingService.js';
import { SeoUrlService } from './core/services/SeoUrlService.js';

// Import schemas
import {
  ProductCreateInput,
  ProductGetInput,
  ProductListInput,
  ProductSetActiveInput,
  ProductUpdateInput,
  SearchProductsInput,
  CategoryListInput,
  CategoryGetInput,
  CategoryGenerateContentInput,
  CategoryUpdateInput,
  ProductGenerateContentInput,
  ProductGenerateSeoInput,
  VariantGenerateContentInput,
  ContentUpdateInput,
  GetPropertiesInput,
  GetManufacturersInput,
  SnippetListInput,
  MailTemplateListInput,
  MailTemplateGetInput,
  MailTemplateUpdateInput,
  MailTemplateSendTestInput,
  FlowListInput,
  FlowGetInput,
  FlowToggleInput,
  MediaListInput,
  MediaGetInput,
  MediaUpdateInput,
  MediaSearchInput,
  MediaAuditAltInput,
  MediaUploadUrlInput,
  OrderListInput,
  OrderGetInput,
  OrderStatsInput,
  CrossSellingListInput,
  CrossSellingGetInput,
  CrossSellingCreateInput,
  CrossSellingUpdateInput,
  CrossSellingSuggestInput,
  SeoUrlListInput,
  SeoUrlAuditInput,
  SeoUrlUpdateInput,
  SeoUrlGenerateInput,
} from './application/schemas.js';

// Load configuration
const config = loadConfig();
validateConfig(config);

// Initialize infrastructure
const logger = new Logger(config.logLevel);
const cache = new InMemoryCache(logger);

// Initialize Shopware API client
const authenticator = new ShopwareAuthenticator(
  config.shopware.url,
  config.shopware.clientId,
  config.shopware.clientSecret,
  logger
);
const shopwareApi = new ShopwareApiClient(config.shopware.url, authenticator, logger);

// Initialize Wiki.js service
const wikiService = new WikiJsService(config.wikijs.baseUrl, cache, logger);

// Initialize business services
const productService = new ProductService(shopwareApi, cache, logger, {
  defaultTaxId: config.shopware.defaultTaxId,
  defaultTaxRate: config.shopware.defaultTaxRate,
  defaultCurrencyId: config.shopware.defaultCurrencyId,
  defaultSalesChannelId: config.shopware.defaultSalesChannelId,
});
const categoryService = new CategoryService(shopwareApi, cache, logger);
const snippetService = new SnippetService(shopwareApi, cache, logger);
const manufacturerService = new ManufacturerService(shopwareApi, cache, logger);
const propertyService = new PropertyService(shopwareApi, cache, logger);
const contentService = new ContentService(
  productService,
  categoryService,
  snippetService,
  wikiService,
  logger
);
const mailTemplateService = new MailTemplateService(
  shopwareApi,
  cache,
  logger,
  config.shopware.defaultSalesChannelId
);
const flowService = new FlowService(shopwareApi, cache, logger);
const mediaService = new MediaService(shopwareApi, cache, logger);
const orderService = new OrderService(shopwareApi, cache, logger);
const crossSellingService = new CrossSellingService(shopwareApi, cache, logger);
const seoUrlService = new SeoUrlService(shopwareApi, cache, logger);

// Create MCP server
const server = new Server(
  {
    name: 'claude-mcp-shopwareadmin',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // === PRODUCT TOOLS ===
    {
      name: 'product_create',
      description: 'Create a new product (ALWAYS created as inactive for safety). Returns the created product with ID.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255, description: 'Product name' },
          productNumber: { type: 'string', minLength: 1, maxLength: 64, description: 'Unique product number/SKU' },
          price: { type: 'number', exclusiveMinimum: 0, description: 'Gross price in EUR' },
          categoryId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Category ID (32-char hex)' },
          description: { type: 'string', maxLength: 65535, description: 'Product description (HTML)' },
          ean: { type: 'string', maxLength: 50, description: 'EAN/GTIN barcode' },
          manufacturerId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Manufacturer ID (32-char hex)' },
          taxId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Tax rate ID (32-char hex, defaults to configured rate)' },
          stock: { type: 'integer', minimum: 0, default: 0, description: 'Initial stock' },
          salesChannelId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Sales channel ID (uses default from config if not provided)' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Array of tag names (created if not existing)' },
          searchKeywords: { type: 'array', items: { type: 'string' }, description: 'Custom search keywords for better findability' },
        },
        required: ['name', 'productNumber', 'price', 'categoryId'],
      },
    },
    {
      name: 'product_get',
      description: 'Get product details including variants, media, properties. Identify by ID or product number.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Product ID (32-char hex)' },
          productNumber: { type: 'string', description: 'Product number/SKU' },
        },
      },
    },
    {
      name: 'product_list',
      description: 'List products with optional filters for category, status, and search',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Filter by category (32-char hex)' },
          active: { type: 'boolean', description: 'Filter by active status' },
          search: { type: 'string', maxLength: 255, description: 'Search in name/number' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 25, description: 'Max results' },
          offset: { type: 'integer', minimum: 0, default: 0, description: 'Pagination offset' },
        },
      },
    },
    {
      name: 'product_set_active',
      description: 'Activate or deactivate a product (controls visibility in shop)',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Product ID (32-char hex)' },
          active: { type: 'boolean', description: 'New active status' },
        },
        required: ['id', 'active'],
      },
    },
    {
      name: 'product_update',
      description: 'Update product data (name, price, description, stock, SEO, search keywords, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Product ID (32-char hex)' },
          name: { type: 'string', minLength: 1, maxLength: 255, description: 'New name' },
          price: { type: 'number', exclusiveMinimum: 0, description: 'New price' },
          description: { type: 'string', maxLength: 65535, description: 'New description (HTML allowed)' },
          ean: { type: 'string', maxLength: 50, description: 'New EAN/GTIN' },
          stock: { type: 'integer', minimum: 0, description: 'New stock quantity' },
          manufacturerId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'New manufacturer (32-char hex)' },
          customFields: { type: 'object', additionalProperties: true, description: 'Custom fields as key-value object' },
          metaTitle: { type: 'string', maxLength: 255, description: 'SEO meta title' },
          metaDescription: { type: 'string', maxLength: 255, description: 'SEO meta description' },
          keywords: { type: 'string', maxLength: 255, description: 'SEO keywords (comma-separated)' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Array of tag names (created if not existing)' },
          searchKeywords: { type: 'array', items: { type: 'string' }, description: 'Custom search keywords for better findability' },
        },
        required: ['id'],
      },
    },
    {
      name: 'search_products',
      description: 'Full-text search across all products',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 2, maxLength: 255, description: 'Search term' },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20, description: 'Max results' },
        },
        required: ['query'],
      },
    },

    // === CONTENT GENERATION TOOLS ===
    {
      name: 'product_generate_content',
      description: 'Generate a content prompt for product description with automatic style detection (creative vs software)',
      inputSchema: {
        type: 'object',
        properties: {
          productId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Product ID (32-char hex)' },
          style: { type: 'string', enum: ['creative', 'software'], description: 'Force specific style' },
          maxLength: { type: 'integer', minimum: 200, maximum: 5000, default: 1000, description: 'Max chars' },
          includeSnippets: { type: 'boolean', default: true, description: 'Include snippets (software only)' },
          snippetIds: { type: 'array', items: { type: 'string' }, description: 'Specific snippets to include' },
        },
        required: ['productId'],
      },
    },
    {
      name: 'product_generate_seo',
      description: 'Generate SEO metadata (meta title, description, keywords) for a product',
      inputSchema: {
        type: 'object',
        properties: {
          productId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Product ID (32-char hex)' },
          style: { type: 'string', enum: ['creative', 'software'], description: 'Force specific style' },
          maxTitleLength: { type: 'integer', minimum: 30, maximum: 70, default: 60, description: 'Max title length' },
          maxDescriptionLength: { type: 'integer', minimum: 100, maximum: 160, default: 155, description: 'Max description length' },
        },
        required: ['productId'],
      },
    },
    {
      name: 'variant_generate_content',
      description: 'Generate variant-specific description (inherits parent context)',
      inputSchema: {
        type: 'object',
        properties: {
          variantId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Variant product ID (32-char hex)' },
          inheritFromParent: { type: 'boolean', default: true, description: 'Inherit parent context' },
          focusOnOptions: { type: 'boolean', default: true, description: 'Emphasize variant options' },
        },
        required: ['variantId'],
      },
    },
    {
      name: 'content_update',
      description: 'Save generated content (description, SEO) to a product',
      inputSchema: {
        type: 'object',
        properties: {
          productId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Product ID (32-char hex)' },
          description: { type: 'string', maxLength: 65535, description: 'New description (HTML)' },
          metaTitle: { type: 'string', maxLength: 255, description: 'SEO title' },
          metaDescription: { type: 'string', maxLength: 255, description: 'SEO description' },
          keywords: { type: 'string', maxLength: 255, description: 'Keywords (comma-separated)' },
        },
        required: ['productId'],
      },
    },

    // === CATEGORY TOOLS ===
    {
      name: 'category_list',
      description: 'Get category tree structure',
      inputSchema: {
        type: 'object',
        properties: {
          parentId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Only children of this category (32-char hex)' },
          depth: { type: 'integer', minimum: 1, maximum: 10, default: 3, description: 'Tree depth' },
          includeInactive: { type: 'boolean', default: false, description: 'Include inactive categories' },
        },
      },
    },
    {
      name: 'category_get',
      description: 'Get category details with optional product list',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Category ID (32-char hex)' },
          includeProducts: { type: 'boolean', default: false, description: 'Include products' },
          productLimit: { type: 'integer', minimum: 1, maximum: 100, default: 25, description: 'Max products' },
        },
        required: ['id'],
      },
    },
    {
      name: 'category_generate_content',
      description: 'Generate SEO text prompt for a category',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Category ID (32-char hex)' },
          style: { type: 'string', enum: ['creative', 'software'], description: 'Force specific style' },
          maxLength: { type: 'integer', minimum: 100, maximum: 2000, default: 500, description: 'Max chars' },
        },
        required: ['id'],
      },
    },
    {
      name: 'category_update',
      description: 'Update category SEO data (meta title, description, keywords) and description',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Category ID (32-char hex)' },
          description: { type: 'string', maxLength: 65535, description: 'Category description (HTML)' },
          metaTitle: { type: 'string', maxLength: 255, description: 'SEO title' },
          metaDescription: { type: 'string', maxLength: 255, description: 'SEO description' },
          keywords: { type: 'string', maxLength: 255, description: 'SEO keywords (comma-separated)' },
        },
        required: ['id'],
      },
    },

    // === HELPER TOOLS ===
    {
      name: 'get_properties',
      description: 'Get available properties and options (for filtering/assigning)',
      inputSchema: {
        type: 'object',
        properties: {
          groupId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Filter by property group (32-char hex)' },
        },
      },
    },
    {
      name: 'get_manufacturers',
      description: 'List manufacturers/brands',
      inputSchema: {
        type: 'object',
        properties: {
          search: { type: 'string', maxLength: 100, description: 'Search manufacturer names' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50, description: 'Max results' },
        },
      },
    },
    {
      name: 'snippet_list',
      description: 'List available product snippets for software descriptions. Language is determined by Shopware API context.',
      inputSchema: {
        type: 'object',
        properties: {
          activeOnly: { type: 'boolean', default: true, description: 'Only active snippets' },
        },
      },
    },

    // === MAIL TEMPLATE TOOLS ===
    {
      name: 'mail_template_list',
      description: 'List all mail templates with their types (Order Confirmation, Customer Registration, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          search: { type: 'string', maxLength: 255, description: 'Search in template type name or subject' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50, description: 'Maximum results' },
          offset: { type: 'integer', minimum: 0, default: 0, description: 'Pagination offset' },
        },
      },
    },
    {
      name: 'mail_template_get',
      description: 'Get mail template details including subject, HTML/plain content, and available Twig variables. Identify by ID or technical name.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Mail template ID (32-char hex)' },
          technicalName: { type: 'string', description: 'Technical name (e.g., "order_confirmation_mail", "customer_register")' },
        },
      },
    },
    {
      name: 'mail_template_update',
      description: 'Update mail template content (subject, HTML body, plain text body). Supports Twig template syntax.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Mail template ID (32-char hex)' },
          subject: { type: 'string', minLength: 1, maxLength: 998, description: 'New subject line (supports Twig: {{ order.orderNumber }})' },
          contentHtml: { type: 'string', description: 'New HTML body (supports Twig templates)' },
          contentPlain: { type: 'string', description: 'New plain text body (supports Twig templates)' },
          senderName: { type: 'string', maxLength: 255, description: 'Sender display name' },
          description: { type: 'string', maxLength: 65535, description: 'Admin description/notes' },
        },
        required: ['id'],
      },
    },
    {
      name: 'mail_template_send_test',
      description: 'Send a test email to verify template rendering. Uses mock data for Twig variables.',
      inputSchema: {
        type: 'object',
        properties: {
          mailTemplateId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Mail template ID to test' },
          recipient: { type: 'string', format: 'email', description: 'Recipient email address' },
          salesChannelId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Sales channel context (uses default if not provided)' },
        },
        required: ['mailTemplateId', 'recipient'],
      },
    },

    // === FLOW BUILDER TOOLS ===
    {
      name: 'flow_list',
      description: 'List all Flow Builder flows with optional filters. Shows which flows send emails.',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter by active status' },
          eventName: { type: 'string', maxLength: 255, description: 'Filter by event (e.g., "checkout.order.placed")' },
          search: { type: 'string', maxLength: 255, description: 'Search in flow name or description' },
          hasMailAction: { type: 'boolean', description: 'Filter to only flows that send emails' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50, description: 'Max results' },
          offset: { type: 'integer', minimum: 0, default: 0, description: 'Pagination offset' },
        },
      },
    },
    {
      name: 'flow_get',
      description: 'Get flow details including all sequences (actions and conditions). Identify by ID or name.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Flow ID (32-char hex)' },
          name: { type: 'string', description: 'Flow name (exact match)' },
        },
      },
    },
    {
      name: 'flow_toggle',
      description: 'Activate or deactivate a flow (controls whether the flow executes on events)',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Flow ID (32-char hex)' },
          active: { type: 'boolean', description: 'New active status' },
        },
        required: ['id', 'active'],
      },
    },

    // === MEDIA TOOLS ===
    {
      name: 'media_list',
      description: 'List media with optional filters. Use hasAlt=false to find images missing alt text (BFSG compliance).',
      inputSchema: {
        type: 'object',
        properties: {
          mediaFolderId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Filter by media folder (32-char hex)' },
          mimeTypePrefix: { type: 'string', maxLength: 50, description: 'Filter by MIME type prefix (e.g., "image/", "video/")' },
          hasAlt: { type: 'boolean', description: 'Filter by ALT text presence (true=has alt, false=missing alt). Critical for BFSG audit.' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 25, description: 'Max results' },
          offset: { type: 'integer', minimum: 0, default: 0, description: 'Pagination offset' },
        },
      },
    },
    {
      name: 'media_get',
      description: 'Get media details including thumbnails, folder info, and which products use this media.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Media ID (32-char hex)' },
        },
        required: ['id'],
      },
    },
    {
      name: 'media_update',
      description: 'Update media metadata (alt text, title). Critical for BFSG accessibility compliance.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Media ID (32-char hex)' },
          alt: { type: 'string', maxLength: 255, description: 'New alt text (BFSG compliance)' },
          title: { type: 'string', maxLength: 255, description: 'New title' },
        },
        required: ['id'],
      },
    },
    {
      name: 'media_search',
      description: 'Full-text search across media (searches fileName, alt, title)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 2, maxLength: 255, description: 'Search term' },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20, description: 'Max results' },
        },
        required: ['query'],
      },
    },
    {
      name: 'media_audit_alt',
      description: 'BFSG Compliance Audit: Find all product images missing alt text. Returns affected products grouped by media. Essential for German Accessibility Act compliance.',
      inputSchema: {
        type: 'object',
        properties: {
          onlyActive: { type: 'boolean', default: true, description: 'Only check media on active products (default: true)' },
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 100, description: 'Max media items to return' },
        },
      },
    },
    {
      name: 'media_upload_url',
      description: 'Upload media from URL. Shopware downloads the file. Two-step: creates media entity, then triggers URL download.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri', description: 'URL of the file to upload' },
          alt: { type: 'string', maxLength: 255, description: 'Alt text (recommended for BFSG)' },
          title: { type: 'string', maxLength: 255, description: 'Title' },
          mediaFolderId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Target folder ID (32-char hex)' },
        },
        required: ['url'],
      },
    },

    // === ORDER TOOLS (read-only) ===
    {
      name: 'order_list',
      description: 'List orders with optional filters for status, payment, delivery, customer, and date range. Sorted by date (newest first).',
      inputSchema: {
        type: 'object',
        properties: {
          orderStatus: { type: 'string', enum: ['open', 'in_progress', 'completed', 'cancelled'], description: 'Filter by order status' },
          paymentStatus: { type: 'string', enum: ['open', 'authorized', 'paid', 'paid_partially', 'refunded', 'refunded_partially', 'failed', 'cancelled', 'unconfirmed', 'reminded', 'chargeback'], description: 'Filter by payment status' },
          deliveryStatus: { type: 'string', enum: ['open', 'shipped', 'shipped_partially', 'returned', 'returned_partially', 'cancelled'], description: 'Filter by delivery status' },
          customerEmail: { type: 'string', maxLength: 254, description: 'Filter by customer email (partial match)' },
          dateFrom: { type: 'string', description: 'Filter orders from this date (ISO 8601, e.g., "2025-01-01")' },
          dateTo: { type: 'string', description: 'Filter orders until this date (ISO 8601, e.g., "2025-12-31")' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 25, description: 'Max results' },
          offset: { type: 'integer', minimum: 0, default: 0, description: 'Pagination offset' },
        },
      },
    },
    {
      name: 'order_get',
      description: 'Get full order details including line items, transactions, deliveries, and addresses. Identify by ID or order number.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Order ID (32-char hex)' },
          orderNumber: { type: 'string', description: 'Order number (e.g., "10001")' },
        },
      },
    },
    {
      name: 'order_stats',
      description: 'Get aggregated order statistics: total orders, revenue, average order value, and breakdowns by status. Optional date range filter.',
      inputSchema: {
        type: 'object',
        properties: {
          dateFrom: { type: 'string', description: 'Start date (ISO 8601, e.g., "2025-01-01")' },
          dateTo: { type: 'string', description: 'End date (ISO 8601, e.g., "2025-12-31")' },
        },
      },
    },

    // === CROSS-SELLING TOOLS ===
    {
      name: 'cross_selling_list',
      description: 'List all cross-selling groups for a product (accessories, similar products, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          productId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Product ID (32-char hex)' },
        },
        required: ['productId'],
      },
    },
    {
      name: 'cross_selling_get',
      description: 'Get cross-selling details including all assigned products',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Cross-selling ID (32-char hex)' },
        },
        required: ['id'],
      },
    },
    {
      name: 'cross_selling_create',
      description: 'Create a new cross-selling group for a product. Supports manual product lists and dynamic product streams.',
      inputSchema: {
        type: 'object',
        properties: {
          productId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Source product ID (32-char hex)' },
          name: { type: 'string', minLength: 1, maxLength: 255, description: 'Group name (e.g., "Accessories", "Similar Products")' },
          type: { type: 'string', enum: ['productList', 'productStream'], default: 'productList', description: 'Type: manual list or dynamic stream' },
          active: { type: 'boolean', default: true, description: 'Active status' },
          position: { type: 'integer', minimum: 0, default: 1, description: 'Display position' },
          sortBy: { type: 'string', enum: ['name', 'cheapestPrice', 'releaseDate', 'productNumber'], description: 'Sort field' },
          sortDirection: { type: 'string', enum: ['ASC', 'DESC'], description: 'Sort direction' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 24, description: 'Max products to display' },
          assignedProductIds: { type: 'array', items: { type: 'string' }, description: 'Product IDs to assign (for productList type)' },
          productStreamId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Product stream ID (for productStream type)' },
        },
        required: ['productId', 'name'],
      },
    },
    {
      name: 'cross_selling_update',
      description: 'Update a cross-selling group (name, assigned products, position, sorting, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Cross-selling ID (32-char hex)' },
          name: { type: 'string', maxLength: 255, description: 'New name' },
          active: { type: 'boolean', description: 'New active status' },
          position: { type: 'integer', minimum: 0, description: 'New position' },
          sortBy: { type: 'string', enum: ['name', 'cheapestPrice', 'releaseDate', 'productNumber'], description: 'New sort field' },
          sortDirection: { type: 'string', enum: ['ASC', 'DESC'], description: 'New sort direction' },
          limit: { type: 'integer', minimum: 1, maximum: 100, description: 'New limit' },
          assignedProductIds: { type: 'array', items: { type: 'string' }, description: 'Replace all assigned products' },
        },
        required: ['id'],
      },
    },
    {
      name: 'cross_selling_suggest',
      description: 'Get AI suggestion context for cross-selling. Returns the source product, category neighbors, and existing cross-sellings so Claude can recommend optimal product combinations.',
      inputSchema: {
        type: 'object',
        properties: {
          productId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Product ID to get suggestions for (32-char hex)' },
          limit: { type: 'integer', minimum: 5, maximum: 50, default: 20, description: 'Max candidate products' },
        },
        required: ['productId'],
      },
    },

    // === SEO URL TOOLS ===
    {
      name: 'seo_url_list',
      description: 'List SEO URLs with optional filters for route type, sales channel, canonical status, and search. Useful for inspecting URL structure.',
      inputSchema: {
        type: 'object',
        properties: {
          routeName: { type: 'string', enum: ['frontend.detail.page', 'frontend.navigation.page', 'frontend.landing.page'], description: 'Filter by route (product, category, landing page)' },
          salesChannelId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Filter by sales channel (32-char hex)' },
          foreignKey: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Filter by entity ID (product/category ID)' },
          isCanonical: { type: 'boolean', description: 'Filter by canonical status' },
          isDeleted: { type: 'boolean', description: 'Filter by deleted status' },
          search: { type: 'string', minLength: 2, maxLength: 255, description: 'Search in SEO path' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 25, description: 'Max results' },
          offset: { type: 'integer', minimum: 0, default: 0, description: 'Pagination offset' },
        },
      },
    },
    {
      name: 'seo_url_audit',
      description: 'Audit SEO URLs for issues: missing canonicals, duplicate paths, deleted URLs. Returns categorized issues with severity levels.',
      inputSchema: {
        type: 'object',
        properties: {
          routeName: { type: 'string', enum: ['frontend.detail.page', 'frontend.navigation.page', 'frontend.landing.page'], description: 'Audit only specific route type' },
          salesChannelId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Audit only specific sales channel' },
          limit: { type: 'integer', minimum: 10, maximum: 500, default: 200, description: 'Max URLs to check' },
        },
      },
    },
    {
      name: 'seo_url_update',
      description: 'Update a SEO URL (change path, set canonical, mark as deleted). Setting seoPathInfo automatically marks the URL as manually modified (isModified=true).',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'SEO URL ID (32-char hex)' },
          seoPathInfo: { type: 'string', minLength: 1, maxLength: 2048, description: 'New SEO path (e.g., "my-product-name")' },
          isCanonical: { type: 'boolean', description: 'Set as canonical URL' },
          isDeleted: { type: 'boolean', description: 'Mark as deleted' },
        },
        required: ['id'],
      },
    },
    {
      name: 'seo_url_generate',
      description: 'Trigger SEO URL regeneration for a route type and sales channel. Only non-modified URLs (isModified=false) will be regenerated.',
      inputSchema: {
        type: 'object',
        properties: {
          routeName: { type: 'string', enum: ['frontend.detail.page', 'frontend.navigation.page', 'frontend.landing.page'], description: 'Route to regenerate SEO URLs for' },
          salesChannelId: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Sales channel to regenerate for (32-char hex)' },
        },
        required: ['routeName', 'salesChannelId'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // === PRODUCT TOOLS ===
      case 'product_create': {
        const input = ProductCreateInput.parse(args);
        const product = await productService.create(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Product created (inactive)',
              product: {
                id: product.id,
                productNumber: product.productNumber,
                name: product.name,
                active: product.active,
              },
            }, null, 2),
          }],
        };
      }

      case 'product_get': {
        const input = ProductGetInput.parse(args);
        const product = await productService.get(input);
        if (!product) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: true, message: 'Product not found' }, null, 2) }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(product, null, 2) }],
        };
      }

      case 'product_list': {
        const input = ProductListInput.parse(args);
        const result = await productService.list(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'product_set_active': {
        const input = ProductSetActiveInput.parse(args);
        await productService.setActive(input.id, input.active);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Product ${input.active ? 'activated' : 'deactivated'}`,
              productId: input.id,
              active: input.active,
            }, null, 2),
          }],
        };
      }

      case 'product_update': {
        const input = ProductUpdateInput.parse(args);
        const { id, ...updateData } = input;
        const product = await productService.update(id, updateData);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Product updated',
              product: {
                id: product.id,
                productNumber: product.productNumber,
                name: product.name,
              },
            }, null, 2),
          }],
        };
      }

      case 'search_products': {
        const input = SearchProductsInput.parse(args);
        const products = await productService.search(input.query, input.limit ?? 20);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query: input.query,
              count: products.length,
              products: products.map(p => ({
                id: p.id,
                productNumber: p.productNumber,
                name: p.name,
                active: p.active,
              })),
            }, null, 2),
          }],
        };
      }

      // === CONTENT GENERATION TOOLS ===
      case 'product_generate_content': {
        const input = ProductGenerateContentInput.parse(args);
        const prompt = await contentService.generateContentPrompt(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(prompt, null, 2) }],
        };
      }

      case 'product_generate_seo': {
        const input = ProductGenerateSeoInput.parse(args);
        const prompt = await contentService.generateSeoPrompt(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(prompt, null, 2) }],
        };
      }

      case 'variant_generate_content': {
        const input = VariantGenerateContentInput.parse(args);
        const prompt = await contentService.generateVariantPrompt(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(prompt, null, 2) }],
        };
      }

      case 'content_update': {
        const input = ContentUpdateInput.parse(args);
        const { productId, ...updateData } = input;
        const product = await productService.update(productId, updateData);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Content updated',
              productId: product.id,
              updated: Object.keys(updateData),
            }, null, 2),
          }],
        };
      }

      // === CATEGORY TOOLS ===
      case 'category_list': {
        const input = CategoryListInput.parse(args);
        const categories = await categoryService.list(input);
        return {
          content: [{ type: 'text', text: JSON.stringify({ categories }, null, 2) }],
        };
      }

      case 'category_get': {
        const input = CategoryGetInput.parse(args);
        const category = await categoryService.get(input);
        if (!category) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: true, message: 'Category not found' }, null, 2) }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(category, null, 2) }],
        };
      }

      case 'category_generate_content': {
        const input = CategoryGenerateContentInput.parse(args);
        const category = await categoryService.get({ id: input.id, includeProducts: false, productLimit: 0 });
        if (!category) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: true, message: 'Category not found' }, null, 2) }],
            isError: true,
          };
        }
        const breadcrumb = await categoryService.getBreadcrumb(input.id);
        const style = input.style ?? contentService.detectStyleFromBreadcrumb(breadcrumb);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              category: {
                id: category.id,
                name: category.name,
                breadcrumb,
              },
              style,
              maxLength: input.maxLength ?? 500,
              instructions: style === 'software'
                ? 'Generate professional SEO text. Use formal Sie-Form. Focus on benefits for shop owners/developers.'
                : 'Generate engaging SEO text. Use informal Du-Form. Focus on creativity and emotion.',
            }, null, 2),
          }],
        };
      }

      case 'category_update': {
        const input = CategoryUpdateInput.parse(args);
        const { id, ...updateData } = input;
        const category = await categoryService.update(id, updateData);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Category updated',
              category: {
                id: category.id,
                name: category.name,
                seoData: category.seoData,
              },
              updated: Object.keys(updateData),
            }, null, 2),
          }],
        };
      }

      // === HELPER TOOLS ===
      case 'get_properties': {
        const input = GetPropertiesInput.parse(args);
        const properties = await propertyService.list(input.groupId);
        return {
          content: [{ type: 'text', text: JSON.stringify({ properties }, null, 2) }],
        };
      }

      case 'get_manufacturers': {
        const input = GetManufacturersInput.parse(args);
        const manufacturers = await manufacturerService.list(input.search, input.limit ?? 50);
        return {
          content: [{ type: 'text', text: JSON.stringify({ manufacturers }, null, 2) }],
        };
      }

      case 'snippet_list': {
        const input = SnippetListInput.parse(args);
        const snippets = await snippetService.list(input.activeOnly ?? true);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: snippets.length,
              snippets: snippets.map(s => ({
                identifier: s.identifier,
                name: s.name,
                active: s.active,
              })),
            }, null, 2),
          }],
        };
      }

      // === MAIL TEMPLATE TOOLS ===
      case 'mail_template_list': {
        const input = MailTemplateListInput.parse(args);
        const result = await mailTemplateService.list(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: result.templates.length,
              total: result.total,
              templates: result.templates,
            }, null, 2),
          }],
        };
      }

      case 'mail_template_get': {
        const input = MailTemplateGetInput.parse(args);
        const template = await mailTemplateService.get(input);
        if (!template) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: true, message: 'Mail template not found' }, null, 2) }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(template, null, 2) }],
        };
      }

      case 'mail_template_update': {
        const input = MailTemplateUpdateInput.parse(args);
        const { id, ...updateData } = input;
        const template = await mailTemplateService.update(id, updateData);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Mail template updated',
              template: {
                id: template.id,
                technicalName: template.templateType?.technicalName,
                subject: template.subject,
              },
              updated: Object.keys(updateData),
            }, null, 2),
          }],
        };
      }

      case 'mail_template_send_test': {
        const input = MailTemplateSendTestInput.parse(args);
        const result = await mailTemplateService.sendTest(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: result.success,
              message: `Test mail sent to ${result.recipient}`,
              templateType: result.templateType,
            }, null, 2),
          }],
        };
      }

      // === FLOW BUILDER TOOLS ===
      case 'flow_list': {
        const input = FlowListInput.parse(args);
        const result = await flowService.list(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: result.flows.length,
              total: result.total,
              flows: result.flows,
            }, null, 2),
          }],
        };
      }

      case 'flow_get': {
        const input = FlowGetInput.parse(args);
        const flow = await flowService.get(input);
        if (!flow) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: true, message: 'Flow not found' }, null, 2) }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(flow, null, 2) }],
        };
      }

      case 'flow_toggle': {
        const input = FlowToggleInput.parse(args);
        const flow = await flowService.toggle(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Flow ${input.active ? 'activated' : 'deactivated'}`,
              flow: {
                id: flow.id,
                name: flow.name,
                active: flow.active,
              },
            }, null, 2),
          }],
        };
      }

      // === MEDIA TOOLS ===
      case 'media_list': {
        const input = MediaListInput.parse(args);
        const result = await mediaService.list(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: result.media.length,
              total: result.total,
              media: result.media,
            }, null, 2),
          }],
        };
      }

      case 'media_get': {
        const input = MediaGetInput.parse(args);
        const media = await mediaService.get(input);
        if (!media) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: true, message: 'Media not found' }, null, 2) }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(media, null, 2) }],
        };
      }

      case 'media_update': {
        const input = MediaUpdateInput.parse(args);
        const { id, ...updateData } = input;
        const media = await mediaService.update(id, updateData);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Media updated',
              media: {
                id: media.id,
                fileName: media.fileName,
                alt: media.alt,
                title: media.title,
              },
              updated: Object.keys(updateData),
            }, null, 2),
          }],
        };
      }

      case 'media_search': {
        const input = MediaSearchInput.parse(args);
        const results = await mediaService.search(input.query, input.limit ?? 20);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query: input.query,
              count: results.length,
              media: results,
            }, null, 2),
          }],
        };
      }

      case 'media_audit_alt': {
        const input = MediaAuditAltInput.parse(args);
        const result = await mediaService.auditAlt(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              audit: 'BFSG Alt-Text Compliance',
              totalMediaChecked: result.totalMediaChecked,
              missingAltCount: result.missingAltCount,
              affectedProductCount: result.affectedProductCount,
              items: result.items,
              recommendation: result.missingAltCount > 0
                ? `${result.missingAltCount} media items are missing alt text. Use media_update to add alt text for BFSG compliance.`
                : 'All product media have alt text. BFSG compliant!',
            }, null, 2),
          }],
        };
      }

      case 'media_upload_url': {
        const input = MediaUploadUrlInput.parse(args);
        const result = await mediaService.uploadFromUrl(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: result.success,
              message: 'Media uploaded from URL',
              media: {
                id: result.mediaId,
                fileName: result.fileName,
                url: result.url,
              },
            }, null, 2),
          }],
        };
      }

      // === ORDER TOOLS (read-only) ===
      case 'order_list': {
        const input = OrderListInput.parse(args);
        const result = await orderService.list(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: result.orders.length,
              total: result.total,
              orders: result.orders,
            }, null, 2),
          }],
        };
      }

      case 'order_get': {
        const input = OrderGetInput.parse(args);
        const order = await orderService.get(input);
        if (!order) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: true, message: 'Order not found' }, null, 2) }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(order, null, 2) }],
        };
      }

      case 'order_stats': {
        const input = OrderStatsInput.parse(args);
        const stats = await orderService.stats(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              statistics: stats,
              summary: `${stats.totalOrders} orders, ${stats.totalRevenue} ${stats.currencySymbol} total revenue, ${stats.averageOrderValue} ${stats.currencySymbol} average`,
            }, null, 2),
          }],
        };
      }

      // === CROSS-SELLING TOOLS ===
      case 'cross_selling_list': {
        const input = CrossSellingListInput.parse(args);
        const items = await crossSellingService.list(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              productId: input.productId,
              count: items.length,
              crossSellings: items,
            }, null, 2),
          }],
        };
      }

      case 'cross_selling_get': {
        const input = CrossSellingGetInput.parse(args);
        const cs = await crossSellingService.get(input);
        if (!cs) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: true, message: 'Cross-selling not found' }, null, 2) }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(cs, null, 2) }],
        };
      }

      case 'cross_selling_create': {
        const input = CrossSellingCreateInput.parse(args);
        const cs = await crossSellingService.create(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Cross-selling created',
              crossSelling: {
                id: cs.id,
                name: cs.name,
                type: cs.type,
                assignedProductCount: cs.assignedProducts.length,
              },
            }, null, 2),
          }],
        };
      }

      case 'cross_selling_update': {
        const input = CrossSellingUpdateInput.parse(args);
        const { id, ...updateData } = input;
        const cs = await crossSellingService.update(id, updateData);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Cross-selling updated',
              crossSelling: {
                id: cs.id,
                name: cs.name,
                active: cs.active,
                assignedProductCount: cs.assignedProducts.length,
              },
              updated: Object.keys(updateData),
            }, null, 2),
          }],
        };
      }

      case 'cross_selling_suggest': {
        const input = CrossSellingSuggestInput.parse(args);
        const context = await crossSellingService.suggest(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              suggestion: 'Cross-selling recommendation context',
              sourceProduct: context.sourceProduct,
              candidateCount: context.candidates.length,
              candidates: context.candidates,
              existingCrossSellings: context.existingCrossSellings,
              instructions: 'Based on the source product and candidates, recommend which products to group as cross-sellings. Consider: category overlap, price range compatibility, complementary use cases.',
            }, null, 2),
          }],
        };
      }

      // === SEO URL TOOLS ===
      case 'seo_url_list': {
        const input = SeoUrlListInput.parse(args);
        const result = await seoUrlService.list(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: result.urls.length,
              total: result.total,
              urls: result.urls,
            }, null, 2),
          }],
        };
      }

      case 'seo_url_audit': {
        const input = SeoUrlAuditInput.parse(args);
        const result = await seoUrlService.audit(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              audit: 'SEO URL Health Check',
              totalUrlsChecked: result.totalUrlsChecked,
              issueCount: result.issueCount,
              issuesByType: result.issuesByType,
              issues: result.issues,
              recommendation: result.issueCount > 0
                ? `${result.issueCount} issue(s) found. Use seo_url_update to fix individual URLs or seo_url_generate to regenerate.`
                : 'No issues found. SEO URLs are healthy!',
            }, null, 2),
          }],
        };
      }

      case 'seo_url_update': {
        const input = SeoUrlUpdateInput.parse(args);
        const { id, ...updateData } = input;
        const seoUrl = await seoUrlService.update(id, updateData);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'SEO URL updated',
              seoUrl: {
                id: seoUrl.id,
                seoPathInfo: seoUrl.seoPathInfo,
                isCanonical: seoUrl.isCanonical,
                isModified: seoUrl.isModified,
                isDeleted: seoUrl.isDeleted,
              },
              updated: Object.keys(updateData),
            }, null, 2),
          }],
        };
      }

      case 'seo_url_generate': {
        const input = SeoUrlGenerateInput.parse(args);
        const result = await seoUrlService.generate(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: result.success,
              message: result.message,
              routeName: input.routeName,
              salesChannelId: input.salesChannelId,
            }, null, 2),
          }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    if (error instanceof MCPError) {
      return {
        content: [{ type: 'text', text: JSON.stringify(error.toResponse(), null, 2) }],
        isError: true,
      };
    }

    // Zod validation errors
    if (error instanceof Error && error.name === 'ZodError') {
      const zodError = error as unknown as { errors: Array<{ path: string[]; message: string }> };
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: true,
            code: 'INVALID_INPUT',
            message: 'Validation failed',
            details: zodError.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          }, null, 2),
        }],
        isError: true,
      };
    }

    logger.error('Tool execution error', { tool: name, error: String(error) });
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  logger.info('Starting claude-mcp-shopwareadmin server', {
    version: '0.1.0',
    shopwareUrl: config.shopware.url,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Server connected and ready');
}

main().catch((error) => {
  logger.error('Failed to start server', { error: String(error) });
  process.exit(1);
});
