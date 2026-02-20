/**
 * Tests for FlowService
 *
 * Tests all 3 flow methods with TDD approach:
 * - list:   List flows with filters (eventName, active, hasMailAction, search)
 * - get:    Get flow by ID or name with all sequences and hierarchy (+ cache)
 * - toggle: Activate/deactivate a flow (+ cache invalidation)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/setup.js';
import { BASE_URL } from '../../test/handlers.js';
import { createMockLogger } from '../../test/fixtures.js';
import { FlowService } from './FlowService.js';
import { ShopwareApiClient } from '../../infrastructure/shopware/ShopwareApiClient.js';
import { ShopwareAuthenticator } from '../../infrastructure/shopware/ShopwareAuthenticator.js';
import { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import { MCPError, ErrorCode } from '../domain/Errors.js';
import type { Logger } from '../../infrastructure/logging/Logger.js';

// =============================================================================
// Mock fixtures
// =============================================================================

const MOCK_FLOW_ID = 'flow000011112222333344445555666';
const MOCK_FLOW_ID_2 = 'flow111122223333444455556666777';

const MOCK_SEQUENCE_ROOT = {
  id: 'seq0000111122223333444455556666',
  parentId: null,
  flowId: MOCK_FLOW_ID,
  ruleId: null,
  actionName: 'action.mail.send',
  config: { mailTemplateId: 'tpl000011112222333344445555666' },
  position: 1,
  displayGroup: 1,
  trueCase: true,
  rule: null,
};

const MOCK_SEQUENCE_CHILD = {
  id: 'seq1111222233334444555566667777',
  parentId: 'seq0000111122223333444455556666',
  flowId: MOCK_FLOW_ID,
  ruleId: 'rule111122223333444455556666777',
  actionName: null,
  config: null,
  position: 2,
  displayGroup: 1,
  trueCase: false,
  rule: {
    id: 'rule111122223333444455556666777',
    name: 'Customer is VIP',
    priority: 100,
  },
};

const MOCK_FLOW_RAW = {
  id: MOCK_FLOW_ID,
  name: 'Bestellbestaetigung senden',
  eventName: 'checkout.order.placed',
  priority: 1,
  active: true,
  invalid: false,
  description: 'Sendet eine Bestellbestaetigung an den Kunden',
  createdAt: '2025-01-01T10:00:00.000Z',
  updatedAt: '2025-01-15T12:00:00.000Z',
  sequences: [MOCK_SEQUENCE_ROOT, MOCK_SEQUENCE_CHILD],
};

const MOCK_FLOW_RAW_2 = {
  id: MOCK_FLOW_ID_2,
  name: 'Konto registriert',
  eventName: 'customer.register',
  priority: 5,
  active: false,
  invalid: false,
  description: null,
  createdAt: '2025-01-02T10:00:00.000Z',
  updatedAt: null,
  sequences: [
    {
      id: 'seq2222333344445555666677778888',
      parentId: null,
      flowId: MOCK_FLOW_ID_2,
      ruleId: null,
      actionName: 'action.add.order.tag',
      config: { tagIds: ['tag-uuid-1'] },
      position: 1,
      displayGroup: 1,
      trueCase: true,
      rule: null,
    },
  ],
};

// =============================================================================
// Default MSW handler for flow search
// =============================================================================

function defaultFlowSearchHandler() {
  return http.post(`${BASE_URL}/api/search/flow`, () => {
    return HttpResponse.json({
      data: [MOCK_FLOW_RAW, MOCK_FLOW_RAW_2],
      total: 2,
    });
  });
}

// =============================================================================
// Test suite
// =============================================================================

describe('FlowService', () => {
  let service: FlowService;
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
    service = new FlowService(client, cache, logger);

    server.use(defaultFlowSearchHandler());
  });

  // ===========================================================================
  // list() - List flows with filters
  // ===========================================================================
  describe('list', () => {
    it('should return a list of flows with total count', async () => {
      const result = await service.list({});

      expect(result.flows).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should map flows to FlowListItem with actionCount and hasMailAction', async () => {
      const result = await service.list({});

      const orderFlow = result.flows.find((f) => f.id === MOCK_FLOW_ID);
      expect(orderFlow).toBeDefined();
      expect(orderFlow?.name).toBe('Bestellbestaetigung senden');
      expect(orderFlow?.eventName).toBe('checkout.order.placed');
      expect(orderFlow?.active).toBe(true);
      // MOCK_FLOW_RAW has one sequence with actionName (action.mail.send)
      expect(orderFlow?.actionCount).toBe(1);
      expect(orderFlow?.hasMailAction).toBe(true);
    });

    it('should filter by active=true in the API request', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/flow`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_FLOW_RAW], total: 1 });
        })
      );

      await service.list({ active: true });

      const filters = capturedBody.filter as Array<{ field: string; value: unknown }>;
      const activeFilter = filters?.find((f) => f.field === 'active');
      expect(activeFilter?.value).toBe(true);
    });

    it('should filter by eventName in the API request', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/flow`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_FLOW_RAW], total: 1 });
        })
      );

      await service.list({ eventName: 'checkout.order.placed' });

      const filters = capturedBody.filter as Array<{ field: string; value: unknown }>;
      const eventFilter = filters?.find((f) => f.field === 'eventName');
      expect(eventFilter?.value).toBe('checkout.order.placed');
    });

    it('should use multi/OR filter for search across name and description', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/flow`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_FLOW_RAW], total: 1 });
        })
      );

      await service.list({ search: 'Bestellung' });

      const filters = capturedBody.filter as Array<{ type: string; operator?: string }>;
      const multiFilter = filters?.find((f) => f.type === 'multi' && f.operator === 'OR');
      expect(multiFilter).toBeDefined();
    });

    it('should post-filter to only flows WITH mail actions when hasMailAction=true', async () => {
      const result = await service.list({ hasMailAction: true });

      // MOCK_FLOW_RAW_2 has only 'action.add.order.tag' - not a mail action
      expect(result.flows.every((f) => f.hasMailAction)).toBe(true);
    });

    it('should post-filter to only flows WITHOUT mail actions when hasMailAction=false', async () => {
      const result = await service.list({ hasMailAction: false });

      expect(result.flows.every((f) => !f.hasMailAction)).toBe(true);
    });

    it('should load sequences association in the API request', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/flow`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      await service.list({});

      const associations = capturedBody.associations as Record<string, unknown>;
      expect(associations?.sequences).toBeDefined();
    });
  });

  // ===========================================================================
  // get() - Get flow by ID or name
  // ===========================================================================
  describe('get', () => {
    it('should return a flow by ID with full details', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/flow`, () => {
          return HttpResponse.json({ data: [MOCK_FLOW_RAW], total: 1 });
        })
      );

      const result = await service.get({ id: MOCK_FLOW_ID });

      expect(result).not.toBeNull();
      expect(result?.id).toBe(MOCK_FLOW_ID);
      expect(result?.name).toBe('Bestellbestaetigung senden');
      expect(result?.eventName).toBe('checkout.order.placed');
    });

    it('should return a flow by name', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/flow`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          const filters = body.filter as Array<{ field: string; value: unknown }>;
          const nameFilter = filters?.find((f) => f.field === 'name');
          if (nameFilter?.value === 'Bestellbestaetigung senden') {
            return HttpResponse.json({ data: [MOCK_FLOW_RAW], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.get({ name: 'Bestellbestaetigung senden' });

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Bestellbestaetigung senden');
    });

    it('should return null for a non-existent flow', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/flow`, () => {
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.get({ id: 'doesnotexist0000111122223333444' });

      expect(result).toBeNull();
    });

    it('should build sequence hierarchy (children nested under parents)', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/flow`, () => {
          return HttpResponse.json({ data: [MOCK_FLOW_RAW], total: 1 });
        })
      );

      const result = await service.get({ id: MOCK_FLOW_ID });

      // Root sequence has a child
      const root = result?.sequences.find((s) => s.parentId === null);
      expect(root).toBeDefined();
      expect(root?.children).toHaveLength(1);
      expect(root?.children?.[0].id).toBe(MOCK_SEQUENCE_CHILD.id);
    });

    it('should map rule association onto sequence', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/flow`, () => {
          return HttpResponse.json({ data: [MOCK_FLOW_RAW], total: 1 });
        })
      );

      const result = await service.get({ id: MOCK_FLOW_ID });

      const childSeq = result?.sequences
        .flatMap((s) => s.children ?? [])
        .find((s) => s.id === MOCK_SEQUENCE_CHILD.id);

      expect(childSeq?.rule).not.toBeNull();
      expect(childSeq?.rule?.name).toBe('Customer is VIP');
    });

    it('should cache result by ID and name for cross-lookup', async () => {
      vi.useFakeTimers();

      server.use(
        http.post(`${BASE_URL}/api/search/flow`, () => {
          return HttpResponse.json({ data: [MOCK_FLOW_RAW], total: 1 });
        })
      );

      // First call populates cache
      await service.get({ id: MOCK_FLOW_ID });

      let requestCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/search/flow`, () => {
          requestCount++;
          return HttpResponse.json({ data: [MOCK_FLOW_RAW], total: 1 });
        })
      );

      // Subsequent call for same ID should be served from cache
      await service.get({ id: MOCK_FLOW_ID });
      expect(requestCount).toBe(0);

      // Also the name-based lookup should be served from cache
      await service.get({ name: MOCK_FLOW_RAW.name });
      expect(requestCount).toBe(0);

      // After 6 minutes cache expires
      vi.advanceTimersByTime(6 * 60 * 1000);
      await service.get({ id: MOCK_FLOW_ID });
      expect(requestCount).toBe(1);

      vi.useRealTimers();
    });
  });

  // ===========================================================================
  // toggle() - Activate/deactivate a flow
  // ===========================================================================
  describe('toggle', () => {
    it('should send PATCH request with active=true to activate a flow', async () => {
      let patchBody: Record<string, unknown> = {};

      server.use(
        http.patch(`${BASE_URL}/api/flow/${MOCK_FLOW_ID}`, async ({ request }) => {
          patchBody = await request.json() as Record<string, unknown>;
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${BASE_URL}/api/search/flow`, () => {
          return HttpResponse.json({
            data: [{ ...MOCK_FLOW_RAW, active: true }],
            total: 1,
          });
        })
      );

      const result = await service.toggle({ id: MOCK_FLOW_ID, active: true });

      expect(patchBody.active).toBe(true);
      expect(result.active).toBe(true);
    });

    it('should send PATCH request with active=false to deactivate a flow', async () => {
      let patchBody: Record<string, unknown> = {};

      server.use(
        http.patch(`${BASE_URL}/api/flow/${MOCK_FLOW_ID}`, async ({ request }) => {
          patchBody = await request.json() as Record<string, unknown>;
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${BASE_URL}/api/search/flow`, () => {
          return HttpResponse.json({
            data: [{ ...MOCK_FLOW_RAW, active: false }],
            total: 1,
          });
        })
      );

      const result = await service.toggle({ id: MOCK_FLOW_ID, active: false });

      expect(patchBody.active).toBe(false);
      expect(result.active).toBe(false);
    });

    it('should invalidate cache and re-fetch after toggle', async () => {
      // Pre-populate cache
      server.use(
        http.post(`${BASE_URL}/api/search/flow`, () => {
          return HttpResponse.json({ data: [MOCK_FLOW_RAW], total: 1 });
        })
      );
      await service.get({ id: MOCK_FLOW_ID });

      let fetchCount = 0;
      server.use(
        http.patch(`${BASE_URL}/api/flow/${MOCK_FLOW_ID}`, () => {
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${BASE_URL}/api/search/flow`, () => {
          fetchCount++;
          return HttpResponse.json({
            data: [{ ...MOCK_FLOW_RAW, active: false }],
            total: 1,
          });
        })
      );

      await service.toggle({ id: MOCK_FLOW_ID, active: false });

      // Cache was cleared; at least one new API request must have been made
      expect(fetchCount).toBeGreaterThanOrEqual(1);
    });

    it('should throw NOT_FOUND when flow does not exist after toggle', async () => {
      server.use(
        http.patch(`${BASE_URL}/api/flow/${MOCK_FLOW_ID}`, () => {
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${BASE_URL}/api/search/flow`, () => {
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      await expect(
        service.toggle({ id: MOCK_FLOW_ID, active: true })
      ).rejects.toThrow(MCPError);

      try {
        await service.toggle({ id: MOCK_FLOW_ID, active: true });
      } catch (err) {
        expect((err as MCPError).code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('should return a full Flow entity (with sequences) after toggle', async () => {
      server.use(
        http.patch(`${BASE_URL}/api/flow/${MOCK_FLOW_ID}`, () => {
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(`${BASE_URL}/api/search/flow`, () => {
          return HttpResponse.json({
            data: [{ ...MOCK_FLOW_RAW, active: true }],
            total: 1,
          });
        })
      );

      const result = await service.toggle({ id: MOCK_FLOW_ID, active: true });

      expect(result).toMatchObject({
        id: MOCK_FLOW_ID,
        name: expect.any(String),
        eventName: expect.any(String),
        active: true,
        sequences: expect.any(Array),
        createdAt: expect.any(String),
      });
    });
  });
});
