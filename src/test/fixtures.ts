/**
 * Test fixtures for Shopware API mocking
 */

// =============================================================================
// OAuth2 Fixtures
// =============================================================================

export const MOCK_TOKEN_RESPONSE = {
  access_token: 'test-access-token-12345',
  expires_in: 600, // 10 minutes
  token_type: 'Bearer' as const,
};

export const MOCK_CREDENTIALS = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
};

// =============================================================================
// Currency & Tax Fixtures
// =============================================================================

export const MOCK_EUR_CURRENCY_ID = 'b7d2554b0ce847cd82f3ac9bd1c0dfca';

export const MOCK_CURRENCIES = {
  data: [
    {
      id: MOCK_EUR_CURRENCY_ID,
      isoCode: 'EUR',
      name: 'Euro',
      symbol: '€',
      factor: 1,
      isSystemDefault: true,
    },
  ],
  total: 1,
};

export const MOCK_TAX_19_ID = '1950c5d2b90c4c5b9c1cf1a9e8e8e8e8';
export const MOCK_TAX_7_ID = '7000c5d2b90c4c5b9c1cf1a9e8e8e8e8';

export const MOCK_SALES_CHANNEL_ID = 'sc00c5d2b90c4c5b9c1cf1a9e8e8e8e8';

export const MOCK_TAX_RATES = {
  data: [
    {
      id: MOCK_TAX_19_ID,
      taxRate: 19,
      name: 'Standard rate',
      position: 1,
    },
    {
      id: MOCK_TAX_7_ID,
      taxRate: 7,
      name: 'Reduced rate',
      position: 2,
    },
  ],
  total: 2,
};

// =============================================================================
// Category Fixtures
// =============================================================================

// Category IDs
export const MOCK_ROOT_CATEGORY_ID = 'cat-root-uuid';
export const MOCK_CATEGORY_ID = 'cat-software-uuid';
export const MOCK_CATEGORY_STICKDATEIEN_ID = 'cat-stickdateien-uuid';
export const MOCK_CATEGORY_GENAEHTES_ID = 'cat-genaehtes-uuid';
export const MOCK_CATEGORY_3D_DRUCK_ID = 'cat-3d-druck-uuid';
export const MOCK_CATEGORY_OXID7_ID = 'cat-oxid7-uuid';
export const MOCK_CATEGORY_SHOPWARE6_ID = 'cat-shopware6-uuid';
export const MOCK_CATEGORY_GALLERY_ID = 'cat-oxid7-gallery-uuid';
export const MOCK_CATEGORY_INACTIVE_ID = 'cat-inactive-uuid';

// Root Category
export const MOCK_ROOT_CATEGORY = {
  id: MOCK_ROOT_CATEGORY_ID,
  name: 'Katalog',
  path: '|',
  parentId: null,
  active: true,
  visible: true,
  type: 'page',
  level: 1,
  breadcrumb: ['Katalog'],
  childCount: 4,
  productAssignmentType: 'product',
  cmsPageId: null,
  description: null,
  metaTitle: null,
  metaDescription: null,
  keywords: null,
  children: [],
};

// Level 1 Categories (direct children of root)
export const MOCK_CATEGORY = {
  id: MOCK_CATEGORY_ID,
  name: 'Software',
  path: `|${MOCK_ROOT_CATEGORY_ID}|`,
  parentId: MOCK_ROOT_CATEGORY_ID,
  active: true,
  visible: true,
  type: 'page',
  level: 2,
  breadcrumb: ['Katalog', 'Software'],
  childCount: 2,
  productAssignmentType: 'product',
  cmsPageId: null,
  description: '<p>Software und Module fuer verschiedene Shopsysteme</p>',
  metaTitle: 'Software | MM Kreativ',
  metaDescription: 'Module und Erweiterungen fuer OXID und Shopware',
  keywords: 'software, module, oxid, shopware',
  children: [],
};

export const MOCK_CATEGORY_STICKDATEIEN = {
  id: MOCK_CATEGORY_STICKDATEIEN_ID,
  name: 'Stickdateien',
  path: `|${MOCK_ROOT_CATEGORY_ID}|`,
  parentId: MOCK_ROOT_CATEGORY_ID,
  active: true,
  visible: true,
  type: 'page',
  level: 2,
  breadcrumb: ['Katalog', 'Stickdateien'],
  childCount: 0,
  productAssignmentType: 'product',
  cmsPageId: null,
  description: '<p>Hochwertige Stickdateien fuer Stickmaschinen</p>',
  metaTitle: 'Stickdateien | MM Kreativ',
  metaDescription: 'Professionelle Stickdateien fuer verschiedene Formate',
  keywords: 'stickdateien, stickmuster, stickmaschine',
  children: [],
};

export const MOCK_CATEGORY_GENAEHTES = {
  id: MOCK_CATEGORY_GENAEHTES_ID,
  name: 'Genaehtes',
  path: `|${MOCK_ROOT_CATEGORY_ID}|`,
  parentId: MOCK_ROOT_CATEGORY_ID,
  active: true,
  visible: true,
  type: 'page',
  level: 2,
  breadcrumb: ['Katalog', 'Genaehtes'],
  childCount: 0,
  productAssignmentType: 'product',
  cmsPageId: null,
  description: '<p>Handgemachte Naeharbeiten</p>',
  metaTitle: 'Genaehtes | MM Kreativ',
  metaDescription: 'Handgemachte Produkte aus Stoff',
  keywords: 'genaehtes, handarbeit, naehen',
  children: [],
};

export const MOCK_CATEGORY_3D_DRUCK = {
  id: MOCK_CATEGORY_3D_DRUCK_ID,
  name: '3D-Druck',
  path: `|${MOCK_ROOT_CATEGORY_ID}|`,
  parentId: MOCK_ROOT_CATEGORY_ID,
  active: true,
  visible: true,
  type: 'page',
  level: 2,
  breadcrumb: ['Katalog', '3D-Druck'],
  childCount: 0,
  productAssignmentType: 'product',
  cmsPageId: null,
  description: '<p>3D-gedruckte Produkte und Modelle</p>',
  metaTitle: '3D-Druck | MM Kreativ',
  metaDescription: '3D-gedruckte Modelle und Produkte',
  keywords: '3d-druck, 3d-modelle, printing',
  children: [],
};

export const MOCK_CATEGORY_INACTIVE = {
  id: MOCK_CATEGORY_INACTIVE_ID,
  name: 'Inaktive Kategorie',
  path: `|${MOCK_ROOT_CATEGORY_ID}|`,
  parentId: MOCK_ROOT_CATEGORY_ID,
  active: false,
  visible: false,
  type: 'page',
  level: 2,
  breadcrumb: ['Katalog', 'Inaktive Kategorie'],
  childCount: 0,
  productAssignmentType: 'product',
  cmsPageId: null,
  description: null,
  metaTitle: null,
  metaDescription: null,
  keywords: null,
  children: [],
};

// Level 2 Categories (children of Software)
export const MOCK_CATEGORY_OXID7 = {
  id: MOCK_CATEGORY_OXID7_ID,
  name: 'OXID 7',
  path: `|${MOCK_ROOT_CATEGORY_ID}|${MOCK_CATEGORY_ID}|`,
  parentId: MOCK_CATEGORY_ID,
  active: true,
  visible: true,
  type: 'page',
  level: 3,
  breadcrumb: ['Katalog', 'Software', 'OXID 7'],
  childCount: 1,
  productAssignmentType: 'product',
  cmsPageId: null,
  description: '<p>Module fuer OXID eShop 7</p>',
  metaTitle: 'OXID 7 Module | MM Kreativ',
  metaDescription: 'Professionelle Module fuer OXID eShop 7',
  keywords: 'oxid7, oxid eshop, module',
  children: [],
};

export const MOCK_CATEGORY_SHOPWARE6 = {
  id: MOCK_CATEGORY_SHOPWARE6_ID,
  name: 'Shopware 6',
  path: `|${MOCK_ROOT_CATEGORY_ID}|${MOCK_CATEGORY_ID}|`,
  parentId: MOCK_CATEGORY_ID,
  active: true,
  visible: true,
  type: 'page',
  level: 3,
  breadcrumb: ['Katalog', 'Software', 'Shopware 6'],
  childCount: 0,
  productAssignmentType: 'product',
  cmsPageId: null,
  description: '<p>Plugins fuer Shopware 6</p>',
  metaTitle: 'Shopware 6 Plugins | MM Kreativ',
  metaDescription: 'Professionelle Plugins fuer Shopware 6',
  keywords: 'shopware6, shopware, plugins',
  children: [],
};

// Level 3 Category (child of OXID 7)
export const MOCK_CATEGORY_GALLERY = {
  id: MOCK_CATEGORY_GALLERY_ID,
  name: 'Galerie-Module',
  path: `|${MOCK_ROOT_CATEGORY_ID}|${MOCK_CATEGORY_ID}|${MOCK_CATEGORY_OXID7_ID}|`,
  parentId: MOCK_CATEGORY_OXID7_ID,
  active: true,
  visible: true,
  type: 'page',
  level: 4,
  breadcrumb: ['Katalog', 'Software', 'OXID 7', 'Galerie-Module'],
  childCount: 0,
  productAssignmentType: 'product',
  cmsPageId: null,
  description: '<p>Bildergalerie-Module fuer OXID 7</p>',
  metaTitle: 'Galerie-Module OXID 7 | MM Kreativ',
  metaDescription: 'Professionelle Galerie-Module fuer OXID eShop 7',
  keywords: 'galerie, bilder, oxid7, module',
  children: [],
};

// Flat list of all categories
export const MOCK_CATEGORY_LIST = [
  MOCK_ROOT_CATEGORY,
  MOCK_CATEGORY,
  MOCK_CATEGORY_STICKDATEIEN,
  MOCK_CATEGORY_GENAEHTES,
  MOCK_CATEGORY_3D_DRUCK,
  MOCK_CATEGORY_INACTIVE,
  MOCK_CATEGORY_OXID7,
  MOCK_CATEGORY_SHOPWARE6,
  MOCK_CATEGORY_GALLERY,
];

// All active categories
export const MOCK_CATEGORY_LIST_ACTIVE = MOCK_CATEGORY_LIST.filter((c) => c.active);

// =============================================================================
// Manufacturer Fixtures
// =============================================================================

export const MOCK_MANUFACTURER_ID = 'mfr-mm-kreativ-uuid';

export const MOCK_MANUFACTURER = {
  id: MOCK_MANUFACTURER_ID,
  name: 'MM Kreativ',
  link: 'https://mm-kreativ.de',
  description: 'OXID module development',
};

// =============================================================================
// Product Fixtures
// =============================================================================

export const MOCK_PRODUCT_ID = 'prod-gallery-uuid';

export const MOCK_PRODUCT = {
  id: MOCK_PRODUCT_ID,
  productNumber: 'MM-GALLERY-7',
  name: 'Gallery-Modul OXID 7',
  description: '<p>Professional image gallery for OXID eShop 7</p>',
  active: false,
  stock: 999,
  ean: null,
  price: [
    {
      currencyId: MOCK_EUR_CURRENCY_ID,
      gross: 149.0,
      net: 125.21,
      linked: true,
    },
  ],
  taxId: MOCK_TAX_19_ID,
  manufacturerId: MOCK_MANUFACTURER_ID,
  manufacturer: MOCK_MANUFACTURER,
  categories: [MOCK_CATEGORY],
  categoryIds: [MOCK_CATEGORY_ID],
  properties: [],
  options: [],
  children: [],
  media: [],
  coverId: null,
  customFields: {},
  metaTitle: 'Gallery-Modul OXID 7 | MM Kreativ',
  metaDescription: 'Professional gallery module for OXID eShop 7',
  keywords: 'oxid, gallery, module, bilder',
  createdAt: '2025-01-01T10:00:00.000Z',
  updatedAt: '2025-01-14T15:00:00.000Z',
};

export const MOCK_PRODUCT_VARIANT = {
  id: 'prod-gallery-variant-uuid',
  productNumber: 'MM-GALLERY-7-SUPPORT',
  name: 'Gallery-Modul OXID 7 - Mit Support',
  parentId: MOCK_PRODUCT_ID,
  active: false,
  stock: 999,
  price: [
    {
      currencyId: MOCK_EUR_CURRENCY_ID,
      gross: 249.0,
      net: 209.24,
      linked: true,
    },
  ],
  options: [
    {
      id: 'opt-support-yes-uuid',
      name: 'Ja',
      group: {
        id: 'grp-support-uuid',
        name: 'Support',
      },
    },
  ],
};

export const MOCK_PRODUCT_2 = {
  id: 'prod-sitemap-uuid',
  productNumber: 'MM-SITEMAP-7',
  name: 'Sitemap-Generator OXID 7',
  description: '<p>SEO-optimized XML sitemap generator</p>',
  active: true,
  stock: 999,
  ean: null,
  price: [
    {
      currencyId: MOCK_EUR_CURRENCY_ID,
      gross: 79.0,
      net: 66.39,
      linked: true,
    },
  ],
  taxId: MOCK_TAX_19_ID,
  manufacturerId: MOCK_MANUFACTURER_ID,
  manufacturer: MOCK_MANUFACTURER,
  categories: [MOCK_CATEGORY],
  categoryIds: [MOCK_CATEGORY_ID],
  properties: [],
  options: [],
  children: [],
  media: [],
  coverId: null,
  customFields: {},
  metaTitle: 'Sitemap-Generator OXID 7',
  metaDescription: 'Generate SEO-optimized XML sitemaps for OXID eShop 7',
  keywords: 'oxid, sitemap, seo, xml',
  createdAt: '2025-01-02T10:00:00.000Z',
  updatedAt: '2025-01-14T14:00:00.000Z',
};

export const MOCK_PRODUCT_3 = {
  id: 'prod-cookie-uuid',
  productNumber: 'MM-COOKIE-7',
  name: 'Cookie-Consent OXID 7',
  description: '<p>GDPR-compliant cookie consent solution</p>',
  active: false,
  stock: 999,
  ean: null,
  price: [
    {
      currencyId: MOCK_EUR_CURRENCY_ID,
      gross: 99.0,
      net: 83.19,
      linked: true,
    },
  ],
  taxId: MOCK_TAX_19_ID,
  manufacturerId: MOCK_MANUFACTURER_ID,
  categories: [MOCK_CATEGORY],
  properties: [],
  options: [],
  children: [],
  media: [],
  customFields: {},
  createdAt: '2025-01-03T10:00:00.000Z',
  updatedAt: '2025-01-14T13:00:00.000Z',
};

export const MOCK_PRODUCT_LIST = [MOCK_PRODUCT, MOCK_PRODUCT_2, MOCK_PRODUCT_3];

// Category with products for get() tests (must be after product definitions)
export const MOCK_CATEGORY_WITH_PRODUCTS = {
  ...MOCK_CATEGORY_OXID7,
  products: [MOCK_PRODUCT, MOCK_PRODUCT_2],
};

// =============================================================================
// Input Fixtures for Service Tests
// =============================================================================

export const MOCK_CREATE_INPUT = {
  name: 'New Test Product',
  productNumber: 'TEST-001',
  price: 99.0,
  categoryId: MOCK_CATEGORY_ID,
  description: '<p>Test product description</p>',
  stock: 10,
};

export const MOCK_UPDATE_INPUT = {
  id: MOCK_PRODUCT_ID,
  name: 'Updated Product Name',
  price: 199.0,
  description: '<p>Updated description</p>',
};

// =============================================================================
// Manufacturer Fixtures
// =============================================================================

export const MOCK_MANUFACTURER_2_ID = 'mfr-shopware-uuid';

export const MOCK_MANUFACTURER_2 = {
  id: MOCK_MANUFACTURER_2_ID,
  name: 'Shopware AG',
  link: 'https://shopware.com',
  description: 'E-Commerce Platform',
  media: null,
};

export const MOCK_MANUFACTURER_LIST = [
  {
    ...MOCK_MANUFACTURER,
    productCount: 5,
  },
  {
    ...MOCK_MANUFACTURER_2,
    productCount: 3,
  },
];

// =============================================================================
// PropertyGroup Fixtures
// =============================================================================

export const MOCK_PROPERTY_GROUP_SUPPORT_ID = 'propgrp-support-uuid';
export const MOCK_PROPERTY_GROUP_LICENSE_ID = 'propgrp-license-uuid';
export const MOCK_PROPERTY_GROUP_VERSION_ID = 'propgrp-version-uuid';

export const MOCK_PROPERTY_GROUP_SUPPORT = {
  id: MOCK_PROPERTY_GROUP_SUPPORT_ID,
  name: 'Support',
  description: 'Support-Optionen fuer Software',
  displayType: 'text',
  sortingType: 'position',
  filterable: true,
  visibleOnProductDetailPage: true,
  position: 1,
  options: [
    {
      id: 'propopt-support-no-uuid',
      name: 'Ohne Support',
      position: 1,
      colorHexCode: null,
      mediaId: null,
    },
    {
      id: 'propopt-support-yes-uuid',
      name: 'Mit Support (1 Jahr)',
      position: 2,
      colorHexCode: null,
      mediaId: null,
    },
  ],
};

export const MOCK_PROPERTY_GROUP_LICENSE = {
  id: MOCK_PROPERTY_GROUP_LICENSE_ID,
  name: 'Lizenz',
  description: 'Lizenz-Typen',
  displayType: 'text',
  sortingType: 'alphanumeric',
  filterable: true,
  visibleOnProductDetailPage: true,
  position: 2,
  options: [
    {
      id: 'propopt-license-single-uuid',
      name: 'Einzellizenz',
      position: 1,
      colorHexCode: null,
      mediaId: null,
    },
    {
      id: 'propopt-license-unlimited-uuid',
      name: 'Unbegrenzte Lizenz',
      position: 2,
      colorHexCode: null,
      mediaId: null,
    },
  ],
};

export const MOCK_PROPERTY_GROUP_VERSION = {
  id: MOCK_PROPERTY_GROUP_VERSION_ID,
  name: 'OXID Version',
  description: 'Kompatible OXID eShop Versionen',
  displayType: 'text',
  sortingType: 'numeric',
  filterable: true,
  visibleOnProductDetailPage: true,
  position: 3,
  options: [
    {
      id: 'propopt-version-70-uuid',
      name: 'OXID 7.0',
      position: 1,
      colorHexCode: null,
      mediaId: null,
    },
    {
      id: 'propopt-version-71-uuid',
      name: 'OXID 7.1',
      position: 2,
      colorHexCode: null,
      mediaId: null,
    },
    {
      id: 'propopt-version-72-uuid',
      name: 'OXID 7.2',
      position: 3,
      colorHexCode: null,
      mediaId: null,
    },
  ],
};

export const MOCK_PROPERTY_GROUP_LIST = [
  MOCK_PROPERTY_GROUP_SUPPORT,
  MOCK_PROPERTY_GROUP_LICENSE,
  MOCK_PROPERTY_GROUP_VERSION,
];

// =============================================================================
// Snippet Fixtures (mmd-product-snippet plugin)
// =============================================================================

export const MOCK_SNIPPET_REQUIREMENTS_ID = 'snippet-requirements-uuid';
export const MOCK_SNIPPET_COMPATIBILITY_ID = 'snippet-compatibility-uuid';
export const MOCK_SNIPPET_INSTALLATION_ID = 'snippet-installation-uuid';
export const MOCK_SNIPPET_INACTIVE_ID = 'snippet-inactive-uuid';

export const MOCK_SNIPPET_REQUIREMENTS = {
  id: MOCK_SNIPPET_REQUIREMENTS_ID,
  identifier: 'requirements',
  name: 'Systemanforderungen',
  content: `## Systemanforderungen

- PHP 8.1 oder hoeher
- MySQL 8.0 / MariaDB 10.5
- OXID eShop 7.0 oder hoeher`,
  active: true,
  locale: 'de-DE',
  position: 1,
  createdAt: '2025-01-01T10:00:00.000Z',
  updatedAt: '2025-01-14T15:00:00.000Z',
};

export const MOCK_SNIPPET_COMPATIBILITY = {
  id: MOCK_SNIPPET_COMPATIBILITY_ID,
  identifier: 'compatibility',
  name: 'Kompatibilitaet',
  content: `## Kompatibilitaet

| OXID Version | Status |
|--------------|--------|
| 7.2.x        | Vollstaendig getestet |
| 7.1.x        | Vollstaendig getestet |
| 7.0.x        | Basis-Support |`,
  active: true,
  locale: 'de-DE',
  position: 2,
  createdAt: '2025-01-01T10:00:00.000Z',
  updatedAt: '2025-01-14T15:00:00.000Z',
};

export const MOCK_SNIPPET_INSTALLATION = {
  id: MOCK_SNIPPET_INSTALLATION_ID,
  identifier: 'installation',
  name: 'Installation',
  content: `## Installation

\`\`\`bash
composer require mmd/gallery
./vendor/bin/oe-console oe:module:activate mmd_gallery
\`\`\``,
  active: true,
  locale: 'de-DE',
  position: 3,
  createdAt: '2025-01-01T10:00:00.000Z',
  updatedAt: '2025-01-14T15:00:00.000Z',
};

export const MOCK_SNIPPET_INACTIVE = {
  id: MOCK_SNIPPET_INACTIVE_ID,
  identifier: 'deprecated-snippet',
  name: 'Veralteter Snippet',
  content: 'Dieser Snippet ist nicht mehr aktiv.',
  active: false,
  locale: 'de-DE',
  position: 99,
  createdAt: '2024-01-01T10:00:00.000Z',
  updatedAt: '2024-06-01T10:00:00.000Z',
};

export const MOCK_SNIPPET_LIST = [
  MOCK_SNIPPET_REQUIREMENTS,
  MOCK_SNIPPET_COMPATIBILITY,
  MOCK_SNIPPET_INSTALLATION,
  MOCK_SNIPPET_INACTIVE,
];

export const MOCK_SNIPPET_LIST_ACTIVE = MOCK_SNIPPET_LIST.filter((s) => s.active);

// =============================================================================
// Content Generation Fixtures
// =============================================================================

// Product for creative content (Stickdateien)
export const MOCK_PRODUCT_CREATIVE = {
  id: 'prod-osterhase-uuid',
  productNumber: 'MM-STICK-001',
  name: 'Osterhase Stickdatei',
  description: null,
  active: false,
  stock: 999,
  ean: null,
  price: [
    {
      currencyId: MOCK_EUR_CURRENCY_ID,
      gross: 4.90,
      net: 4.12,
      linked: true,
    },
  ],
  taxId: MOCK_TAX_19_ID,
  manufacturerId: MOCK_MANUFACTURER_ID,
  manufacturer: MOCK_MANUFACTURER,
  categories: [MOCK_CATEGORY_STICKDATEIEN],
  categoryIds: [MOCK_CATEGORY_STICKDATEIEN_ID],
  properties: [],
  options: [],
  children: [],
  media: [],
  coverId: null,
  customFields: {},
  metaTitle: null,
  metaDescription: null,
  keywords: null,
  createdAt: '2025-01-01T10:00:00.000Z',
  updatedAt: '2025-01-14T15:00:00.000Z',
};

// Product for software content (OXID 7 module)
export const MOCK_PRODUCT_SOFTWARE = {
  ...MOCK_PRODUCT,
  categories: [MOCK_CATEGORY_GALLERY],
  categoryIds: [MOCK_CATEGORY_GALLERY_ID],
};

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a mock product with custom overrides
 */
export function createMockProduct(overrides: Partial<typeof MOCK_PRODUCT> = {}) {
  return {
    ...MOCK_PRODUCT,
    id: `prod-${Date.now()}-uuid`,
    ...overrides,
  };
}

/**
 * Create a mock snippet with custom overrides
 */
export function createMockSnippet(overrides: Partial<typeof MOCK_SNIPPET_REQUIREMENTS> = {}) {
  return {
    ...MOCK_SNIPPET_REQUIREMENTS,
    id: `snippet-${Date.now()}-uuid`,
    ...overrides,
  };
}

/**
 * Create a mock logger for tests
 */
export function createMockLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}
