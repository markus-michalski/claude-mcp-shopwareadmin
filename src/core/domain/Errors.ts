/**
 * Error codes for the MCP server
 */
export enum ErrorCode {
  // Authentication
  AUTH_FAILED = 'AUTH_FAILED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  // Shopware API
  API_ERROR = 'API_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  NOT_FOUND = 'NOT_FOUND',

  // Validation
  INVALID_INPUT = 'INVALID_INPUT',
  PRODUCT_NUMBER_EXISTS = 'PRODUCT_NUMBER_EXISTS',

  // Content Generation
  STYLE_DETECTION_FAILED = 'STYLE_DETECTION_FAILED',
  CONTENT_GENERATION_FAILED = 'CONTENT_GENERATION_FAILED',

  // Wiki Integration
  WIKI_PAGE_NOT_FOUND = 'WIKI_PAGE_NOT_FOUND',
  WIKI_REQUEST_FAILED = 'WIKI_REQUEST_FAILED',

  // Cache
  CACHE_ERROR = 'CACHE_ERROR',

  // Internal
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Error response format for Claude Code
 */
export interface MCPErrorResponse {
  error: true;
  code: ErrorCode;
  message: string;
  recoverable: boolean;
  suggestion?: string | undefined;
  context?: Record<string, unknown> | undefined;
}

/**
 * Custom error class for MCP operations
 */
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

  /**
   * Convert to MCP-compliant error response
   */
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

  /**
   * Create an authentication failed error
   */
  static authFailed(message: string): MCPError {
    return new MCPError(
      message,
      ErrorCode.AUTH_FAILED,
      false,
      'Check SHOPWARE_CLIENT_ID and SHOPWARE_CLIENT_SECRET'
    );
  }

  /**
   * Create a not found error
   */
  static notFound(resource: string, identifier: string): MCPError {
    return new MCPError(
      `${resource} not found: ${identifier}`,
      ErrorCode.NOT_FOUND,
      false,
      `Verify the ${resource.toLowerCase()} exists`
    );
  }

  /**
   * Create an API error
   */
  static apiError(status: number, message: string, recoverable: boolean = false): MCPError {
    return new MCPError(
      `Shopware API error (${status}): ${message}`,
      ErrorCode.API_ERROR,
      recoverable,
      recoverable ? 'Try again in a few seconds' : undefined,
      { httpStatus: status }
    );
  }

  /**
   * Create a validation error
   */
  static invalidInput(message: string, field?: string): MCPError {
    return new MCPError(
      message,
      ErrorCode.INVALID_INPUT,
      false,
      field ? `Check the "${field}" parameter` : undefined,
      field ? { field } : undefined
    );
  }
}
