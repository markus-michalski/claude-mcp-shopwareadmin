/**
 * MCP tool definitions for all 43 tools.
 * Each entry is used by the ListToolsRequestSchema handler.
 */
export const toolDefinitions = [
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
        style: { type: 'string', description: 'Content style profile name (e.g., "creative", "software"). Auto-detected from category if not specified.' },
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
        style: { type: 'string', description: 'Content style profile name (e.g., "creative", "software"). Auto-detected from category if not specified.' },
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
        style: { type: 'string', description: 'Content style profile name (e.g., "creative", "software"). Auto-detected from category if not specified.' },
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
] as const;
