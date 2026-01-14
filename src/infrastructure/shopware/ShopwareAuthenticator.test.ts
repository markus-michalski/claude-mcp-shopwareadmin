/**
 * Tests for ShopwareAuthenticator
 *
 * Tests the OAuth2 Client Credentials Grant flow:
 * - Token acquisition
 * - Token caching
 * - Token refresh before expiration
 * - Error handling for invalid credentials
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/setup.js';
import { BASE_URL } from '../../test/handlers.js';
import { MOCK_TOKEN_RESPONSE, MOCK_CREDENTIALS, createMockLogger } from '../../test/fixtures.js';
import { ShopwareAuthenticator } from './ShopwareAuthenticator.js';
import { MCPError, ErrorCode } from '../../core/domain/Errors.js';

describe('ShopwareAuthenticator', () => {
  let authenticator: ShopwareAuthenticator;
  const logger = createMockLogger();

  beforeEach(() => {
    authenticator = new ShopwareAuthenticator(
      BASE_URL,
      MOCK_CREDENTIALS.clientId,
      MOCK_CREDENTIALS.clientSecret,
      logger
    );
  });

  describe('getAccessToken', () => {
    it('should request a new token on first call', async () => {
      const token = await authenticator.getAccessToken();

      expect(token).toBe(MOCK_TOKEN_RESPONSE.access_token);
    });

    it('should return cached token on subsequent calls', async () => {
      // First call - gets new token
      const token1 = await authenticator.getAccessToken();

      // Second call - should use cached token
      const token2 = await authenticator.getAccessToken();

      expect(token1).toBe(token2);
      expect(token1).toBe(MOCK_TOKEN_RESPONSE.access_token);
    });

    it('should request new token when cached token is expired', async () => {
      // Get initial token
      await authenticator.getAccessToken();

      // Simulate token expiration by manipulating internal state
      // We use vi.useFakeTimers to advance time
      vi.useFakeTimers();

      // Get token again - should still use cached
      const cachedToken = await authenticator.getAccessToken();
      expect(cachedToken).toBe(MOCK_TOKEN_RESPONSE.access_token);

      // Advance time past expiration (token expires in 600s, we advance 700s)
      vi.advanceTimersByTime(700 * 1000);

      // Set up a new token response for the refresh
      const newToken = 'refreshed-token-67890';
      server.use(
        http.post(`${BASE_URL}/api/oauth/token`, () => {
          return HttpResponse.json({
            ...MOCK_TOKEN_RESPONSE,
            access_token: newToken,
          });
        })
      );

      // This should request a new token
      const refreshedToken = await authenticator.getAccessToken();
      expect(refreshedToken).toBe(newToken);

      vi.useRealTimers();
    });

    it('should throw MCPError with AUTH_FAILED for invalid credentials', async () => {
      authenticator = new ShopwareAuthenticator(
        BASE_URL,
        'invalid',
        'invalid',
        logger
      );

      await expect(authenticator.getAccessToken()).rejects.toThrow(MCPError);

      try {
        await authenticator.getAccessToken();
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.AUTH_FAILED);
      }
    });

    it('should throw MCPError for network errors', async () => {
      server.use(
        http.post(`${BASE_URL}/api/oauth/token`, () => {
          return HttpResponse.error();
        })
      );

      await expect(authenticator.getAccessToken()).rejects.toThrow();
    });

    it('should throw MCPError for server errors', async () => {
      server.use(
        http.post(`${BASE_URL}/api/oauth/token`, () => {
          return HttpResponse.json(
            { error: 'server_error', error_description: 'Internal error' },
            { status: 500 }
          );
        })
      );

      await expect(authenticator.getAccessToken()).rejects.toThrow(MCPError);
    });

    it('should include 60 second buffer before expiration', async () => {
      vi.useFakeTimers();

      // Get initial token
      await authenticator.getAccessToken();

      // Advance to 60 seconds before expiration (600 - 60 = 540s)
      vi.advanceTimersByTime(539 * 1000);

      // Token should still be valid
      expect(authenticator.hasValidToken()).toBe(true);

      // Advance past the 60s buffer
      vi.advanceTimersByTime(2 * 1000);

      // Now token should be considered expired (needs refresh)
      expect(authenticator.hasValidToken()).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('invalidateToken', () => {
    it('should clear cached token', async () => {
      // Get a token first
      await authenticator.getAccessToken();
      expect(authenticator.hasValidToken()).toBe(true);

      // Invalidate it
      authenticator.invalidateToken();

      expect(authenticator.hasValidToken()).toBe(false);
    });

    it('should force new token request after invalidation', async () => {
      // Get initial token
      const token1 = await authenticator.getAccessToken();

      // Invalidate
      authenticator.invalidateToken();

      // Set up different token response
      const newToken = 'new-token-after-invalidation';
      server.use(
        http.post(`${BASE_URL}/api/oauth/token`, () => {
          return HttpResponse.json({
            ...MOCK_TOKEN_RESPONSE,
            access_token: newToken,
          });
        })
      );

      // Get new token
      const token2 = await authenticator.getAccessToken();

      expect(token2).toBe(newToken);
      expect(token2).not.toBe(token1);
    });
  });

  describe('hasValidToken', () => {
    it('should return false when no token has been acquired', () => {
      expect(authenticator.hasValidToken()).toBe(false);
    });

    it('should return true after successful token acquisition', async () => {
      await authenticator.getAccessToken();

      expect(authenticator.hasValidToken()).toBe(true);
    });

    it('should return false after token expiration', async () => {
      vi.useFakeTimers();

      await authenticator.getAccessToken();
      expect(authenticator.hasValidToken()).toBe(true);

      // Advance past expiration
      vi.advanceTimersByTime(700 * 1000);

      expect(authenticator.hasValidToken()).toBe(false);

      vi.useRealTimers();
    });

    it('should return false after invalidateToken is called', async () => {
      await authenticator.getAccessToken();
      expect(authenticator.hasValidToken()).toBe(true);

      authenticator.invalidateToken();

      expect(authenticator.hasValidToken()).toBe(false);
    });
  });
});
