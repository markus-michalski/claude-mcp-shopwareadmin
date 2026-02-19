/**
 * Tests for OrderService
 *
 * Tests all 3 order methods with MSW mocking:
 * - list: List orders with status/payment/delivery/email/date filters
 * - get: Get full order by ID or orderNumber (with caching)
 * - stats: Get aggregated statistics via Shopware aggregations API
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/setup.js';
import { BASE_URL } from '../../test/handlers.js';
import { createMockLogger } from '../../test/fixtures.js';
import { OrderService } from './OrderService.js';
import { ShopwareApiClient } from '../../infrastructure/shopware/ShopwareApiClient.js';
import { ShopwareAuthenticator } from '../../infrastructure/shopware/ShopwareAuthenticator.js';
import { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import type { Logger } from '../../infrastructure/logging/Logger.js';

// =============================================================================
// Mock Order Data
// =============================================================================

const MOCK_ORDER_ID = 'aabbcc1122334455aabbcc1122334455';
const MOCK_ORDER_NUMBER = '10001';

const MOCK_ORDER = {
  id: MOCK_ORDER_ID,
  orderNumber: MOCK_ORDER_NUMBER,
  orderDateTime: '2025-01-15T10:30:00.000Z',
  amountTotal: 297.81,
  amountNet: 250.26,
  shippingTotal: 5.90,
  customerComment: null,
  createdAt: '2025-01-15T10:30:00.000Z',
  updatedAt: '2025-01-15T10:31:00.000Z',
  currency: {
    symbol: '€',
    shortName: 'EUR',
  },
  stateMachineState: {
    technicalName: 'open',
    name: 'Offen',
  },
  orderCustomer: {
    email: 'max.mustermann@example.com',
    firstName: 'Max',
    lastName: 'Mustermann',
    customerNumber: 'K-10001',
    company: null,
  },
  billingAddress: {
    firstName: 'Max',
    lastName: 'Mustermann',
    street: 'Musterstrasse 1',
    zipcode: '12345',
    city: 'Musterstadt',
    company: null,
    phoneNumber: '+49 123 456789',
    country: { name: 'Deutschland' },
  },
  salesChannel: {
    name: 'Storefront',
  },
  lineItems: [
    {
      id: 'li-001',
      label: 'Gallery-Modul OXID 7',
      quantity: 1,
      unitPrice: 149.00,
      totalPrice: 149.00,
      type: 'product',
      productId: 'prod-gallery-uuid',
      position: 1,
      product: { productNumber: 'MM-GALLERY-7' },
    },
    {
      id: 'li-002',
      label: 'Sitemap-Generator OXID 7',
      quantity: 2,
      unitPrice: 79.00,
      totalPrice: 158.00,
      type: 'product',
      productId: 'prod-sitemap-uuid',
      position: 2,
      product: { productNumber: 'MM-SITEMAP-7' },
    },
    {
      id: 'li-003',
      label: 'Versand',
      quantity: 1,
      unitPrice: 5.90,
      totalPrice: 5.90,
      type: 'delivery',
      productId: null,
      position: 3,
      product: null,
    },
  ],
  transactions: [
    {
      id: 'tx-001',
      amount: { totalPrice: 297.81 },
      stateMachineState: {
        technicalName: 'paid',
        name: 'Bezahlt',
      },
      paymentMethod: { name: 'PayPal' },
    },
  ],
  deliveries: [
    {
      id: 'del-001',
      trackingCodes: ['DHL12345678901'],
      shippingCosts: { totalPrice: 5.90 },
      stateMachineState: {
        technicalName: 'shipped',
        name: 'Versendet',
      },
      shippingMethod: { name: 'DHL Standard' },
      shippingOrderAddress: {
        firstName: 'Max',
        lastName: 'Mustermann',
        street: 'Musterstrasse 1',
        zipcode: '12345',
        city: 'Musterstadt',
        company: null,
        phoneNumber: null,
        country: { name: 'Deutschland' },
      },
    },
  ],
};

const MOCK_ORDER_CANCELLED = {
  id: 'cc001122334455667788990011223344',
  orderNumber: '10002',
  orderDateTime: '2025-01-10T09:00:00.000Z',
  amountTotal: 79.00,
  amountNet: 66.39,
  shippingTotal: 0,
  customerComment: 'Bitte stornieren',
  createdAt: '2025-01-10T09:00:00.000Z',
  updatedAt: '2025-01-12T14:00:00.000Z',
  currency: { symbol: '€', shortName: 'EUR' },
  stateMachineState: {
    technicalName: 'cancelled',
    name: 'Storniert',
  },
  orderCustomer: {
    email: 'anna.schmidt@example.com',
    firstName: 'Anna',
    lastName: 'Schmidt',
    customerNumber: 'K-10002',
    company: 'Schmidt GmbH',
  },
  billingAddress: {
    firstName: 'Anna',
    lastName: 'Schmidt',
    street: 'Hauptstrasse 99',
    zipcode: '54321',
    city: 'Hauptstadt',
    company: 'Schmidt GmbH',
    phoneNumber: null,
    country: { name: 'Deutschland' },
  },
  salesChannel: { name: 'Storefront' },
  lineItems: [
    {
      id: 'li-010',
      label: 'Sitemap-Generator OXID 7',
      quantity: 1,
      unitPrice: 79.00,
      totalPrice: 79.00,
      type: 'product',
      productId: 'prod-sitemap-uuid',
      position: 1,
      product: { productNumber: 'MM-SITEMAP-7' },
    },
  ],
  transactions: [
    {
      id: 'tx-010',
      amount: { totalPrice: 79.00 },
      stateMachineState: {
        technicalName: 'refunded',
        name: 'Erstattet',
      },
      paymentMethod: { name: 'Kreditkarte' },
    },
  ],
  deliveries: [
    {
      id: 'del-010',
      trackingCodes: [],
      shippingCosts: { totalPrice: 0 },
      stateMachineState: {
        technicalName: 'cancelled',
        name: 'Storniert',
      },
      shippingMethod: { name: 'DHL Standard' },
      shippingOrderAddress: null,
    },
  ],
};

const MOCK_ORDER_LIST = [MOCK_ORDER, MOCK_ORDER_CANCELLED];

// Aggregation response as returned by Shopware's API
const MOCK_AGGREGATIONS_RESPONSE = {
  data: [MOCK_ORDER],
  total: 42,
  aggregations: {
    totalOrders: { count: 42 },
    totalRevenue: { sum: 12345.67 },
    avgOrderValue: { avg: 294.18 },
    orderStatus: {
      buckets: [
        { key: 'open', count: 10 },
        { key: 'completed', count: 28 },
        { key: 'cancelled', count: 4 },
      ],
    },
    paymentStatus: {
      buckets: [
        { key: 'paid', count: 35 },
        { key: 'open', count: 5 },
        { key: 'refunded', count: 2 },
      ],
    },
  },
};

// =============================================================================
// Default MSW handlers for order endpoints
// =============================================================================

const orderSearchHandler = http.post(`${BASE_URL}/api/search/order`, async ({ request }) => {
  const body = await request.json() as Record<string, unknown>;

  // ID-based lookup
  if (Array.isArray(body.ids)) {
    const ids = body.ids as string[];
    const found = MOCK_ORDER_LIST.filter((o) => ids.includes(o.id));
    return HttpResponse.json({ data: found, total: found.length });
  }

  // Filter-based lookup
  const filters = body.filter as Array<{ type: string; field: string; value?: unknown }> | undefined;
  const orderNumberFilter = filters?.find((f) => f.field === 'orderNumber');
  if (orderNumberFilter?.value === MOCK_ORDER_NUMBER) {
    return HttpResponse.json({ data: [MOCK_ORDER], total: 1 });
  }
  if (orderNumberFilter?.value === 'NOT-EXISTS') {
    return HttpResponse.json({ data: [], total: 0 });
  }

  return HttpResponse.json({ data: MOCK_ORDER_LIST, total: MOCK_ORDER_LIST.length });
});

// =============================================================================
// Test Suite
// =============================================================================

describe('OrderService', () => {
  let service: OrderService;
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
    service = new OrderService(client, cache, logger);

    // Register default order search handler
    server.use(orderSearchHandler);
  });

  // ===========================================================================
  // list() - List orders with filters
  // ===========================================================================
  describe('list', () => {
    it('should return paginated order list with defaults', async () => {
      const result = await service.list({ limit: 25, offset: 0 });

      expect(result.orders).toBeDefined();
      expect(Array.isArray(result.orders)).toBe(true);
      expect(result.total).toBeGreaterThan(0);
    });

    it('should map orders to lightweight OrderListItem objects', async () => {
      const result = await service.list({ limit: 25, offset: 0 });

      const order = result.orders[0];
      expect(order).toMatchObject({
        id: expect.any(String),
        orderNumber: expect.any(String),
        orderDateTime: expect.any(String),
        amountTotal: expect.any(Number),
        currencySymbol: expect.any(String),
        customerName: expect.any(String),
        customerEmail: expect.any(String),
        orderStatus: expect.any(String),
        orderStatusTechnicalName: expect.any(String),
        paymentStatus: expect.any(String),
        paymentStatusTechnicalName: expect.any(String),
        deliveryStatus: expect.any(String),
        deliveryStatusTechnicalName: expect.any(String),
        itemCount: expect.any(Number),
      });
    });

    it('should filter by orderStatus and send correct filter in request', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/order`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_ORDER], total: 1 });
        })
      );

      await service.list({ limit: 25, offset: 0, orderStatus: 'open' });

      const filters = capturedBody.filter as Array<{ type: string; field: string; value: unknown }>;
      const statusFilter = filters?.find((f) => f.field === 'stateMachineState.technicalName');
      expect(statusFilter).toBeDefined();
      expect(statusFilter?.type).toBe('equals');
      expect(statusFilter?.value).toBe('open');
    });

    it('should filter by paymentStatus', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/order`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_ORDER], total: 1 });
        })
      );

      await service.list({ limit: 25, offset: 0, paymentStatus: 'paid' });

      const filters = capturedBody.filter as Array<{ type: string; field: string; value: unknown }>;
      const paymentFilter = filters?.find(
        (f) => f.field === 'transactions.stateMachineState.technicalName'
      );
      expect(paymentFilter).toBeDefined();
      expect(paymentFilter?.value).toBe('paid');
    });

    it('should filter by deliveryStatus', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/order`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_ORDER], total: 1 });
        })
      );

      await service.list({ limit: 25, offset: 0, deliveryStatus: 'shipped' });

      const filters = capturedBody.filter as Array<{ type: string; field: string; value: unknown }>;
      const deliveryFilter = filters?.find(
        (f) => f.field === 'deliveries.stateMachineState.technicalName'
      );
      expect(deliveryFilter).toBeDefined();
      expect(deliveryFilter?.value).toBe('shipped');
    });

    it('should filter by customerEmail using contains filter', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/order`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_ORDER], total: 1 });
        })
      );

      await service.list({ limit: 25, offset: 0, customerEmail: 'max@example.com' });

      const filters = capturedBody.filter as Array<{ type: string; field: string; value: unknown }>;
      const emailFilter = filters?.find((f) => f.field === 'orderCustomer.email');
      expect(emailFilter).toBeDefined();
      expect(emailFilter?.type).toBe('contains');
      expect(emailFilter?.value).toBe('max@example.com');
    });

    it('should apply date range filter with gte/lte parameters', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/order`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_ORDER], total: 1 });
        })
      );

      await service.list({
        limit: 25,
        offset: 0,
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31',
      });

      const filters = capturedBody.filter as Array<{
        type: string;
        field: string;
        parameters?: { gte?: string; lte?: string };
      }>;
      const rangeFilter = filters?.find((f) => f.type === 'range');
      expect(rangeFilter).toBeDefined();
      expect(rangeFilter?.field).toBe('orderDateTime');
      expect(rangeFilter?.parameters?.gte).toBe('2025-01-01');
      expect(rangeFilter?.parameters?.lte).toBe('2025-01-31');
    });

    it('should apply only dateFrom when dateTo is omitted', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/order`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_ORDER], total: 1 });
        })
      );

      await service.list({ limit: 25, offset: 0, dateFrom: '2025-01-01' });

      const filters = capturedBody.filter as Array<{
        type: string;
        parameters?: { gte?: string; lte?: string };
      }>;
      const rangeFilter = filters?.find((f) => f.type === 'range');
      expect(rangeFilter?.parameters?.gte).toBe('2025-01-01');
      expect(rangeFilter?.parameters?.lte).toBeUndefined();
    });

    it('should sort results by orderDateTime descending', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/order`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: MOCK_ORDER_LIST, total: 2 });
        })
      );

      await service.list({ limit: 25, offset: 0 });

      const sort = capturedBody.sort as Array<{ field: string; order: string }>;
      expect(sort).toBeDefined();
      expect(sort[0]?.field).toBe('orderDateTime');
      expect(sort[0]?.order).toBe('DESC');
    });

    it('should count only product line items in itemCount (not delivery items)', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/order`, async () => {
          return HttpResponse.json({ data: [MOCK_ORDER], total: 1 });
        })
      );

      const result = await service.list({ limit: 25, offset: 0 });

      // MOCK_ORDER has 2 product items and 1 delivery item - only products count
      expect(result.orders[0].itemCount).toBe(2);
    });

    it('should return empty orders array when no results', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/order`, async () => {
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.list({ limit: 25, offset: 0 });

      expect(result.orders).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should handle missing orderCustomer gracefully (shows Unknown)', async () => {
      const orderWithoutCustomer = {
        ...MOCK_ORDER,
        orderCustomer: null,
      };

      server.use(
        http.post(`${BASE_URL}/api/search/order`, async () => {
          return HttpResponse.json({ data: [orderWithoutCustomer], total: 1 });
        })
      );

      const result = await service.list({ limit: 25, offset: 0 });

      expect(result.orders[0].customerName).toBe('Unknown');
      expect(result.orders[0].customerEmail).toBe('');
    });
  });

  // ===========================================================================
  // get() - Get full order by ID or orderNumber
  // ===========================================================================
  describe('get', () => {
    it('should get full order by ID', async () => {
      const result = await service.get({ id: MOCK_ORDER_ID });

      expect(result).not.toBeNull();
      expect(result?.id).toBe(MOCK_ORDER_ID);
      expect(result?.orderNumber).toBe(MOCK_ORDER_NUMBER);
    });

    it('should get full order by orderNumber', async () => {
      const result = await service.get({ orderNumber: MOCK_ORDER_NUMBER });

      expect(result).not.toBeNull();
      expect(result?.orderNumber).toBe(MOCK_ORDER_NUMBER);
    });

    it('should return null for non-existent orderNumber', async () => {
      const result = await service.get({ orderNumber: 'NOT-EXISTS' });

      expect(result).toBeNull();
    });

    it('should return null for non-existent ID', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/order`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          if (Array.isArray(body.ids) && body.ids.includes('00000000000000000000000000000000')) {
            return HttpResponse.json({ data: [], total: 0 });
          }
          return HttpResponse.json({ data: MOCK_ORDER_LIST, total: 2 });
        })
      );

      const result = await service.get({ id: '00000000000000000000000000000000' });

      expect(result).toBeNull();
    });

    it('should map full Order entity with all associations', async () => {
      const result = await service.get({ id: MOCK_ORDER_ID });

      expect(result).toMatchObject({
        id: MOCK_ORDER_ID,
        orderNumber: MOCK_ORDER_NUMBER,
        orderDateTime: expect.any(String),
        amountTotal: expect.any(Number),
        amountNet: expect.any(Number),
        shippingTotal: expect.any(Number),
        currencySymbol: '€',
        orderStatus: expect.any(String),
        orderStatusTechnicalName: 'open',
        paymentStatus: expect.any(String),
        paymentStatusTechnicalName: 'paid',
        deliveryStatus: expect.any(String),
        deliveryStatusTechnicalName: 'shipped',
        customer: expect.any(Object),
        billingAddress: expect.any(Object),
        shippingAddress: expect.any(Object),
        lineItems: expect.any(Array),
        transactions: expect.any(Array),
        deliveries: expect.any(Array),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('should map line items sorted by position', async () => {
      const result = await service.get({ id: MOCK_ORDER_ID });

      expect(result?.lineItems).toHaveLength(3);
      // Should be sorted by position
      expect(result?.lineItems[0].position).toBe(1);
      expect(result?.lineItems[1].position).toBe(2);
      expect(result?.lineItems[0].productNumber).toBe('MM-GALLERY-7');
    });

    it('should map transactions with payment method name', async () => {
      const result = await service.get({ id: MOCK_ORDER_ID });

      expect(result?.transactions).toHaveLength(1);
      expect(result?.transactions[0]).toMatchObject({
        id: 'tx-001',
        paymentMethodName: 'PayPal',
        amount: 297.81,
        status: 'Bezahlt',
        statusTechnicalName: 'paid',
      });
    });

    it('should map deliveries with tracking codes', async () => {
      const result = await service.get({ id: MOCK_ORDER_ID });

      expect(result?.deliveries).toHaveLength(1);
      expect(result?.deliveries[0]).toMatchObject({
        id: 'del-001',
        shippingMethodName: 'DHL Standard',
        trackingCodes: ['DHL12345678901'],
        shippingCosts: 5.90,
        status: 'Versendet',
        statusTechnicalName: 'shipped',
      });
    });

    it('should map billing and shipping addresses', async () => {
      const result = await service.get({ id: MOCK_ORDER_ID });

      expect(result?.billingAddress).toMatchObject({
        firstName: 'Max',
        lastName: 'Mustermann',
        street: 'Musterstrasse 1',
        zipcode: '12345',
        city: 'Musterstadt',
        country: 'Deutschland',
      });

      expect(result?.shippingAddress).toMatchObject({
        firstName: 'Max',
        lastName: 'Mustermann',
        city: 'Musterstadt',
      });
    });

    it('should use EUR as fallback currency symbol when currency is null', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/order`, async () => {
          return HttpResponse.json({
            data: [{ ...MOCK_ORDER, currency: null }],
            total: 1,
          });
        })
      );

      const result = await service.get({ id: MOCK_ORDER_ID });

      expect(result?.currencySymbol).toBe('EUR');
    });

    it('should cache order by both ID and orderNumber for 2 minutes', async () => {
      vi.useFakeTimers();

      // First fetch by ID
      await service.get({ id: MOCK_ORDER_ID });

      // Both ID and orderNumber should be cached - track subsequent requests
      let requestCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/search/order`, async () => {
          requestCount++;
          return HttpResponse.json({ data: [MOCK_ORDER], total: 1 });
        })
      );

      // Fetch by ID again - should hit cache
      await service.get({ id: MOCK_ORDER_ID });
      expect(requestCount).toBe(0);

      // Fetch by orderNumber - should also hit cache (stored with both keys)
      await service.get({ orderNumber: MOCK_ORDER_NUMBER });
      expect(requestCount).toBe(0);

      // Advance past 2 minute cache TTL
      vi.advanceTimersByTime(2 * 60 * 1000 + 1);

      // Now should make a new request
      await service.get({ id: MOCK_ORDER_ID });
      expect(requestCount).toBe(1);

      vi.useRealTimers();
    });

    it('should load detail associations (billingAddress, paymentMethod, shippingMethod)', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/order`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_ORDER], total: 1 });
        })
      );

      await service.get({ id: MOCK_ORDER_ID });

      const associations = capturedBody.associations as Record<string, unknown>;
      expect(associations).toBeDefined();
      expect(associations.billingAddress).toBeDefined();
      expect(associations.lineItems).toBeDefined();
      expect(associations.salesChannel).toBeDefined();
    });
  });

  // ===========================================================================
  // stats() - Aggregated order statistics via Shopware aggregations API
  // ===========================================================================
  describe('stats', () => {
    it('should return aggregated statistics from Shopware aggregations API', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/order`, async () => {
          return HttpResponse.json(MOCK_AGGREGATIONS_RESPONSE);
        })
      );

      const result = await service.stats({});

      expect(result).toMatchObject({
        totalOrders: 42,
        totalRevenue: 12345.67,
        averageOrderValue: 294.18,
        currencySymbol: '€',
        byOrderStatus: {
          open: 10,
          completed: 28,
          cancelled: 4,
        },
        byPaymentStatus: {
          paid: 35,
          open: 5,
          refunded: 2,
        },
        period: { from: null, to: null },
      });
    });

    it('should send aggregations in the search criteria', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/order`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json(MOCK_AGGREGATIONS_RESPONSE);
        })
      );

      await service.stats({});

      const aggregations = capturedBody.aggregations as Array<{ type: string; name: string; field: string }>;
      expect(aggregations).toBeDefined();
      expect(aggregations).toContainEqual(
        expect.objectContaining({ type: 'count', name: 'totalOrders' })
      );
      expect(aggregations).toContainEqual(
        expect.objectContaining({ type: 'sum', name: 'totalRevenue' })
      );
      expect(aggregations).toContainEqual(
        expect.objectContaining({ type: 'avg', name: 'avgOrderValue' })
      );
      expect(aggregations).toContainEqual(
        expect.objectContaining({ type: 'terms', name: 'orderStatus' })
      );
      expect(aggregations).toContainEqual(
        expect.objectContaining({ type: 'terms', name: 'paymentStatus' })
      );
    });

    it('should apply date range filter to aggregations request', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/order`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json(MOCK_AGGREGATIONS_RESPONSE);
        })
      );

      await service.stats({ dateFrom: '2025-01-01', dateTo: '2025-01-31' });

      const filters = capturedBody.filter as Array<{
        type: string;
        field: string;
        parameters?: { gte?: string; lte?: string };
      }>;
      const rangeFilter = filters?.find((f) => f.type === 'range');
      expect(rangeFilter).toBeDefined();
      expect(rangeFilter?.parameters?.gte).toBe('2025-01-01');
      expect(rangeFilter?.parameters?.lte).toBe('2025-01-31');
    });

    it('should include date range in period field of result', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/order`, async () => {
          return HttpResponse.json(MOCK_AGGREGATIONS_RESPONSE);
        })
      );

      const result = await service.stats({
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31',
      });

      expect(result.period.from).toBe('2025-01-01');
      expect(result.period.to).toBe('2025-01-31');
    });

    it('should fall back to response.total when totalOrders aggregation is missing', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/order`, async () => {
          return HttpResponse.json({
            data: [],
            total: 17,
            aggregations: {
              // totalOrders is missing
              totalRevenue: { sum: 5000.00 },
              avgOrderValue: { avg: 294.12 },
              orderStatus: { buckets: [] },
              paymentStatus: { buckets: [] },
            },
          });
        })
      );

      const result = await service.stats({});

      expect(result.totalOrders).toBe(17);
    });

    it('should fall back to 0 revenue when totalRevenue aggregation is missing', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/order`, async () => {
          return HttpResponse.json({
            data: [],
            total: 5,
            aggregations: {
              totalOrders: { count: 5 },
              // totalRevenue is missing
              avgOrderValue: { avg: 100.00 },
              orderStatus: { buckets: [] },
              paymentStatus: { buckets: [] },
            },
          });
        })
      );

      const result = await service.stats({});

      expect(result.totalRevenue).toBe(0);
    });

    it('should compute avgOrderValue from totalRevenue/totalOrders when avg aggregation missing', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/order`, async () => {
          return HttpResponse.json({
            data: [],
            total: 4,
            aggregations: {
              totalOrders: { count: 4 },
              totalRevenue: { sum: 400.00 },
              // avgOrderValue is missing
              orderStatus: { buckets: [] },
              paymentStatus: { buckets: [] },
            },
          });
        })
      );

      const result = await service.stats({});

      expect(result.averageOrderValue).toBe(100.00);
    });

    it('should return 0 averageOrderValue when no orders exist', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/order`, async () => {
          return HttpResponse.json({
            data: [],
            total: 0,
            aggregations: {
              totalOrders: { count: 0 },
              totalRevenue: { sum: 0 },
              // avgOrderValue missing, totalOrders = 0 -> cannot divide
              orderStatus: { buckets: [] },
              paymentStatus: { buckets: [] },
            },
          });
        })
      );

      const result = await service.stats({});

      expect(result.averageOrderValue).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.totalOrders).toBe(0);
    });

    it('should return empty status breakdowns when aggregations is completely missing', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/order`, async () => {
          return HttpResponse.json({
            data: [],
            total: 0,
            // aggregations field entirely absent
          });
        })
      );

      const result = await service.stats({});

      expect(result.byOrderStatus).toEqual({});
      expect(result.byPaymentStatus).toEqual({});
      expect(result.totalOrders).toBe(0);
      expect(result.totalRevenue).toBe(0);
    });

    it('should round totalRevenue and averageOrderValue to 2 decimal places', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/order`, async () => {
          return HttpResponse.json({
            data: [MOCK_ORDER],
            total: 3,
            aggregations: {
              totalOrders: { count: 3 },
              totalRevenue: { sum: 100.12345 },
              avgOrderValue: { avg: 33.37815 },
              orderStatus: { buckets: [] },
              paymentStatus: { buckets: [] },
            },
          });
        })
      );

      const result = await service.stats({});

      expect(result.totalRevenue).toBe(100.12);
      expect(result.averageOrderValue).toBe(33.38);
    });

    it('should use EUR as fallback currency symbol when no orders in data', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/order`, async () => {
          return HttpResponse.json({
            data: [], // no orders -> no currency reference
            total: 0,
            aggregations: {
              totalOrders: { count: 0 },
              totalRevenue: { sum: 0 },
              avgOrderValue: { avg: 0 },
              orderStatus: { buckets: [] },
              paymentStatus: { buckets: [] },
            },
          });
        })
      );

      const result = await service.stats({});

      expect(result.currencySymbol).toBe('EUR');
    });

    it('should return period with null values when no date range specified', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/order`, async () => {
          return HttpResponse.json(MOCK_AGGREGATIONS_RESPONSE);
        })
      );

      const result = await service.stats({});

      expect(result.period.from).toBeNull();
      expect(result.period.to).toBeNull();
    });
  });
});
