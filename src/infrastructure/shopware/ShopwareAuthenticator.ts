import type { Logger } from '../logging/Logger.js';
import { ErrorCode, MCPError } from '../../core/domain/Errors.js';

/**
 * OAuth2 token response from Shopware
 */
interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: 'Bearer';
}

/**
 * Manages OAuth2 authentication with Shopware Admin API
 *
 * Uses Client Credentials Grant flow for machine-to-machine authentication.
 * Tokens are cached and automatically refreshed before expiration.
 */
export class ShopwareAuthenticator {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly logger: Logger
  ) {}

  /**
   * Get a valid access token
   *
   * Returns cached token if still valid, otherwise requests a new one.
   * Includes a 60-second buffer to prevent edge-case expiration issues.
   */
  async getAccessToken(): Promise<string> {
    // Token still valid? (with 60s buffer)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      this.logger.debug('Using cached OAuth2 token');
      return this.accessToken;
    }

    this.logger.debug('Requesting new OAuth2 token');

    const response = await fetch(`${this.baseUrl}/api/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      // SECURITY: Do not log full error body - may contain sensitive data
      this.logger.error('OAuth2 authentication failed', {
        status: response.status,
        bodyLength: errorBody.length,
        // Only log first 100 chars, sanitized of potential secrets
        bodyPreview: errorBody.slice(0, 100).replace(/[a-f0-9]{32,}/gi, '[REDACTED]'),
      });

      if (response.status === 401) {
        throw MCPError.authFailed('Invalid client credentials');
      }

      throw new MCPError(
        `OAuth2 authentication failed: ${response.status}`,
        ErrorCode.AUTH_FAILED,
        false,
        'Check Shopware integration settings'
      );
    }

    const data = (await response.json()) as TokenResponse;

    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;

    this.logger.info('OAuth2 token acquired', {
      expiresIn: data.expires_in,
      expiresAt: new Date(this.tokenExpiresAt).toISOString(),
    });

    return this.accessToken;
  }

  /**
   * Invalidate the current token
   *
   * Call this if a request fails with 401 to force token refresh.
   */
  invalidateToken(): void {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.logger.debug('OAuth2 token invalidated');
  }

  /**
   * Check if we have a potentially valid token
   */
  hasValidToken(): boolean {
    return this.accessToken !== null && Date.now() < this.tokenExpiresAt - 60000;
  }
}
