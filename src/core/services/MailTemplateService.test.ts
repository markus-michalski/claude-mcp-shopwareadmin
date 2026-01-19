/**
 * Tests for MailTemplateService
 *
 * Tests all 4 mail template methods with TDD approach:
 * - list: List mail templates with optional search
 * - get: Get mail template by ID or technicalName
 * - update: Update mail template content
 * - sendTest: Send a test mail
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/setup.js';
import { BASE_URL } from '../../test/handlers.js';
import {
  MOCK_MAIL_TEMPLATE_LIST,
  MOCK_MAIL_TEMPLATE_ORDER,
  MOCK_MAIL_TEMPLATE_ORDER_ID,
  MOCK_MAIL_TEMPLATE_CUSTOMER,
  MOCK_MAIL_TEMPLATE_TYPE_ORDER,
  MOCK_MAIL_TEMPLATE_UPDATE_INPUT,
  MOCK_MAIL_TEMPLATE_SEND_TEST_INPUT,
} from '../../test/mail-template-fixtures.js';
import { MOCK_SALES_CHANNEL_ID, createMockLogger } from '../../test/fixtures.js';
import { MailTemplateService } from './MailTemplateService.js';
import { ShopwareApiClient } from '../../infrastructure/shopware/ShopwareApiClient.js';
import { ShopwareAuthenticator } from '../../infrastructure/shopware/ShopwareAuthenticator.js';
import { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import { MCPError, ErrorCode } from '../domain/Errors.js';
import type { Logger } from '../../infrastructure/logging/Logger.js';

describe('MailTemplateService', () => {
  let service: MailTemplateService;
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
    service = new MailTemplateService(client, cache, logger, MOCK_SALES_CHANNEL_ID);

    // Set up default mail template handlers
    server.use(
      // Search mail templates
      http.post(`${BASE_URL}/api/search/mail-template`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;

        let templates = [...MOCK_MAIL_TEMPLATE_LIST];

        // Check for ID search
        if (body.ids && Array.isArray(body.ids)) {
          templates = templates.filter((t) => (body.ids as string[]).includes(t.id));
        }

        // Check for filters
        const filters = body.filter as
          | Array<{ type: string; field: string; value: unknown; operator?: string; queries?: unknown[] }>
          | undefined;

        // Filter by technicalName
        const techNameFilter = filters?.find(
          (f) => f.field === 'mailTemplateType.technicalName'
        );
        if (techNameFilter) {
          templates = templates.filter(
            (t) => t.mailTemplateType?.technicalName === techNameFilter.value
          );
        }

        // Handle search (multi-filter with OR)
        const multiFilter = filters?.find((f) => f.type === 'multi' && f.operator === 'OR');
        if (multiFilter && multiFilter.queries) {
          // For simplicity, just filter by subject containing search term
          const queries = multiFilter.queries as Array<{ field: string; value: string }>;
          const searchQuery = queries.find((q) => q.field === 'subject');
          if (searchQuery) {
            const term = searchQuery.value.toLowerCase();
            templates = templates.filter(
              (t) =>
                t.subject.toLowerCase().includes(term) ||
                t.mailTemplateType?.name.toLowerCase().includes(term)
            );
          }
        }

        // Apply limit
        const limit = (body.limit as number) || 50;
        templates = templates.slice(0, limit);

        return HttpResponse.json({ data: templates, total: templates.length });
      }),

      // Update mail template
      http.patch(`${BASE_URL}/api/mail-template/:id`, async ({ params, request }) => {
        const { id } = params;
        const body = (await request.json()) as Record<string, unknown>;

        if (id === 'not-found-id') {
          return HttpResponse.json(
            { errors: [{ status: '404', title: 'Not Found', detail: 'Mail template not found' }] },
            { status: 404 }
          );
        }

        const template = MOCK_MAIL_TEMPLATE_LIST.find((t) => t.id === id);
        if (!template) {
          return HttpResponse.json(
            { errors: [{ status: '404', title: 'Not Found', detail: 'Mail template not found' }] },
            { status: 404 }
          );
        }

        const updated = {
          ...template,
          ...body,
          updatedAt: new Date().toISOString(),
        };

        return HttpResponse.json({ data: updated });
      }),

      // Send test mail
      http.post(`${BASE_URL}/api/_action/mail-template/send`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;

        // Simulate mail template not found
        if (body.mailTemplateId === 'not-found-id') {
          return HttpResponse.json(
            { errors: [{ status: '404', title: 'Not Found', detail: 'Mail template not found' }] },
            { status: 404 }
          );
        }

        // Simulate mail sending failure
        if (body.mailTemplateId === 'mail-error-id') {
          return HttpResponse.json(
            { errors: [{ status: '500', title: 'Mail Error', detail: 'SMTP connection failed' }] },
            { status: 500 }
          );
        }

        return HttpResponse.json({ success: true }, { status: 200 });
      })
    );
  });

  // ===========================================================================
  // list() - List mail templates
  // ===========================================================================
  describe('list', () => {
    it('should return paginated mail template list', async () => {
      const result = await service.list({ limit: 10, offset: 0 });

      expect(result.templates).toBeDefined();
      expect(result.total).toBeGreaterThan(0);
      expect(result.templates.length).toBeLessThanOrEqual(10);
    });

    it('should return MailTemplateListItem objects', async () => {
      const result = await service.list({});

      expect(result.templates[0]).toMatchObject({
        id: expect.any(String),
        technicalName: expect.any(String),
        typeName: expect.any(String),
        subject: expect.any(String),
        systemDefault: expect.any(Boolean),
        updatedAt: expect.any(String),
      });
    });

    it('should search by subject', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/mail-template`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ data: [MOCK_MAIL_TEMPLATE_ORDER], total: 1 });
        })
      );

      await service.list({ search: 'Bestellung' });

      const filters = capturedBody.filter as Array<{ type: string; operator?: string }>;
      const multiFilter = filters?.find((f) => f.type === 'multi' && f.operator === 'OR');
      expect(multiFilter).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/mail-template`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ data: MOCK_MAIL_TEMPLATE_LIST, total: 3 });
        })
      );

      await service.list({ limit: 25 });

      expect(capturedBody.limit).toBe(25);
    });

    it('should respect offset parameter for pagination', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/mail-template`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ data: MOCK_MAIL_TEMPLATE_LIST, total: 100 });
        })
      );

      await service.list({ limit: 25, offset: 50 });

      expect(capturedBody.page).toBe(3); // offset 50 with limit 25 = page 3
    });

    it('should NOT cache list results', async () => {
      let requestCount = 0;

      server.use(
        http.post(`${BASE_URL}/api/search/mail-template`, () => {
          requestCount++;
          return HttpResponse.json({ data: MOCK_MAIL_TEMPLATE_LIST, total: 3 });
        })
      );

      await service.list({});
      await service.list({});

      expect(requestCount).toBe(2); // No caching, both requests made
    });

    it('should load mailTemplateType association', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/search/mail-template`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ data: MOCK_MAIL_TEMPLATE_LIST, total: 3 });
        })
      );

      await service.list({});

      const associations = capturedBody.associations as Record<string, unknown>;
      expect(associations).toBeDefined();
      expect(associations.mailTemplateType).toBeDefined();
    });
  });

  // ===========================================================================
  // get() - Get mail template by ID or technicalName
  // ===========================================================================
  describe('get', () => {
    it('should get mail template by ID', async () => {
      const result = await service.get({ id: MOCK_MAIL_TEMPLATE_ORDER_ID });

      expect(result).not.toBeNull();
      expect(result?.id).toBe(MOCK_MAIL_TEMPLATE_ORDER_ID);
    });

    it('should get mail template by technicalName', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/mail-template`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          const filters = body.filter as Array<{ field: string; value: unknown }>;
          const techNameFilter = filters?.find(
            (f) => f.field === 'mailTemplateType.technicalName'
          );

          if (techNameFilter?.value === 'order_confirmation_mail') {
            return HttpResponse.json({ data: [MOCK_MAIL_TEMPLATE_ORDER], total: 1 });
          }
          return HttpResponse.json({ data: [], total: 0 });
        })
      );

      const result = await service.get({ technicalName: 'order_confirmation_mail' });

      expect(result).not.toBeNull();
      expect(result?.templateType?.technicalName).toBe('order_confirmation_mail');
    });

    it('should return null for non-existent ID', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/mail-template`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (Array.isArray(body.ids) && body.ids.includes('not-found-id')) {
            return HttpResponse.json({ data: [], total: 0 });
          }
          return HttpResponse.json({ data: MOCK_MAIL_TEMPLATE_LIST, total: 3 });
        })
      );

      const result = await service.get({ id: 'not-found-id' });

      expect(result).toBeNull();
    });

    it('should return null for non-existent technicalName', async () => {
      const result = await service.get({ technicalName: 'NOT_EXISTS' });

      expect(result).toBeNull();
    });

    it('should return full MailTemplate entity', async () => {
      const result = await service.get({ id: MOCK_MAIL_TEMPLATE_ORDER_ID });

      expect(result).toMatchObject({
        id: MOCK_MAIL_TEMPLATE_ORDER_ID,
        mailTemplateTypeId: expect.any(String),
        systemDefault: expect.any(Boolean),
        subject: expect.any(String),
        contentHtml: expect.any(String),
        contentPlain: expect.any(String),
        templateType: expect.objectContaining({
          id: expect.any(String),
          technicalName: expect.any(String),
          name: expect.any(String),
        }),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('should cache mail template for 10 minutes', async () => {
      vi.useFakeTimers();

      // First request
      await service.get({ id: MOCK_MAIL_TEMPLATE_ORDER_ID });

      // Second request should use cache
      let requestCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/search/mail-template`, () => {
          requestCount++;
          return HttpResponse.json({ data: [MOCK_MAIL_TEMPLATE_ORDER], total: 1 });
        })
      );

      await service.get({ id: MOCK_MAIL_TEMPLATE_ORDER_ID });
      expect(requestCount).toBe(0); // Cache hit

      // Advance 11 minutes (past 10 minute cache)
      vi.advanceTimersByTime(11 * 60 * 1000);

      await service.get({ id: MOCK_MAIL_TEMPLATE_ORDER_ID });
      expect(requestCount).toBe(1); // Cache miss, new request

      vi.useRealTimers();
    });

    it('should cache by both ID and technicalName', async () => {
      // First request by ID
      await service.get({ id: MOCK_MAIL_TEMPLATE_ORDER_ID });

      // Second request by technicalName should use cache
      let requestCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/search/mail-template`, () => {
          requestCount++;
          return HttpResponse.json({ data: [MOCK_MAIL_TEMPLATE_ORDER], total: 1 });
        })
      );

      await service.get({ technicalName: 'order_confirmation_mail' });
      expect(requestCount).toBe(0); // Cache hit
    });
  });

  // ===========================================================================
  // update() - Update mail template content
  // ===========================================================================
  describe('update', () => {
    it('should update mail template subject', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.patch(`${BASE_URL}/api/mail-template/:id`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ data: { ...MOCK_MAIL_TEMPLATE_ORDER, ...capturedBody } });
        })
      );

      await service.update(MOCK_MAIL_TEMPLATE_ORDER_ID, { subject: 'New Subject' });

      expect(capturedBody.subject).toBe('New Subject');
    });

    it('should update mail template HTML content', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.patch(`${BASE_URL}/api/mail-template/:id`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ data: { ...MOCK_MAIL_TEMPLATE_ORDER, ...capturedBody } });
        })
      );

      await service.update(MOCK_MAIL_TEMPLATE_ORDER_ID, {
        contentHtml: '<p>New HTML Content</p>',
      });

      expect(capturedBody.contentHtml).toBe('<p>New HTML Content</p>');
    });

    it('should update multiple fields at once', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.patch(`${BASE_URL}/api/mail-template/:id`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ data: { ...MOCK_MAIL_TEMPLATE_ORDER, ...capturedBody } });
        })
      );

      await service.update(MOCK_MAIL_TEMPLATE_ORDER_ID, {
        subject: 'Updated Subject',
        contentHtml: '<p>Updated HTML</p>',
        contentPlain: 'Updated Plain',
        senderName: 'New Sender',
      });

      expect(capturedBody.subject).toBe('Updated Subject');
      expect(capturedBody.contentHtml).toBe('<p>Updated HTML</p>');
      expect(capturedBody.contentPlain).toBe('Updated Plain');
      expect(capturedBody.senderName).toBe('New Sender');
    });

    it('should return updated MailTemplate entity', async () => {
      const result = await service.update(MOCK_MAIL_TEMPLATE_ORDER_ID, {
        subject: 'Updated',
      });

      expect(result).toMatchObject({
        id: MOCK_MAIL_TEMPLATE_ORDER_ID,
        subject: expect.any(String),
        contentHtml: expect.any(String),
        templateType: expect.any(Object),
      });
    });

    it('should throw NOT_FOUND for non-existent template', async () => {
      await expect(
        service.update('not-found-id', { subject: 'Test' })
      ).rejects.toThrow(MCPError);

      try {
        await service.update('not-found-id', { subject: 'Test' });
      } catch (error) {
        expect((error as MCPError).code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('should invalidate cache after update', async () => {
      // Pre-populate cache
      await service.get({ id: MOCK_MAIL_TEMPLATE_ORDER_ID });

      // Track requests during update
      let searchRequestCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/search/mail-template`, () => {
          searchRequestCount++;
          return HttpResponse.json({
            data: [{ ...MOCK_MAIL_TEMPLATE_ORDER, subject: 'Updated' }],
            total: 1,
          });
        })
      );

      // Update - should invalidate cache and fetch fresh data
      await service.update(MOCK_MAIL_TEMPLATE_ORDER_ID, { subject: 'Updated' });

      // The update method fetches the product fresh after update, so searchRequestCount should be >= 1
      expect(searchRequestCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // sendTest() - Send a test mail
  // ===========================================================================
  describe('sendTest', () => {
    it('should send a test mail', async () => {
      const result = await service.sendTest({
        mailTemplateId: MOCK_MAIL_TEMPLATE_ORDER_ID,
        recipient: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.recipient).toBe('test@example.com');
      expect(result.mailTemplateId).toBe(MOCK_MAIL_TEMPLATE_ORDER_ID);
    });

    it('should include template type in result', async () => {
      const result = await service.sendTest({
        mailTemplateId: MOCK_MAIL_TEMPLATE_ORDER_ID,
        recipient: 'test@example.com',
      });

      expect(result.templateType).toBe('order_confirmation_mail');
    });

    it('should use default sales channel when not provided', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/_action/mail-template/send`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ success: true });
        })
      );

      await service.sendTest({
        mailTemplateId: MOCK_MAIL_TEMPLATE_ORDER_ID,
        recipient: 'test@example.com',
      });

      expect(capturedBody.salesChannelId).toBe(MOCK_SALES_CHANNEL_ID);
    });

    it('should use provided sales channel', async () => {
      let capturedBody: Record<string, unknown> = {};
      const customSalesChannelId = 'custom-sales-channel-uuid';

      server.use(
        http.post(`${BASE_URL}/api/_action/mail-template/send`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ success: true });
        })
      );

      await service.sendTest({
        mailTemplateId: MOCK_MAIL_TEMPLATE_ORDER_ID,
        recipient: 'test@example.com',
        salesChannelId: customSalesChannelId,
      });

      expect(capturedBody.salesChannelId).toBe(customSalesChannelId);
    });

    it('should throw NOT_FOUND for non-existent template', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/mail-template`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (Array.isArray(body.ids) && body.ids.includes('not-found-template-id')) {
            return HttpResponse.json({ data: [], total: 0 });
          }
          return HttpResponse.json({ data: MOCK_MAIL_TEMPLATE_LIST, total: 3 });
        })
      );

      await expect(
        service.sendTest({
          mailTemplateId: 'not-found-template-id',
          recipient: 'test@example.com',
        })
      ).rejects.toThrow(MCPError);
    });

    it('should throw API_ERROR on mail sending failure', async () => {
      server.use(
        http.post(`${BASE_URL}/api/_action/mail-template/send`, () => {
          return HttpResponse.json(
            { errors: [{ status: '500', title: 'Mail Error', detail: 'SMTP failed' }] },
            { status: 500 }
          );
        })
      );

      await expect(
        service.sendTest({
          mailTemplateId: MOCK_MAIL_TEMPLATE_ORDER_ID,
          recipient: 'test@example.com',
        })
      ).rejects.toThrow(MCPError);
    });

    it('should set testMode to true', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/_action/mail-template/send`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ success: true });
        })
      );

      await service.sendTest({
        mailTemplateId: MOCK_MAIL_TEMPLATE_ORDER_ID,
        recipient: 'test@example.com',
      });

      expect(capturedBody.testMode).toBe(true);
    });

    it('should format recipients correctly', async () => {
      let capturedBody: Record<string, unknown> = {};

      server.use(
        http.post(`${BASE_URL}/api/_action/mail-template/send`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ success: true });
        })
      );

      await service.sendTest({
        mailTemplateId: MOCK_MAIL_TEMPLATE_ORDER_ID,
        recipient: 'test@example.com',
      });

      const recipients = capturedBody.recipients as Record<string, string>;
      expect(recipients).toEqual({ 'test@example.com': 'test@example.com' });
    });

    it('should enforce rate limit (5 calls per minute)', async () => {
      // Send 5 test mails (should all succeed)
      for (let i = 0; i < 5; i++) {
        await service.sendTest({
          mailTemplateId: MOCK_MAIL_TEMPLATE_ORDER_ID,
          recipient: 'test@example.com',
        });
      }

      // 6th call should fail with RATE_LIMITED
      await expect(
        service.sendTest({
          mailTemplateId: MOCK_MAIL_TEMPLATE_ORDER_ID,
          recipient: 'test@example.com',
        })
      ).rejects.toThrow(MCPError);

      try {
        await service.sendTest({
          mailTemplateId: MOCK_MAIL_TEMPLATE_ORDER_ID,
          recipient: 'test@example.com',
        });
      } catch (error) {
        expect((error as MCPError).code).toBe(ErrorCode.RATE_LIMITED);
      }
    });

    it('should reset rate limit after window expires', async () => {
      vi.useFakeTimers();

      // Send 5 test mails
      for (let i = 0; i < 5; i++) {
        await service.sendTest({
          mailTemplateId: MOCK_MAIL_TEMPLATE_ORDER_ID,
          recipient: 'test@example.com',
        });
      }

      // Advance time past the rate limit window (1 minute + buffer)
      vi.advanceTimersByTime(61 * 1000);

      // Should succeed now
      const result = await service.sendTest({
        mailTemplateId: MOCK_MAIL_TEMPLATE_ORDER_ID,
        recipient: 'test@example.com',
      });

      expect(result.success).toBe(true);

      vi.useRealTimers();
    });

    it('should track rate limit per template ID', async () => {
      // Use different template ID
      const otherTemplateId = MOCK_MAIL_TEMPLATE_CUSTOMER.id;

      // Send 5 mails to first template
      for (let i = 0; i < 5; i++) {
        await service.sendTest({
          mailTemplateId: MOCK_MAIL_TEMPLATE_ORDER_ID,
          recipient: 'test@example.com',
        });
      }

      // Should still be able to send to different template
      const result = await service.sendTest({
        mailTemplateId: otherTemplateId,
        recipient: 'test@example.com',
      });

      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // Entity Mapping Tests
  // ===========================================================================
  describe('entity mapping', () => {
    it('should map templateType correctly', async () => {
      const result = await service.get({ id: MOCK_MAIL_TEMPLATE_ORDER_ID });

      expect(result?.templateType).toMatchObject({
        id: MOCK_MAIL_TEMPLATE_TYPE_ORDER.id,
        technicalName: MOCK_MAIL_TEMPLATE_TYPE_ORDER.technicalName,
        name: MOCK_MAIL_TEMPLATE_TYPE_ORDER.name,
      });
    });

    it('should handle null templateType gracefully', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/mail-template`, () => {
          return HttpResponse.json({
            data: [{ ...MOCK_MAIL_TEMPLATE_ORDER, mailTemplateType: null }],
            total: 1,
          });
        })
      );

      const result = await service.get({ id: MOCK_MAIL_TEMPLATE_ORDER_ID });

      expect(result?.templateType).toBeNull();
    });

    it('should map list items with technicalName from type', async () => {
      const result = await service.list({});

      expect(result.templates[0].technicalName).toBe('order_confirmation_mail');
      expect(result.templates[0].typeName).toBe('Bestellbestaetigung');
    });

    it('should handle missing templateType in list', async () => {
      server.use(
        http.post(`${BASE_URL}/api/search/mail-template`, () => {
          return HttpResponse.json({
            data: [{ ...MOCK_MAIL_TEMPLATE_ORDER, mailTemplateType: null }],
            total: 1,
          });
        })
      );

      const result = await service.list({});

      expect(result.templates[0].technicalName).toBe('unknown');
      expect(result.templates[0].typeName).toBe('Unknown');
    });
  });
});
