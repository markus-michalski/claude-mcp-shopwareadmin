# claude-mcp-shopwareadmin - Architektur-Dokumentation

## Projektstruktur

```
claude-mcp-shopwareadmin/
├── src/
│   ├── index.ts                           # Entry Point, MCP Server Setup
│   │
│   ├── config/
│   │   └── Configuration.ts               # Environment-Konfiguration (.env Loader)
│   │
│   ├── application/
│   │   ├── schemas/                       # Zod-Schemas pro Tool-Gruppe
│   │   │   ├── ProductSchemas.ts          # product_* Tool-Inputs
│   │   │   ├── CategorySchemas.ts         # category_* Tool-Inputs
│   │   │   ├── ContentSchemas.ts          # content_* / generate_* Tool-Inputs
│   │   │   └── HelperSchemas.ts           # get_properties, get_manufacturers, etc.
│   │   ├── schemas.ts                     # Re-export aller Schemas
│   │   └── handlers/
│   │       ├── ProductHandlers.ts         # Tool-Handler fuer Produkte
│   │       ├── CategoryHandlers.ts        # Tool-Handler fuer Kategorien
│   │       ├── ContentHandlers.ts         # Tool-Handler fuer Content-Generierung
│   │       └── HelperHandlers.ts          # Tool-Handler fuer Hilfsfunktionen
│   │
│   ├── core/
│   │   ├── domain/                        # Domain-Entities (reine Daten-Typen)
│   │   │   ├── Product.ts                 # Product, ProductVariant, Price
│   │   │   ├── Category.ts                # Category, CategoryTree
│   │   │   ├── Content.ts                 # ContentStyle, GeneratedContent
│   │   │   ├── Errors.ts                  # MCPError, ErrorCode enum
│   │   │   └── index.ts                   # Re-exports
│   │   │
│   │   └── services/                      # Business-Logik
│   │       ├── ProductService.ts          # Produkt-CRUD, Varianten-Verwaltung
│   │       ├── CategoryService.ts         # Kategorie-Abfragen, Baum-Traversierung
│   │       ├── ContentService.ts          # Style-Erkennung, Content-Generierung
│   │       ├── SnippetService.ts          # Snippet-Abfragen via API
│   │       └── WikiJsService.ts           # Wiki.js-Integration (Doku-Links)
│   │
│   └── infrastructure/
│       ├── shopware/
│       │   ├── ShopwareApiClient.ts       # OAuth2 + HTTP-Client fuer SW6 Admin API
│       │   ├── ShopwareAuthenticator.ts   # Token-Management (refresh, cache)
│       │   └── ShopwareRepository.ts      # Abstraktion ueber API-Calls
│       │
│       ├── wikijs/
│       │   └── WikiJsClient.ts            # GraphQL-Client fuer Wiki.js MCP
│       │
│       ├── cache/
│       │   └── InMemoryCache.ts           # TTL-basierter Cache (Kategorien, Properties)
│       │
│       └── logging/
│           └── Logger.ts                  # stderr-basiertes Logging (MCP-konform)
│
├── dist/                                  # Kompiliertes JavaScript
├── logs/                                  # Runtime-Logs (optional File-Logging)
│
├── .env                                   # Secrets (NICHT im Repo!)
├── .env.example                           # Template fuer .env
├── .gitignore
├── package.json
├── tsconfig.json
├── vitest.config.ts                       # Test-Konfiguration
└── README.md
```

---

## Shopware OAuth2 Integration

### Client Credentials Flow

Shopware 6 Admin API verwendet OAuth2 mit Client Credentials Grant:

```typescript
// infrastructure/shopware/ShopwareAuthenticator.ts
interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: 'Bearer';
}

export class ShopwareAuthenticator {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly logger: Logger
  ) {}

  async getAccessToken(): Promise<string> {
    // Token noch gueltig? (mit 60s Buffer)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    this.logger.debug('Requesting new OAuth2 token');

    const response = await fetch(`${this.baseUrl}/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new MCPError(
        `OAuth2 authentication failed: ${response.status}`,
        ErrorCode.AUTH_FAILED,
        false
      );
    }

    const data = (await response.json()) as TokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;

    this.logger.info('OAuth2 token acquired', {
      expiresIn: data.expires_in,
    });

    return this.accessToken;
  }
}
```

### API Client

```typescript
// infrastructure/shopware/ShopwareApiClient.ts
export class ShopwareApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly authenticator: ShopwareAuthenticator,
    private readonly logger: Logger
  ) {}

  async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const token = await this.authenticator.getAccessToken();

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error('Shopware API error', {
        status: response.status,
        endpoint,
        body: errorBody,
      });
      throw new MCPError(
        `Shopware API error: ${response.status} - ${errorBody}`,
        ErrorCode.API_ERROR,
        response.status >= 500 // recoverable bei Server-Fehlern
      );
    }

    return response.json() as Promise<T>;
  }

  // Convenience methods
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>('GET', endpoint);
  }

  async post<T>(endpoint: string, body: unknown): Promise<T> {
    return this.request<T>('POST', endpoint, body);
  }

  async patch<T>(endpoint: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', endpoint, body);
  }

  async delete(endpoint: string): Promise<void> {
    await this.request<void>('DELETE', endpoint);
  }
}
```

---

## Domain-Entities

### Product

```typescript
// core/domain/Product.ts
export interface Product {
  id: string;
  productNumber: string;
  name: string;
  description: string | null;
  active: boolean;
  price: Price[];
  stock: number;
  ean: string | null;
  manufacturerId: string | null;
  manufacturerName: string | null;
  categories: CategoryReference[];
  variants: ProductVariant[];
  properties: PropertyValue[];
  media: ProductMedia[];
  seoData: SeoData | null;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  productNumber: string;
  name: string;
  active: boolean;
  price: Price[];
  stock: number;
  options: VariantOption[];
}

export interface Price {
  currencyId: string;
  gross: number;
  net: number;
  linked: boolean;
}

export interface SeoData {
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string | null;
}

export interface CategoryReference {
  id: string;
  name: string;
  path: string; // z.B. "Software/OXID 7"
}

// Input fuer Produkt-Erstellung
export interface CreateProductInput {
  name: string;
  productNumber: string;
  price: number; // Brutto-Preis
  categoryId: string;
  description?: string;
  ean?: string;
  manufacturerId?: string;
  taxId?: string;
  stock?: number;
}
```

### Category

```typescript
// core/domain/Category.ts
export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  path: string; // z.B. "|root|software|oxid7|"
  breadcrumb: string[]; // ["Software", "OXID 7"]
  active: boolean;
  visible: boolean;
  productCount: number;
  description: string | null;
  seoData: SeoData | null;
  children: Category[];
}

export interface CategoryTree {
  root: Category;
  flatList: Category[];
}
```

### Content (Style-Profile)

```typescript
// core/domain/Content.ts
export type ContentStyle = 'creative' | 'software';

export interface StyleProfile {
  style: ContentStyle;
  tonality: string;
  addressing: 'du' | 'Sie';
  structure: string[];
  targetAudience: string;
  exampleIntro: string;
}

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

export interface GeneratedContent {
  description: string;
  style: ContentStyle;
  wordCount: number;
  generatedAt: string;
}

export interface GeneratedSeo {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  style: ContentStyle;
  generatedAt: string;
}

// Style-Mapping nach Kategorie-Pfad
export const CATEGORY_STYLE_MAP: Record<string, ContentStyle> = {
  'Software': 'software',
  'Stickdateien': 'creative',
  'Genaehtes': 'creative',
  '3D-Druck': 'creative',
};
```

### Errors

```typescript
// core/domain/Errors.ts
export enum ErrorCode {
  // Auth
  AUTH_FAILED = 'AUTH_FAILED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  // API
  API_ERROR = 'API_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  NOT_FOUND = 'NOT_FOUND',

  // Validation
  INVALID_INPUT = 'INVALID_INPUT',
  PRODUCT_NUMBER_EXISTS = 'PRODUCT_NUMBER_EXISTS',

  // Content
  STYLE_DETECTION_FAILED = 'STYLE_DETECTION_FAILED',
  CONTENT_GENERATION_FAILED = 'CONTENT_GENERATION_FAILED',

  // Wiki
  WIKI_PAGE_NOT_FOUND = 'WIKI_PAGE_NOT_FOUND',

  // Internal
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export class MCPError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly recoverable: boolean,
    public readonly suggestion?: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MCPError';
  }

  toResponse(): MCPErrorResponse {
    return {
      error: true,
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      suggestion: this.suggestion,
      context: this.context,
    };
  }
}
```

---

## Zod-Schemas fuer Tool-Inputs

### Product Schemas

```typescript
// application/schemas/ProductSchemas.ts
import { z } from 'zod';

// product_create
export const ProductCreateInput = z.object({
  name: z.string().min(1).max(255).describe('Produktname'),
  productNumber: z.string().min(1).max(64).describe('Artikelnummer (eindeutig)'),
  price: z.number().positive().describe('Brutto-Preis in EUR'),
  categoryId: z.string().uuid().describe('Kategorie-ID'),
  description: z.string().max(65535).optional().describe('Produktbeschreibung (HTML)'),
  ean: z.string().max(50).optional().describe('EAN/GTIN'),
  manufacturerId: z.string().uuid().optional().describe('Hersteller-ID'),
  taxId: z.string().uuid().optional().describe('Steuer-ID (Standard: 19%)'),
  stock: z.number().int().nonnegative().default(0).describe('Lagerbestand'),
});
export type ProductCreateInput = z.infer<typeof ProductCreateInput>;

// product_get
export const ProductGetInput = z.object({
  id: z.string().uuid().optional().describe('Produkt-ID'),
  productNumber: z.string().optional().describe('Artikelnummer'),
}).refine(
  (data) => data.id || data.productNumber,
  { message: 'Entweder id oder productNumber muss angegeben werden' }
);
export type ProductGetInput = z.infer<typeof ProductGetInput>;

// product_list
export const ProductListInput = z.object({
  categoryId: z.string().uuid().optional().describe('Filter nach Kategorie'),
  active: z.boolean().optional().describe('Filter: nur aktive/inaktive'),
  search: z.string().max(255).optional().describe('Suchbegriff (Name, Artikelnr.)'),
  limit: z.number().int().min(1).max(100).default(25).describe('Max. Ergebnisse'),
  offset: z.number().int().min(0).default(0).describe('Offset fuer Paginierung'),
});
export type ProductListInput = z.infer<typeof ProductListInput>;

// product_set_active
export const ProductSetActiveInput = z.object({
  id: z.string().uuid().describe('Produkt-ID'),
  active: z.boolean().describe('Neuer Aktiv-Status'),
});
export type ProductSetActiveInput = z.infer<typeof ProductSetActiveInput>;

// product_update
export const ProductUpdateInput = z.object({
  id: z.string().uuid().describe('Produkt-ID'),
  name: z.string().min(1).max(255).optional().describe('Neuer Produktname'),
  price: z.number().positive().optional().describe('Neuer Preis'),
  description: z.string().max(65535).optional().describe('Neue Beschreibung'),
  ean: z.string().max(50).optional().describe('Neue EAN'),
  stock: z.number().int().nonnegative().optional().describe('Neuer Bestand'),
  manufacturerId: z.string().uuid().optional().describe('Neue Hersteller-ID'),
});
export type ProductUpdateInput = z.infer<typeof ProductUpdateInput>;

// search_products
export const SearchProductsInput = z.object({
  query: z.string().min(2).max(255).describe('Suchbegriff'),
  limit: z.number().int().min(1).max(50).default(20).describe('Max. Ergebnisse'),
});
export type SearchProductsInput = z.infer<typeof SearchProductsInput>;
```

### Category Schemas

```typescript
// application/schemas/CategorySchemas.ts
import { z } from 'zod';

// category_list
export const CategoryListInput = z.object({
  parentId: z.string().uuid().optional().describe('Nur Kinder dieser Kategorie'),
  depth: z.number().int().min(1).max(10).default(3).describe('Tiefe des Baums'),
  includeInactive: z.boolean().default(false).describe('Inaktive einbeziehen'),
});
export type CategoryListInput = z.infer<typeof CategoryListInput>;

// category_get
export const CategoryGetInput = z.object({
  id: z.string().uuid().describe('Kategorie-ID'),
  includeProducts: z.boolean().default(false).describe('Produkte einbeziehen'),
  productLimit: z.number().int().min(1).max(100).default(25).describe('Max. Produkte'),
});
export type CategoryGetInput = z.infer<typeof CategoryGetInput>;

// category_generate_content
export const CategoryGenerateContentInput = z.object({
  id: z.string().uuid().describe('Kategorie-ID'),
  style: z.enum(['creative', 'software']).optional().describe('Stil (auto-detect wenn leer)'),
  maxLength: z.number().int().min(100).max(2000).default(500).describe('Max. Zeichenlaenge'),
});
export type CategoryGenerateContentInput = z.infer<typeof CategoryGenerateContentInput>;
```

### Content Schemas

```typescript
// application/schemas/ContentSchemas.ts
import { z } from 'zod';

// product_generate_content
export const ProductGenerateContentInput = z.object({
  productId: z.string().uuid().describe('Produkt-ID'),
  style: z.enum(['creative', 'software']).optional().describe('Stil (auto-detect wenn leer)'),
  maxLength: z.number().int().min(200).max(5000).default(1000).describe('Max. Zeichenlaenge'),
  includeSnippets: z.boolean().default(true).describe('Snippets einbinden (nur software)'),
  snippetIds: z.array(z.string()).optional().describe('Spezifische Snippet-IDs'),
});
export type ProductGenerateContentInput = z.infer<typeof ProductGenerateContentInput>;

// product_generate_seo
export const ProductGenerateSeoInput = z.object({
  productId: z.string().uuid().describe('Produkt-ID'),
  style: z.enum(['creative', 'software']).optional().describe('Stil (auto-detect wenn leer)'),
  maxTitleLength: z.number().int().min(30).max(70).default(60).describe('Max. Title-Laenge'),
  maxDescriptionLength: z.number().int().min(100).max(160).default(155).describe('Max. Description-Laenge'),
});
export type ProductGenerateSeoInput = z.infer<typeof ProductGenerateSeoInput>;

// variant_generate_content
export const VariantGenerateContentInput = z.object({
  variantId: z.string().uuid().describe('Varianten-ID'),
  inheritFromParent: z.boolean().default(true).describe('Kontext vom Hauptartikel erben'),
  focusOnOptions: z.boolean().default(true).describe('Varianten-Optionen betonen'),
});
export type VariantGenerateContentInput = z.infer<typeof VariantGenerateContentInput>;

// content_update
export const ContentUpdateInput = z.object({
  productId: z.string().uuid().describe('Produkt-ID'),
  description: z.string().max(65535).optional().describe('Neue Beschreibung'),
  metaTitle: z.string().max(255).optional().describe('Meta-Title'),
  metaDescription: z.string().max(255).optional().describe('Meta-Description'),
  keywords: z.string().max(255).optional().describe('Keywords (komma-getrennt)'),
});
export type ContentUpdateInput = z.infer<typeof ContentUpdateInput>;
```

### Helper Schemas

```typescript
// application/schemas/HelperSchemas.ts
import { z } from 'zod';

// get_properties
export const GetPropertiesInput = z.object({
  groupId: z.string().uuid().optional().describe('Filter nach Eigenschaftsgruppe'),
});
export type GetPropertiesInput = z.infer<typeof GetPropertiesInput>;

// get_manufacturers
export const GetManufacturersInput = z.object({
  search: z.string().max(100).optional().describe('Suchbegriff'),
  limit: z.number().int().min(1).max(100).default(50).describe('Max. Ergebnisse'),
});
export type GetManufacturersInput = z.infer<typeof GetManufacturersInput>;

// snippet_list
export const SnippetListInput = z.object({
  activeOnly: z.boolean().default(true).describe('Nur aktive Snippets'),
  locale: z.enum(['de-DE', 'en-GB']).default('de-DE').describe('Sprache'),
});
export type SnippetListInput = z.infer<typeof SnippetListInput>;
```

---

## Service-Schicht

### ProductService

```typescript
// core/services/ProductService.ts
export class ProductService {
  constructor(
    private readonly api: ShopwareApiClient,
    private readonly cache: InMemoryCache,
    private readonly logger: Logger
  ) {}

  /**
   * Produkt erstellen - IMMER inaktiv!
   */
  async create(input: CreateProductInput): Promise<Product> {
    this.logger.info('Creating product', { productNumber: input.productNumber });

    // Pruefung: Artikelnummer existiert?
    const existing = await this.findByProductNumber(input.productNumber);
    if (existing) {
      throw new MCPError(
        `Artikelnummer ${input.productNumber} existiert bereits`,
        ErrorCode.PRODUCT_NUMBER_EXISTS,
        false,
        'Verwende eine andere Artikelnummer'
      );
    }

    // Standard-Tax-ID holen (19%)
    const taxId = input.taxId ?? await this.getDefaultTaxId();

    // Produkt via API erstellen
    const response = await this.api.post<{ data: { id: string } }>('/api/product', {
      name: input.name,
      productNumber: input.productNumber,
      stock: input.stock ?? 0,
      taxId,
      price: [{
        currencyId: await this.getDefaultCurrencyId(),
        gross: input.price,
        net: input.price / 1.19,
        linked: true,
      }],
      categories: [{ id: input.categoryId }],
      description: input.description,
      ean: input.ean,
      manufacturerId: input.manufacturerId,
      active: false, // IMMER inaktiv!
    });

    return this.getById(response.data.id);
  }

  async getById(id: string): Promise<Product> {
    const response = await this.api.get<ShopwareProductResponse>(
      `/api/product/${id}?` + new URLSearchParams({
        associations: JSON.stringify({
          categories: {},
          manufacturer: {},
          media: { sort: [{ field: 'position', order: 'ASC' }] },
          children: { associations: { options: { associations: { group: {} } } } },
          properties: { associations: { group: {} } },
        }),
      })
    );

    return this.mapToProduct(response.data);
  }

  async findByProductNumber(productNumber: string): Promise<Product | null> {
    const response = await this.api.post<ShopwareSearchResponse>('/api/search/product', {
      filter: [{ type: 'equals', field: 'productNumber', value: productNumber }],
      limit: 1,
    });

    if (response.data.length === 0) return null;
    return this.mapToProduct(response.data[0]);
  }

  async list(input: ProductListInput): Promise<{ products: Product[]; total: number }> {
    const filters: any[] = [];

    if (input.categoryId) {
      filters.push({ type: 'equals', field: 'categories.id', value: input.categoryId });
    }
    if (input.active !== undefined) {
      filters.push({ type: 'equals', field: 'active', value: input.active });
    }
    if (input.search) {
      filters.push({
        type: 'multi',
        operator: 'OR',
        queries: [
          { type: 'contains', field: 'name', value: input.search },
          { type: 'contains', field: 'productNumber', value: input.search },
        ],
      });
    }

    const response = await this.api.post<ShopwareSearchResponse>('/api/search/product', {
      filter: filters,
      limit: input.limit,
      page: Math.floor(input.offset / input.limit) + 1,
      associations: { categories: {}, manufacturer: {} },
    });

    return {
      products: response.data.map(this.mapToProduct.bind(this)),
      total: response.total,
    };
  }

  async setActive(id: string, active: boolean): Promise<Product> {
    await this.api.patch(`/api/product/${id}`, { active });
    return this.getById(id);
  }

  async update(input: ProductUpdateInput): Promise<Product> {
    const updateData: Record<string, unknown> = {};

    if (input.name) updateData.name = input.name;
    if (input.description) updateData.description = input.description;
    if (input.ean) updateData.ean = input.ean;
    if (input.stock !== undefined) updateData.stock = input.stock;
    if (input.manufacturerId) updateData.manufacturerId = input.manufacturerId;
    if (input.price) {
      updateData.price = [{
        currencyId: await this.getDefaultCurrencyId(),
        gross: input.price,
        net: input.price / 1.19,
        linked: true,
      }];
    }

    await this.api.patch(`/api/product/${input.id}`, updateData);
    return this.getById(input.id);
  }

  private async getDefaultTaxId(): Promise<string> {
    const cached = this.cache.get<string>('default-tax-id');
    if (cached) return cached;

    const response = await this.api.post<ShopwareSearchResponse>('/api/search/tax', {
      filter: [{ type: 'equals', field: 'taxRate', value: 19 }],
      limit: 1,
    });

    if (response.data.length === 0) {
      throw new MCPError('Standard-Steuersatz (19%) nicht gefunden', ErrorCode.NOT_FOUND, false);
    }

    const taxId = response.data[0].id;
    this.cache.set('default-tax-id', taxId, 3600000); // 1h
    return taxId;
  }

  private async getDefaultCurrencyId(): Promise<string> {
    const cached = this.cache.get<string>('default-currency-id');
    if (cached) return cached;

    const response = await this.api.post<ShopwareSearchResponse>('/api/search/currency', {
      filter: [{ type: 'equals', field: 'isoCode', value: 'EUR' }],
      limit: 1,
    });

    if (response.data.length === 0) {
      throw new MCPError('Waehrung EUR nicht gefunden', ErrorCode.NOT_FOUND, false);
    }

    const currencyId = response.data[0].id;
    this.cache.set('default-currency-id', currencyId, 3600000); // 1h
    return currencyId;
  }

  private mapToProduct(data: any): Product {
    // Mapping von Shopware API Response zu Domain-Entity
    return {
      id: data.id,
      productNumber: data.productNumber,
      name: data.name,
      description: data.description,
      active: data.active,
      price: data.price,
      stock: data.stock,
      ean: data.ean,
      manufacturerId: data.manufacturerId,
      manufacturerName: data.manufacturer?.name ?? null,
      categories: (data.categories ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        path: c.breadcrumb?.join('/') ?? c.name,
      })),
      variants: (data.children ?? []).map(this.mapToVariant.bind(this)),
      properties: (data.properties ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        groupName: p.group?.name,
      })),
      media: (data.media ?? []).map((m: any) => ({
        id: m.id,
        url: m.media?.url,
        alt: m.media?.alt,
        position: m.position,
      })),
      seoData: data.metaTitle || data.metaDescription ? {
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        keywords: data.keywords,
      } : null,
      customFields: data.customFields ?? {},
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  private mapToVariant(data: any): ProductVariant {
    return {
      id: data.id,
      productNumber: data.productNumber,
      name: data.name,
      active: data.active,
      price: data.price,
      stock: data.stock,
      options: (data.options ?? []).map((o: any) => ({
        id: o.id,
        name: o.name,
        groupName: o.group?.name,
      })),
    };
  }
}
```

### ContentService

```typescript
// core/services/ContentService.ts
export class ContentService {
  constructor(
    private readonly productService: ProductService,
    private readonly categoryService: CategoryService,
    private readonly snippetService: SnippetService,
    private readonly wikiService: WikiJsService,
    private readonly logger: Logger
  ) {}

  /**
   * Stil automatisch erkennen basierend auf Kategorie-Pfad
   */
  detectStyle(categoryPath: string): ContentStyle {
    for (const [prefix, style] of Object.entries(CATEGORY_STYLE_MAP)) {
      if (categoryPath.startsWith(prefix)) {
        return style;
      }
    }
    return 'creative'; // Default
  }

  /**
   * Produktbeschreibung generieren (liefert PROMPT zurueck, nicht den Text!)
   */
  async generateProductContentPrompt(
    productId: string,
    style?: ContentStyle,
    maxLength: number = 1000,
    includeSnippets: boolean = true
  ): Promise<GenerationPrompt> {
    const product = await this.productService.getById(productId);
    const category = product.categories[0];

    // Stil erkennen
    const effectiveStyle = style ?? this.detectStyle(category?.path ?? '');
    const profile = STYLE_PROFILES[effectiveStyle];

    // Basis-Kontext
    const context: ProductContext = {
      name: product.name,
      productNumber: product.productNumber,
      categoryPath: category?.path ?? 'Unbekannt',
      manufacturerName: product.manufacturerName,
      variants: product.variants.length,
      properties: product.properties.map(p => `${p.groupName}: ${p.name}`),
      existingDescription: product.description,
    };

    // Software-spezifisch: Wiki-Link und Snippets
    let wikiUrl: string | null = null;
    let availableSnippets: Snippet[] = [];

    if (effectiveStyle === 'software') {
      // Wiki.js pruefen
      const slug = this.generateWikiSlug(product.name);
      const system = this.detectSystem(category?.path ?? '');
      wikiUrl = await this.wikiService.checkPageExists(system, slug);

      // Snippets laden
      if (includeSnippets) {
        availableSnippets = await this.snippetService.list({ activeOnly: true, locale: 'de-DE' });
      }
    }

    return {
      style: effectiveStyle,
      profile,
      context,
      wikiUrl,
      availableSnippets,
      maxLength,
      prompt: this.buildPrompt(effectiveStyle, context, profile, wikiUrl, availableSnippets, maxLength),
    };
  }

  /**
   * SEO-Daten generieren (liefert PROMPT zurueck)
   */
  async generateSeoPrompt(
    productId: string,
    style?: ContentStyle,
    maxTitleLength: number = 60,
    maxDescriptionLength: number = 155
  ): Promise<SeoGenerationPrompt> {
    const product = await this.productService.getById(productId);
    const category = product.categories[0];
    const effectiveStyle = style ?? this.detectStyle(category?.path ?? '');
    const profile = STYLE_PROFILES[effectiveStyle];

    return {
      style: effectiveStyle,
      profile,
      product: {
        name: product.name,
        categoryPath: category?.path ?? '',
        description: product.description,
      },
      constraints: {
        maxTitleLength,
        maxDescriptionLength,
      },
      prompt: this.buildSeoPrompt(effectiveStyle, product, profile, maxTitleLength, maxDescriptionLength),
    };
  }

  private buildPrompt(
    style: ContentStyle,
    context: ProductContext,
    profile: StyleProfile,
    wikiUrl: string | null,
    snippets: Snippet[],
    maxLength: number
  ): string {
    if (style === 'creative') {
      return `Schreibe eine Produktbeschreibung im KREATIVEN Stil:

PRODUKT:
- Name: ${context.name}
- Kategorie: ${context.categoryPath}
- Eigenschaften: ${context.properties.join(', ') || 'keine'}
${context.manufacturerName ? `- Hersteller: ${context.manufacturerName}` : ''}

STIL-VORGABEN:
- Tonfall: ${profile.tonality}
- Anrede: ${profile.addressing}
- Zielgruppe: ${profile.targetAudience}
- Struktur: ${profile.structure.join(' -> ')}

BEISPIEL-EINSTIEG: "${profile.exampleIntro}"

Max. ${maxLength} Zeichen. HTML erlaubt (<p>, <ul>, <strong>).`;
    }

    // Software-Stil
    let prompt = `Schreibe eine Produktbeschreibung im SOFTWARE-Stil:

PRODUKT:
- Name: ${context.name}
- Artikelnummer: ${context.productNumber}
- Kategorie: ${context.categoryPath}
${context.manufacturerName ? `- Hersteller: ${context.manufacturerName}` : ''}

STIL-VORGABEN:
- Tonfall: ${profile.tonality}
- Anrede: ${profile.addressing}
- Zielgruppe: ${profile.targetAudience}
- Struktur: ${profile.structure.join(' -> ')}`;

    if (wikiUrl) {
      prompt += `\n\nDOKUMENTATION: ${wikiUrl} (als Link einbinden!)`;
    }

    if (snippets.length > 0) {
      prompt += `\n\nVERFUEGBARE SNIPPETS (einbinden via [[snippet:ID]]):\n`;
      snippets.forEach(s => {
        prompt += `- [[snippet:${s.identifier}]]: ${s.name}\n`;
      });
    }

    prompt += `\n\nMax. ${maxLength} Zeichen. HTML erlaubt.`;

    return prompt;
  }

  private buildSeoPrompt(
    style: ContentStyle,
    product: Product,
    profile: StyleProfile,
    maxTitle: number,
    maxDesc: number
  ): string {
    return `Generiere SEO-Daten fuer:

PRODUKT: ${product.name}
KATEGORIE: ${product.categories[0]?.path ?? 'Unbekannt'}
STIL: ${style} (${profile.addressing})
BESCHREIBUNG: ${product.description?.substring(0, 200) ?? 'keine'}

AUSGABE (JSON):
{
  "metaTitle": "max ${maxTitle} Zeichen, Produktname + USP",
  "metaDescription": "max ${maxDesc} Zeichen, Handlungsaufforderung",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}`;
  }

  private generateWikiSlug(productName: string): string {
    return productName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  private detectSystem(categoryPath: string): 'oxid7' | 'shopware6' | 'osticket' {
    if (categoryPath.includes('OXID')) return 'oxid7';
    if (categoryPath.includes('Shopware')) return 'shopware6';
    if (categoryPath.includes('osTicket')) return 'osticket';
    return 'shopware6'; // Default
  }
}
```

### SnippetService

```typescript
// core/services/SnippetService.ts
export interface Snippet {
  id: string;
  identifier: string;
  name: string;
  content: string;
  active: boolean;
}

export class SnippetService {
  constructor(
    private readonly api: ShopwareApiClient,
    private readonly cache: InMemoryCache,
    private readonly logger: Logger
  ) {}

  async list(input: SnippetListInput): Promise<Snippet[]> {
    const cacheKey = `snippets-${input.locale}-${input.activeOnly}`;
    const cached = this.cache.get<Snippet[]>(cacheKey);
    if (cached) return cached;

    const filters: any[] = [];
    if (input.activeOnly) {
      filters.push({ type: 'equals', field: 'active', value: true });
    }

    const response = await this.api.post<ShopwareSearchResponse>(
      '/api/search/mmd-product-snippet',
      {
        filter: filters,
        associations: { translations: {} },
      }
    );

    const snippets: Snippet[] = response.data.map((s: any) => ({
      id: s.id,
      identifier: s.identifier,
      name: s.translated?.name ?? s.name,
      content: s.translated?.content ?? s.content,
      active: s.active,
    }));

    this.cache.set(cacheKey, snippets, 300000); // 5 min
    return snippets;
  }

  async getByIdentifier(identifier: string): Promise<Snippet | null> {
    const all = await this.list({ activeOnly: false, locale: 'de-DE' });
    return all.find(s => s.identifier === identifier) ?? null;
  }
}
```

### WikiJsService

```typescript
// core/services/WikiJsService.ts
export class WikiJsService {
  private readonly baseUrl = 'https://faq.markus-michalski.net';

  constructor(private readonly logger: Logger) {}

  /**
   * Prueft ob eine Wiki-Seite existiert und liefert die URL
   */
  async checkPageExists(
    system: 'oxid7' | 'shopware6' | 'osticket',
    slug: string,
    locale: 'de' | 'en' = 'de'
  ): Promise<string | null> {
    const path = `${locale}/${system}/${slug}`;
    const url = `${this.baseUrl}/${path}`;

    try {
      // HEAD-Request um Existenz zu pruefen (kein Body laden)
      const response = await fetch(url, { method: 'HEAD' });

      if (response.ok) {
        this.logger.debug('Wiki page found', { url });
        return url;
      }

      this.logger.debug('Wiki page not found', { url, status: response.status });
      return null;
    } catch (error) {
      this.logger.warn('Wiki check failed', { url, error: String(error) });
      return null;
    }
  }

  /**
   * Generiert erwarteten Wiki-Pfad fuer ein Produkt
   */
  buildExpectedUrl(system: 'oxid7' | 'shopware6' | 'osticket', slug: string): string {
    return `${this.baseUrl}/de/${system}/${slug}`;
  }
}
```

---

## MCP Tool-Definitionen

### index.ts (Auszug)

```typescript
// src/index.ts
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // === PRODUKTE ===
    {
      name: 'product_create',
      description: 'Neuen Hauptartikel anlegen (wird IMMER inaktiv erstellt)',
      inputSchema: zodToJsonSchema(ProductCreateInput),
    },
    {
      name: 'product_get',
      description: 'Produkt mit allen Details abrufen (inkl. Varianten, Media, Properties)',
      inputSchema: zodToJsonSchema(ProductGetInput),
    },
    {
      name: 'product_list',
      description: 'Produkte auflisten mit optionalen Filtern',
      inputSchema: zodToJsonSchema(ProductListInput),
    },
    {
      name: 'product_set_active',
      description: 'Produkt aktivieren oder deaktivieren',
      inputSchema: zodToJsonSchema(ProductSetActiveInput),
    },
    {
      name: 'product_update',
      description: 'Produkt-Stammdaten aendern',
      inputSchema: zodToJsonSchema(ProductUpdateInput),
    },
    {
      name: 'search_products',
      description: 'Volltextsuche ueber Produkte',
      inputSchema: zodToJsonSchema(SearchProductsInput),
    },

    // === CONTENT-GENERIERUNG ===
    {
      name: 'product_generate_content',
      description: 'Generiert einen Prompt fuer die Produktbeschreibung mit automatischer Stil-Erkennung',
      inputSchema: zodToJsonSchema(ProductGenerateContentInput),
    },
    {
      name: 'product_generate_seo',
      description: 'Generiert einen Prompt fuer Meta-Title und Meta-Description',
      inputSchema: zodToJsonSchema(ProductGenerateSeoInput),
    },
    {
      name: 'variant_generate_content',
      description: 'Generiert einen Prompt fuer Varianten-Beschreibung (erbt Hauptartikel-Kontext)',
      inputSchema: zodToJsonSchema(VariantGenerateContentInput),
    },
    {
      name: 'content_update',
      description: 'Speichert generierte Beschreibung/SEO-Daten im Shop',
      inputSchema: zodToJsonSchema(ContentUpdateInput),
    },

    // === KATEGORIEN ===
    {
      name: 'category_list',
      description: 'Kategoriebaum abrufen',
      inputSchema: zodToJsonSchema(CategoryListInput),
    },
    {
      name: 'category_get',
      description: 'Kategorie-Details inkl. optional Produkte',
      inputSchema: zodToJsonSchema(CategoryGetInput),
    },
    {
      name: 'category_generate_content',
      description: 'Generiert SEO-Text-Prompt fuer Kategorie',
      inputSchema: zodToJsonSchema(CategoryGenerateContentInput),
    },

    // === HILFSFUNKTIONEN ===
    {
      name: 'get_properties',
      description: 'Verfuegbare Eigenschaften/Optionen abrufen',
      inputSchema: zodToJsonSchema(GetPropertiesInput),
    },
    {
      name: 'get_manufacturers',
      description: 'Hersteller auflisten',
      inputSchema: zodToJsonSchema(GetManufacturersInput),
    },
    {
      name: 'snippet_list',
      description: 'Verfuegbare Produkt-Snippets abrufen (fuer Software-Beschreibungen)',
      inputSchema: zodToJsonSchema(SnippetListInput),
    },
  ],
}));
```

---

## Konfiguration

### .env.example

```bash
# Shopware 6 Admin API
SHOPWARE_URL=https://shop.markus-michalski.net
SHOPWARE_CLIENT_ID=SWIA...
SHOPWARE_CLIENT_SECRET=...

# Wiki.js (nur Base-URL, Zugriff via Head-Request)
WIKIJS_BASE_URL=https://faq.markus-michalski.net

# Cache Settings
CACHE_TTL_CATEGORIES=3600000    # 1h in ms
CACHE_TTL_PROPERTIES=3600000    # 1h in ms
CACHE_TTL_SNIPPETS=300000       # 5min in ms

# Logging
LOG_LEVEL=info                  # debug, info, warn, error
```

### Configuration.ts

```typescript
// config/Configuration.ts
export interface Config {
  shopware: {
    url: string;
    clientId: string;
    clientSecret: string;
  };
  wikijs: {
    baseUrl: string;
  };
  cache: {
    ttlCategories: number;
    ttlProperties: number;
    ttlSnippets: number;
  };
  logLevel: LogLevel;
}

export function loadConfig(): Config {
  const required = (key: string): string => {
    const value = process.env[key];
    if (!value) throw new Error(`Missing required env: ${key}`);
    return value;
  };

  return {
    shopware: {
      url: required('SHOPWARE_URL'),
      clientId: required('SHOPWARE_CLIENT_ID'),
      clientSecret: required('SHOPWARE_CLIENT_SECRET'),
    },
    wikijs: {
      baseUrl: process.env['WIKIJS_BASE_URL'] ?? 'https://faq.markus-michalski.net',
    },
    cache: {
      ttlCategories: parseInt(process.env['CACHE_TTL_CATEGORIES'] ?? '3600000'),
      ttlProperties: parseInt(process.env['CACHE_TTL_PROPERTIES'] ?? '3600000'),
      ttlSnippets: parseInt(process.env['CACHE_TTL_SNIPPETS'] ?? '300000'),
    },
    logLevel: (process.env['LOG_LEVEL'] as LogLevel) ?? 'info',
  };
}
```

---

## Deployment

### package.json

```json
{
  "name": "claude-mcp-shopwareadmin",
  "version": "0.1.0",
  "description": "MCP Server for Shopware 6 product and content management via Claude Code",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "claude-mcp-shopwareadmin": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit",
    "deploy": "npm run build && ./scripts/deploy.sh"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0",
    "zod-to-json-schema": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "eslint": "^9.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### Registrierung bei Claude Code

```bash
# Build
cd /home/markus-michalski/projekte/claude-mcp-shopwareadmin
npm run build

# Deploy
mkdir -p ~/.claude/mcp-servers/shopwareadmin
cp -r dist node_modules package.json .env ~/.claude/mcp-servers/shopwareadmin/

# Registrieren (GLOBAL)
claude mcp add --scope user --transport stdio shopwareadmin -- \
  node ~/.claude/mcp-servers/shopwareadmin/dist/index.js

# Verify
claude mcp list
```

---

## Sicherheitsaspekte

1. **Produkte IMMER inaktiv erstellen** - Verhindert versehentliche Veroeffentlichung
2. **OAuth2 Token-Caching** - Minimiert Auth-Requests
3. **Keine DELETE-Operationen** - Nur CRUD ohne Loeschen
4. **Rate-Limiting beachten** - Shopware API hat Limits
5. **.env nicht im Repo** - Credentials nur lokal

---

## Naechste Schritte (Implementierung)

1. **Phase 1:** Grundgeruest
   - Project setup (package.json, tsconfig.json)
   - Configuration + Logger
   - ShopwareApiClient + OAuth2

2. **Phase 2:** Produkt-Tools
   - ProductService implementieren
   - product_create, product_get, product_list
   - product_update, product_set_active, search_products

3. **Phase 3:** Content-Generierung
   - ContentService mit Stil-Erkennung
   - SnippetService
   - WikiJsService
   - product_generate_content, product_generate_seo

4. **Phase 4:** Kategorien + Helpers
   - CategoryService
   - category_list, category_get, category_generate_content
   - get_properties, get_manufacturers, snippet_list

5. **Phase 5:** Tests + Deployment
   - Unit-Tests fuer Services
   - Integration-Test mit Mock-API
   - Deployment + Registrierung
