import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Log levels supported by the logger
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Shopware API configuration
 */
export interface ShopwareConfig {
  url: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Wiki.js configuration
 */
export interface WikiJsConfig {
  baseUrl: string;
}

/**
 * Cache TTL configuration (in milliseconds)
 */
export interface CacheConfig {
  ttlCategories: number;
  ttlProperties: number;
  ttlSnippets: number;
}

/**
 * Complete configuration interface
 */
export interface Config {
  shopware: ShopwareConfig;
  wikijs: WikiJsConfig;
  cache: CacheConfig;
  logLevel: LogLevel;
}

/**
 * Load environment variables from .env file
 * Supports both local development and deployed MCP server paths
 */
function loadEnvFile(): void {
  // Priority: deployment path > local .env
  const deployedEnvPath = join(homedir(), '.claude', 'mcp-servers', 'shopwareadmin', '.env');
  const localEnvPath = join(process.cwd(), '.env');

  let envPath: string | undefined;

  if (existsSync(deployedEnvPath)) {
    envPath = deployedEnvPath;
  } else if (existsSync(localEnvPath)) {
    envPath = localEnvPath;
  }

  if (envPath) {
    const content = readFileSync(envPath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Only set if not already defined (env vars take precedence)
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

/**
 * Get required environment variable or throw error
 */
function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Get optional environment variable with default value
 */
function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

/**
 * Parse integer from environment variable
 */
function parseIntEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  // Load .env file first
  loadEnvFile();

  return {
    shopware: {
      url: required('SHOPWARE_URL'),
      clientId: required('SHOPWARE_CLIENT_ID'),
      clientSecret: required('SHOPWARE_CLIENT_SECRET'),
    },
    wikijs: {
      baseUrl: optional('WIKIJS_BASE_URL', 'https://faq.markus-michalski.net'),
    },
    cache: {
      ttlCategories: parseIntEnv('CACHE_TTL_CATEGORIES', 3600000),
      ttlProperties: parseIntEnv('CACHE_TTL_PROPERTIES', 3600000),
      ttlSnippets: parseIntEnv('CACHE_TTL_SNIPPETS', 300000),
    },
    logLevel: (process.env['LOG_LEVEL'] as LogLevel) ?? 'info',
  };
}

/**
 * Validate configuration values
 */
export function validateConfig(config: Config): void {
  // Validate Shopware URL format and security
  try {
    const shopwareUrl = new URL(config.shopware.url);
    // SECURITY: Warn if not using HTTPS (credentials could be exposed)
    if (shopwareUrl.protocol !== 'https:' && !shopwareUrl.hostname.includes('localhost')) {
      console.error('[SECURITY WARNING] SHOPWARE_URL is not using HTTPS. Credentials may be transmitted in plain text!');
    }
  } catch {
    throw new Error(`Invalid SHOPWARE_URL: ${config.shopware.url}`);
  }

  // Validate Wiki.js URL format
  try {
    new URL(config.wikijs.baseUrl);
  } catch {
    throw new Error(`Invalid WIKIJS_BASE_URL: ${config.wikijs.baseUrl}`);
  }

  // Validate cache TTLs
  if (config.cache.ttlCategories <= 0) {
    throw new Error('CACHE_TTL_CATEGORIES must be positive');
  }
  if (config.cache.ttlProperties <= 0) {
    throw new Error('CACHE_TTL_PROPERTIES must be positive');
  }
  if (config.cache.ttlSnippets <= 0) {
    throw new Error('CACHE_TTL_SNIPPETS must be positive');
  }
}
