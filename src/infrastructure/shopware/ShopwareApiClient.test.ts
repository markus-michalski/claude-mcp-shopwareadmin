/**
 * Tests for ShopwareApiClient
 *
 * Tests API communication with Shopware:
 * - GET/POST/PATCH/DELETE requests
 * - Authentication header handling
 * - Token refresh on 401
 * - Error handling (404, 429, 500)
 * - Response parsing
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/setup.js';
import { BASE_URL, expiredTokenHandler, rateLimitedHandler, serverErrorHandler } from '../../test/handlers.js';
import { MOCK_PRODUCT, MOCK_PRODUCT_LIST, MOCK_TOKEN_RESPONSE, createMockLogger } from '../../test/fixtures.js';
import { ShopwareApiClient } from './ShopwareApiClient.js';
import { ShopwareAuthenticator } from './ShopwareAuthenticator.js';
import { MCPError, ErrorCode } from '../../core/domain/Errors.js';

describe('ShopwareApiClient', () => {
  let client: ShopwareApiClient;
  let authenticator: ShopwareAuthenticator;
  const logger = createMockLogger();

  beforeEach(() => {
    authenticator = new ShopwareAuthenticator(
      BASE_URL,
      'test-client-id',
      'test-client-secret',
      logger
    );
    client = new ShopwareApiClient(BASE_URL, authenticator, logger);
  });

  describe('get', () => {
    it('should make GET request with authentication header', async () => {
      let capturedAuth = '';

      server.use(
        http.get(`${BASE_URL}/api/product/:id`, ({ request }) => {
          capturedAuth = request.headers.get('Authorization') || '';
          return HttpResponse.json({ data: MOCK_PRODUCT });
        })
      );

      await client.get('/api/product/some-id');

      expect(capturedAuth).toBe(`Bearer ${MOCK_TOKEN_RESPONSE.access_token}`);
    });

    it('should return parsed JSON response', async () => {
      const response = await client.get<{ data: typeof MOCK_PRODUCT }>(`/api/product/${MOCK_PRODUCT.id}`);

      expect(response.data).toBeDefined();
      expect(response.data.id).toBe(MOCK_PRODUCT.id);
      expect(response.data.productNumber).toBe(MOCK_PRODUCT.productNumber);
    });

    it('should throw NOT_FOUND error for 404 response', async () => {
      await expect(
        client.get('/api/product/not-found-id')
      ).rejects.toThrow(MCPError);

      try {
        await client.get('/api/product/not-found-id');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('should throw RATE_LIMITED error for 429 response', async () => {
      server.use(rateLimitedHandler);

      try {
        await client.get('/api/product/some-id');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.RATE_LIMITED);
        expect((error as MCPError).recoverable).toBe(true);
      }
    });

    it('should throw API_ERROR for 500 response with recoverable flag', async () => {
      server.use(serverErrorHandler);

      try {
        await client.get('/api/product/some-id');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.API_ERROR);
        expect((error as MCPError).recoverable).toBe(true);
      }
    });
  });

  describe('post', () => {
    it('should make POST request with JSON body', async () => {
      let capturedBody: unknown = null;

      server.use(
        http.post(`${BASE_URL}/api/product`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ data: MOCK_PRODUCT }, { status: 201 });
        })
      );

      const body = { name: 'Test Product', productNumber: 'TEST-001' };
      await client.post('/api/product', body);

      expect(capturedBody).toEqual(body);
    });

    it('should set Content-Type header to application/json', async () => {
      let capturedContentType = '';

      server.use(
        http.post(`${BASE_URL}/api/product`, ({ request }) => {
          capturedContentType = request.headers.get('Content-Type') || '';
          return HttpResponse.json({ data: MOCK_PRODUCT }, { status: 201 });
        })
      );

      await client.post('/api/product', { name: 'Test' });

      expect(capturedContentType).toBe('application/json');
    });
  });

  describe('patch', () => {
    it('should make PATCH request with partial update', async () => {
      let capturedBody: unknown = null;

      server.use(
        http.patch(`${BASE_URL}/api/product/:id`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ data: MOCK_PRODUCT });
        })
      );

      const update = { name: 'Updated Name' };
      await client.patch(`/api/product/${MOCK_PRODUCT.id}`, update);

      expect(capturedBody).toEqual(update);
    });
  });

  describe('delete', () => {
    it('should make DELETE request', async () => {
      let requestReceived = false;

      server.use(
        http.delete(`${BASE_URL}/api/product/:id`, () => {
          requestReceived = true;
          return new HttpResponse(null, { status: 204 });
        })
      );

      await client.delete(`/api/product/${MOCK_PRODUCT.id}`);

      expect(requestReceived).toBe(true);
    });

    it('should handle empty response body', async () => {
      // DELETE often returns 204 No Content
      await expect(
        client.delete(`/api/product/${MOCK_PRODUCT.id}`)
      ).resolves.not.toThrow();
    });
  });

  describe('search', () => {
    it('should make POST request to search endpoint', async () => {
      let capturedEndpoint = '';

      server.use(
        http.post(`${BASE_URL}/api/search/product`, ({ request }) => {
          capturedEndpoint = new URL(request.url).pathname;
          return HttpResponse.json({ data: MOCK_PRODUCT_LIST, total: 3 });
        })
      );

      await client.search('product', { limit: 10 });

      expect(capturedEndpoint).toBe('/api/search/product');
    });

    it('should pass search criteria in request body', async () => {
      let capturedBody: unknown = null;

      server.use(
        http.post(`${BASE_URL}/api/search/product`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ data: MOCK_PRODUCT_LIST, total: 3 });
        })
      );

      const criteria = {
        limit: 25,
        page: 1,
        filter: [{ type: 'equals' as const, field: 'active', value: true }],
      };

      await client.search('product', criteria);

      expect(capturedBody).toEqual(criteria);
    });

    it('should return search response with data and total', async () => {
      const response = await client.search<typeof MOCK_PRODUCT>('product', {});

      expect(response.data).toHaveLength(3);
      expect(response.total).toBe(3);
    });
  });

  describe('token refresh on 401', () => {
    it('should retry request with new token after 401', async () => {
      let requestCount = 0;

      server.use(
        http.get(`${BASE_URL}/api/product/:id`, () => {
          requestCount++;
          if (requestCount === 1) {
            // First request fails with 401
            return HttpResponse.json(
              { errors: [{ status: '401', title: 'Unauthorized' }] },
              { status: 401 }
            );
          }
          // Second request succeeds
          return HttpResponse.json({ data: MOCK_PRODUCT });
        })
      );

      const response = await client.get<{ data: typeof MOCK_PRODUCT }>(`/api/product/${MOCK_PRODUCT.id}`);

      expect(requestCount).toBe(2);
      expect(response.data.id).toBe(MOCK_PRODUCT.id);
    });

    it('should invalidate token before retry', async () => {
      let tokenInvalidated = false;
      const originalInvalidate = authenticator.invalidateToken.bind(authenticator);

      vi.spyOn(authenticator, 'invalidateToken').mockImplementation(() => {
        tokenInvalidated = true;
        originalInvalidate();
      });

      server.use(
        http.get(`${BASE_URL}/api/product/:id`, ({ request }) => {
          const auth = request.headers.get('Authorization');
          // First request with old token fails
          if (auth === `Bearer ${MOCK_TOKEN_RESPONSE.access_token}` && !tokenInvalidated) {
            return HttpResponse.json(
              { errors: [{ status: '401', title: 'Unauthorized' }] },
              { status: 401 }
            );
          }
          // Retry with new token succeeds
          return HttpResponse.json({ data: MOCK_PRODUCT });
        })
      );

      await client.get(`/api/product/${MOCK_PRODUCT.id}`);

      expect(tokenInvalidated).toBe(true);
    });

    it('should throw if retry also fails with 401', async () => {
      server.use(
        http.get(`${BASE_URL}/api/product/:id`, () => {
          // Always return 401
          return HttpResponse.json(
            { errors: [{ status: '401', title: 'Unauthorized' }] },
            { status: 401 }
          );
        })
      );

      await expect(
        client.get(`/api/product/${MOCK_PRODUCT.id}`)
      ).rejects.toThrow(MCPError);
    });
  });

  describe('error response parsing', () => {
    it('should extract error message from Shopware error format', async () => {
      server.use(
        http.get(`${BASE_URL}/api/product/:id`, () => {
          return HttpResponse.json(
            {
              errors: [
                { status: '400', code: 'VALIDATION_ERROR', detail: 'Invalid product data' },
              ],
            },
            { status: 400 }
          );
        })
      );

      try {
        await client.get('/api/product/some-id');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).message).toContain('Invalid product data');
      }
    });

    it('should handle malformed error response', async () => {
      server.use(
        http.get(`${BASE_URL}/api/product/:id`, () => {
          return new HttpResponse('Internal Server Error', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' },
          });
        })
      );

      await expect(
        client.get('/api/product/some-id')
      ).rejects.toThrow(MCPError);
    });

    it('should handle empty error response', async () => {
      server.use(
        http.get(`${BASE_URL}/api/product/:id`, () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      await expect(
        client.get('/api/product/some-id')
      ).rejects.toThrow(MCPError);
    });
  });

  describe('JSON parsing', () => {
    it('should handle empty response body for successful requests', async () => {
      server.use(
        http.patch(`${BASE_URL}/api/product/:id`, () => {
          return new HttpResponse(null, { status: 204 });
        })
      );

      // Should not throw, returns empty object
      const result = await client.patch(`/api/product/${MOCK_PRODUCT.id}`, { active: true });
      expect(result).toEqual({});
    });

    it('should throw for invalid JSON in successful response', async () => {
      server.use(
        http.get(`${BASE_URL}/api/product/:id`, () => {
          return new HttpResponse('not valid json', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        })
      );

      await expect(
        client.get('/api/product/some-id')
      ).rejects.toThrow(MCPError);
    });
  });
});
