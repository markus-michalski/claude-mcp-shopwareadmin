/**
 * MSW request handlers for Shopware API mocking
 */
import { http, HttpResponse } from 'msw';
import {
  MOCK_TOKEN_RESPONSE,
  MOCK_PRODUCT,
  MOCK_PRODUCT_LIST,
  MOCK_CURRENCIES,
  MOCK_TAX_RATES,
  MOCK_CATEGORY_LIST,
  MOCK_CATEGORY_LIST_ACTIVE,
  MOCK_CATEGORY_ID,
  MOCK_ROOT_CATEGORY_ID,
  MOCK_CATEGORY_OXID7_ID,
  MOCK_CATEGORY_GALLERY_ID,
  MOCK_CATEGORY,
  MOCK_CATEGORY_OXID7,
  MOCK_CATEGORY_GALLERY,
  MOCK_CATEGORY_WITH_PRODUCTS,
  MOCK_MANUFACTURER_LIST,
  MOCK_MANUFACTURER_ID,
  MOCK_MANUFACTURER,
  MOCK_PROPERTY_GROUP_LIST,
  MOCK_PROPERTY_GROUP_SUPPORT_ID,
  MOCK_SNIPPET_LIST,
  MOCK_SNIPPET_LIST_ACTIVE,
  MOCK_SNIPPET_REQUIREMENTS_ID,
  MOCK_SNIPPET_REQUIREMENTS,
  MOCK_PRODUCT_CREATIVE,
  MOCK_PRODUCT_SOFTWARE,
} from './fixtures.js';

export const WIKIJS_BASE_URL = 'https://faq.markus-michalski.net';

export const BASE_URL = 'https://test-shop.example.com';

/**
 * Default handlers for common API endpoints
 */
export const handlers = [
  // OAuth2 token endpoint
  http.post(`${BASE_URL}/api/oauth/token`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;

    // Simulate invalid credentials
    if (body.client_id === 'invalid' || body.client_secret === 'invalid') {
      return HttpResponse.json(
        { error: 'invalid_client', error_description: 'Invalid client credentials' },
        { status: 401 }
      );
    }

    return HttpResponse.json(MOCK_TOKEN_RESPONSE);
  }),

  // Get single product
  http.get(`${BASE_URL}/api/product/:id`, ({ params }) => {
    const { id } = params;

    if (id === 'not-found-id') {
      return HttpResponse.json(
        { errors: [{ status: '404', title: 'Not Found', detail: 'Product not found' }] },
        { status: 404 }
      );
    }

    return HttpResponse.json({ data: { ...MOCK_PRODUCT, id } });
  }),

  // Search products
  http.post(`${BASE_URL}/api/search/product`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;

    // Check for product number filter
    const filters = body.filter as Array<{ field: string; value: unknown }> | undefined;
    const productNumberFilter = filters?.find((f) => f.field === 'productNumber');

    if (productNumberFilter?.value === 'NOT-EXISTS') {
      return HttpResponse.json({ data: [], total: 0 });
    }

    // Return filtered or full list based on criteria
    if (body.term) {
      // Full-text search
      const term = (body.term as string).toLowerCase();
      const filtered = MOCK_PRODUCT_LIST.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.productNumber.toLowerCase().includes(term)
      );
      return HttpResponse.json({ data: filtered, total: filtered.length });
    }

    return HttpResponse.json({ data: MOCK_PRODUCT_LIST, total: MOCK_PRODUCT_LIST.length });
  }),

  // Create product
  http.post(`${BASE_URL}/api/product`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;

    // Simulate duplicate product number
    if (body.productNumber === 'DUPLICATE-SKU') {
      return HttpResponse.json(
        {
          errors: [{
            status: '400',
            code: 'CONTENT__DUPLICATE_PRODUCT_NUMBER',
            title: 'Duplicate product number',
            detail: 'Product number already exists',
          }],
        },
        { status: 400 }
      );
    }

    // Return created product with generated ID
    const newProduct = {
      ...MOCK_PRODUCT,
      ...body,
      id: 'new-product-uuid',
      active: false, // Always inactive on creation!
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return HttpResponse.json({ data: newProduct }, { status: 201 });
  }),

  // Update product
  http.patch(`${BASE_URL}/api/product/:id`, async ({ params, request }) => {
    const { id } = params;
    const body = await request.json() as Record<string, unknown>;

    if (id === 'not-found-id') {
      return HttpResponse.json(
        { errors: [{ status: '404', title: 'Not Found', detail: 'Product not found' }] },
        { status: 404 }
      );
    }

    // Return updated product
    const updated = {
      ...MOCK_PRODUCT,
      ...body,
      id,
      updatedAt: new Date().toISOString(),
    };

    return HttpResponse.json({ data: updated });
  }),

  // Delete product
  http.delete(`${BASE_URL}/api/product/:id`, ({ params }) => {
    const { id } = params;

    if (id === 'not-found-id') {
      return HttpResponse.json(
        { errors: [{ status: '404', title: 'Not Found', detail: 'Product not found' }] },
        { status: 404 }
      );
    }

    return new HttpResponse(null, { status: 204 });
  }),

  // Get currencies (for price building)
  http.post(`${BASE_URL}/api/search/currency`, () => {
    return HttpResponse.json(MOCK_CURRENCIES);
  }),

  // Get tax rates
  http.post(`${BASE_URL}/api/search/tax`, () => {
    return HttpResponse.json(MOCK_TAX_RATES);
  }),

  // ===========================================================================
  // Category Endpoints
  // ===========================================================================

  // Search categories
  http.post(`${BASE_URL}/api/search/category`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    // Build list based on filters
    let categories = [...MOCK_CATEGORY_LIST];

    // Check for active filter
    const filters = body.filter as Array<{ type: string; field: string; value: unknown }> | undefined;
    const activeFilter = filters?.find((f) => f.field === 'active');
    if (activeFilter && activeFilter.value === true) {
      categories = categories.filter((c) => c.active);
    }

    // Check for parentId filter
    const parentIdFilter = filters?.find((f) => f.field === 'parentId');
    if (parentIdFilter) {
      categories = categories.filter((c) => c.parentId === parentIdFilter.value);
    }

    // Check for ID search
    if (body.ids && Array.isArray(body.ids)) {
      categories = categories.filter((c) => (body.ids as string[]).includes(c.id));
    }

    // Apply limit
    const limit = (body.limit as number) || 100;
    categories = categories.slice(0, limit);

    return HttpResponse.json({ data: categories, total: categories.length });
  }),

  // Get single category by ID
  http.get(`${BASE_URL}/api/category/:id`, ({ params }) => {
    const { id } = params;

    if (id === 'not-found-id') {
      return HttpResponse.json(
        { errors: [{ status: '404', title: 'Not Found', detail: 'Category not found' }] },
        { status: 404 }
      );
    }

    const category = MOCK_CATEGORY_LIST.find((c) => c.id === id);
    if (!category) {
      return HttpResponse.json(
        { errors: [{ status: '404', title: 'Not Found', detail: 'Category not found' }] },
        { status: 404 }
      );
    }

    return HttpResponse.json({ data: category });
  }),

  // ===========================================================================
  // Manufacturer Endpoints
  // ===========================================================================

  // Search manufacturers
  http.post(`${BASE_URL}/api/search/product-manufacturer`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    let manufacturers = [...MOCK_MANUFACTURER_LIST];

    // Check for search term
    if (body.term) {
      const term = (body.term as string).toLowerCase();
      manufacturers = manufacturers.filter((m) =>
        m.name.toLowerCase().includes(term)
      );
    }

    // Apply limit
    const limit = (body.limit as number) || 25;
    manufacturers = manufacturers.slice(0, limit);

    return HttpResponse.json({ data: manufacturers, total: manufacturers.length });
  }),

  // Get single manufacturer by ID
  http.get(`${BASE_URL}/api/product-manufacturer/:id`, ({ params }) => {
    const { id } = params;

    if (id === MOCK_MANUFACTURER_ID) {
      return HttpResponse.json({ data: MOCK_MANUFACTURER });
    }

    return HttpResponse.json(
      { errors: [{ status: '404', title: 'Not Found', detail: 'Manufacturer not found' }] },
      { status: 404 }
    );
  }),

  // ===========================================================================
  // PropertyGroup Endpoints
  // ===========================================================================

  // Search property groups
  http.post(`${BASE_URL}/api/search/property-group`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    let propertyGroups = [...MOCK_PROPERTY_GROUP_LIST];

    // Check for ID filter
    if (body.ids && Array.isArray(body.ids)) {
      propertyGroups = propertyGroups.filter((pg) =>
        (body.ids as string[]).includes(pg.id)
      );
    }

    // Apply limit
    const limit = (body.limit as number) || 25;
    propertyGroups = propertyGroups.slice(0, limit);

    return HttpResponse.json({ data: propertyGroups, total: propertyGroups.length });
  }),

  // Get single property group
  http.get(`${BASE_URL}/api/property-group/:id`, ({ params }) => {
    const { id } = params;

    const propertyGroup = MOCK_PROPERTY_GROUP_LIST.find((pg) => pg.id === id);
    if (propertyGroup) {
      return HttpResponse.json({ data: propertyGroup });
    }

    return HttpResponse.json(
      { errors: [{ status: '404', title: 'Not Found', detail: 'Property group not found' }] },
      { status: 404 }
    );
  }),

  // ===========================================================================
  // Snippet Endpoints (mmd-product-snippet plugin)
  // ===========================================================================

  // List all snippets (custom plugin endpoint)
  http.get(`${BASE_URL}/api/mmd-product-snippet`, async ({ request }) => {
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get('activeOnly') === 'true';
    const locale = url.searchParams.get('locale') || 'de-DE';

    let snippets = [...MOCK_SNIPPET_LIST];

    // Filter by active status
    if (activeOnly) {
      snippets = snippets.filter((s) => s.active);
    }

    // Filter by locale
    snippets = snippets.filter((s) => s.locale === locale);

    return HttpResponse.json({ data: snippets, total: snippets.length });
  }),

  // Search snippets via DAL
  http.post(`${BASE_URL}/api/search/mmd-product-snippet`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    let snippets = [...MOCK_SNIPPET_LIST];

    // Check for filters
    const filters = body.filter as Array<{ type: string; field: string; value: unknown }> | undefined;

    // Filter by active
    const activeFilter = filters?.find((f) => f.field === 'active');
    if (activeFilter) {
      snippets = snippets.filter((s) => s.active === activeFilter.value);
    }

    // Filter by identifier
    const identifierFilter = filters?.find((f) => f.field === 'identifier');
    if (identifierFilter) {
      snippets = snippets.filter((s) => s.identifier === identifierFilter.value);
    }

    // Filter by locale
    const localeFilter = filters?.find((f) => f.field === 'locale');
    if (localeFilter) {
      snippets = snippets.filter((s) => s.locale === localeFilter.value);
    }

    // Check for ID search
    if (body.ids && Array.isArray(body.ids)) {
      snippets = snippets.filter((s) => (body.ids as string[]).includes(s.id));
    }

    // Apply limit
    const limit = (body.limit as number) || 25;
    snippets = snippets.slice(0, limit);

    return HttpResponse.json({ data: snippets, total: snippets.length });
  }),

  // Get single snippet by ID
  http.get(`${BASE_URL}/api/mmd-product-snippet/:id`, ({ params }) => {
    const { id } = params;

    const snippet = MOCK_SNIPPET_LIST.find((s) => s.id === id);
    if (snippet) {
      return HttpResponse.json({ data: snippet });
    }

    return HttpResponse.json(
      { errors: [{ status: '404', title: 'Not Found', detail: 'Snippet not found' }] },
      { status: 404 }
    );
  }),

  // ===========================================================================
  // Wiki.js Documentation Check Endpoints
  // ===========================================================================

  // Wiki.js HEAD request to check if documentation page exists
  // Existing docs: de/oxid7/mlm-gallery, en/oxid7/mlm-gallery
  // Not existing: de/shopware6/unknown
  http.head(`${WIKIJS_BASE_URL}/:locale/:system/:slug`, ({ params }) => {
    const { slug } = params;

    // Simulate existing documentation pages
    if (slug === 'mlm-gallery') {
      return new HttpResponse(null, { status: 200 });
    }

    // Default: page does not exist
    return new HttpResponse(null, { status: 404 });
  }),
];

/**
 * Handler for simulating token expiration
 */
export const expiredTokenHandler = http.get(`${BASE_URL}/api/product/:id`, () => {
  return HttpResponse.json(
    { errors: [{ status: '401', title: 'Unauthorized', detail: 'Token expired' }] },
    { status: 401 }
  );
});

/**
 * Handler for simulating rate limiting
 */
export const rateLimitedHandler = http.get(`${BASE_URL}/api/product/:id`, () => {
  return HttpResponse.json(
    { errors: [{ status: '429', title: 'Too Many Requests' }] },
    { status: 429 }
  );
});

/**
 * Handler for simulating server errors
 */
export const serverErrorHandler = http.get(`${BASE_URL}/api/product/:id`, () => {
  return HttpResponse.json(
    { errors: [{ status: '500', title: 'Internal Server Error' }] },
    { status: 500 }
  );
});
