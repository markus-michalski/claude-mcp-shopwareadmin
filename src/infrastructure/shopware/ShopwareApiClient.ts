import type { Logger } from '../logging/Logger.js';
import type { ShopwareAuthenticator } from './ShopwareAuthenticator.js';
import { ErrorCode, MCPError } from '../../core/domain/Errors.js';

/**
 * HTTP methods supported by the Shopware API
 */
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * Generic Shopware API response wrapper
 */
export interface ShopwareResponse<T> {
  data: T;
}

/**
 * Shopware search/list API response
 */
export interface ShopwareSearchResponse<T> {
  data: T[];
  total: number;
  aggregations?: Record<string, unknown>;
}

/**
 * Maximum retry attempts for rate-limited requests
 */
const MAX_RATE_LIMIT_RETRIES = 3;

/**
 * Base delay for exponential backoff (ms)
 */
const RATE_LIMIT_BASE_DELAY = 1000;

/**
 * Default request timeout (ms) - prevents hanging on unresponsive Shopware
 */
const REQUEST_TIMEOUT_MS = 30000;

/**
 * HTTP client for Shopware 6 Admin API
 *
 * Handles authentication, request formatting, and error handling.
 * All requests are authenticated using OAuth2 tokens.
 * Includes automatic retry with exponential backoff for rate-limited requests.
 */
export class ShopwareApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly authenticator: ShopwareAuthenticator,
    private readonly logger: Logger
  ) {}

  /**
   * Make an authenticated request to the Shopware API
   *
   * Includes automatic retry logic for:
   * - 401 (token expired): Refreshes token and retries once
   * - 429 (rate limited): Exponential backoff with up to 3 retries
   */
  async request<T>(
    method: HttpMethod,
    endpoint: string,
    body?: unknown,
    retryCount = 0
  ): Promise<T> {
    const token = await this.authenticator.getAccessToken();
    const url = `${this.baseUrl}${endpoint}`;

    this.logger.debug('API request', { method, endpoint, retryCount });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const fetchOptions: RequestInit = {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };
    if (body) {
      const jsonBody = JSON.stringify(body);
      this.logger.debug('API request body', { method, endpoint, bodyLength: jsonBody.length });
      fetchOptions.body = jsonBody;
    }

    let response: Response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new MCPError(
          `Shopware API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${endpoint}`,
          ErrorCode.API_ERROR,
          true,
          'The Shopware server did not respond in time. Try again later.'
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle 401 - invalidate token and retry once
    if (response.status === 401) {
      this.logger.warn('Token expired, retrying with fresh token');
      this.authenticator.invalidateToken();
      const newToken = await this.authenticator.getAccessToken();

      const retryController = new AbortController();
      const retryTimeoutId = setTimeout(() => retryController.abort(), REQUEST_TIMEOUT_MS);

      const retryOptions: RequestInit = {
        method,
        signal: retryController.signal,
        headers: {
          Authorization: `Bearer ${newToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      };
      if (body) {
        retryOptions.body = JSON.stringify(body);
      }

      let retryResponse: Response;
      try {
        retryResponse = await fetch(url, retryOptions);
      } catch (error) {
        clearTimeout(retryTimeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new MCPError(
            `Shopware API retry timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${endpoint}`,
            ErrorCode.API_ERROR,
            true,
            'The Shopware server did not respond in time. Try again later.'
          );
        }
        throw error;
      } finally {
        clearTimeout(retryTimeoutId);
      }

      if (!retryResponse.ok) {
        throw await this.handleErrorResponse(retryResponse, endpoint);
      }

      return this.parseResponse<T>(retryResponse);
    }

    // Handle 429 - rate limited with exponential backoff
    if (response.status === 429 && retryCount < MAX_RATE_LIMIT_RETRIES) {
      const delay = RATE_LIMIT_BASE_DELAY * Math.pow(2, retryCount);
      this.logger.warn('Rate limited, retrying with backoff', {
        endpoint,
        retryCount: retryCount + 1,
        delayMs: delay,
      });
      await this.sleep(delay);
      return this.request<T>(method, endpoint, body, retryCount + 1);
    }

    if (!response.ok) {
      throw await this.handleErrorResponse(response, endpoint);
    }

    return this.parseResponse<T>(response);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>('GET', endpoint);
  }

  /**
   * POST request
   */
  async post<T>(endpoint: string, body: unknown): Promise<T> {
    return this.request<T>('POST', endpoint, body);
  }

  /**
   * PATCH request
   */
  async patch<T>(endpoint: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', endpoint, body);
  }

  /**
   * DELETE request
   */
  async delete(endpoint: string): Promise<void> {
    await this.request<void>('DELETE', endpoint);
  }

  /**
   * Search entities using Shopware's search API
   */
  async search<T>(
    entity: string,
    criteria: SearchCriteria
  ): Promise<ShopwareSearchResponse<T>> {
    return this.post<ShopwareSearchResponse<T>>(`/api/search/${entity}`, criteria);
  }

  /**
   * Parse API response with empty body handling
   */
  private async parseResponse<T>(response: Response): Promise<T> {
    const text = await response.text();

    // Handle empty responses (common for DELETE, some PATCH)
    if (!text) {
      return {} as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      this.logger.error('Failed to parse API response', { body: text.slice(0, 500) });
      throw new MCPError(
        'Invalid JSON response from Shopware API',
        ErrorCode.API_ERROR,
        false
      );
    }
  }

  /**
   * Handle error responses from the API
   */
  private async handleErrorResponse(
    response: Response,
    endpoint: string
  ): Promise<MCPError> {
    const errorBody = await response.text();

    this.logger.error('Shopware API error', {
      status: response.status,
      endpoint,
      bodyPreview: errorBody.slice(0, 200),
    });

    // Parse Shopware error format if possible
    let message = 'Unknown error';
    try {
      const errorJson = JSON.parse(errorBody);
      if (errorJson.errors && Array.isArray(errorJson.errors)) {
        message = errorJson.errors
          .map((e: { detail?: string; title?: string }) => e.detail ?? e.title ?? 'Unknown error')
          .join('; ');
      }
    } catch {
      // Use truncated raw body as fallback
      message = errorBody.slice(0, 200);
    }

    // Map HTTP status to appropriate error
    switch (response.status) {
      case 404:
        return MCPError.notFound('Resource', endpoint);
      case 429:
        return new MCPError(
          'Rate limited by Shopware API',
          ErrorCode.RATE_LIMITED,
          true,
          'Wait a few seconds and try again'
        );
      case 500:
      case 502:
      case 503:
        // Don't expose internal Shopware errors to client
        return MCPError.apiError(response.status, 'Shopware server error', true);
      default:
        return MCPError.apiError(response.status, message.slice(0, 200), false);
    }
  }
}

/**
 * Shopware search criteria
 */
export interface SearchCriteria {
  filter?: SearchFilter[];
  sort?: SearchSort[];
  associations?: Record<string, SearchCriteria | object>;
  limit?: number;
  page?: number;
  ids?: string[];
  term?: string;
  includes?: Record<string, string[]>;
}

/**
 * Search filter types
 */
export type SearchFilter =
  | { type: 'equals'; field: string; value: unknown }
  | { type: 'equalsAny'; field: string; value: unknown[] }
  | { type: 'contains'; field: string; value: string }
  | { type: 'prefix'; field: string; value: string }
  | { type: 'suffix'; field: string; value: string }
  | { type: 'range'; field: string; parameters: { gte?: number; lte?: number; gt?: number; lt?: number } }
  | { type: 'not'; field: string; value: unknown }
  | { type: 'multi'; operator: 'AND' | 'OR'; queries: SearchFilter[] };

/**
 * Search sort definition
 */
export interface SearchSort {
  field: string;
  order: 'ASC' | 'DESC';
  naturalSorting?: boolean;
}
