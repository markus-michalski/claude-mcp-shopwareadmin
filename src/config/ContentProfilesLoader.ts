import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  ContentProfilesConfigSchema,
  type ContentProfilesConfig,
} from './ContentProfilesSchema.js';
import { BUILTIN_DEFAULTS } from './ContentProfilesDefaults.js';

/**
 * Minimal logger interface for the loader (avoids circular dependency on Logger class)
 */
interface LoaderLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
}

/**
 * Resolve the path to content-profiles.json
 *
 * Priority:
 * 1. CONTENT_PROFILES_PATH env variable (absolute or relative to cwd)
 * 2. Deployed path: ~/.claude/mcp-servers/shopwareadmin/content-profiles.json
 * 3. Local: ./content-profiles.json
 */
function resolveConfigPath(): string {
  const envPath = process.env['CONTENT_PROFILES_PATH'];
  if (envPath) {
    return resolve(envPath);
  }

  const deployedPath = join(
    homedir(),
    '.claude',
    'mcp-servers',
    'shopwareadmin',
    'content-profiles.json'
  );
  if (existsSync(deployedPath)) {
    return deployedPath;
  }

  return resolve('./content-profiles.json');
}

/**
 * Load content profiles from external JSON file.
 * Falls back to built-in defaults if no config file is found.
 *
 * @param logger - Logger for info/warning messages
 * @returns Validated ContentProfilesConfig
 * @throws Error if config file exists but contains invalid JSON or fails validation
 */
export function loadContentProfiles(
  logger: LoaderLogger
): ContentProfilesConfig {
  const configPath = resolveConfigPath();

  if (!existsSync(configPath)) {
    logger.info('No content-profiles.json found, using built-in defaults', {
      searchedPath: configPath,
    });
    return BUILTIN_DEFAULTS;
  }

  const raw = readFileSync(configPath, 'utf-8');
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Invalid JSON in content-profiles.json at ${configPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const result = ContentProfilesConfigSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid content-profiles.json at ${configPath}:\n${issues}\n\nSee content-profiles.example.json for the expected format.`
    );
  }

  logger.info('Content profiles loaded from file', {
    path: configPath,
    profiles: Object.keys(result.data.profiles),
    defaultProfile: result.data.defaultProfile,
    categoryMappings: Object.keys(result.data.categoryMapping).length,
  });

  return result.data;
}
