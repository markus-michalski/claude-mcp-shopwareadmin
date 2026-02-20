import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadContentProfiles } from './ContentProfilesLoader.js';
import { BUILTIN_DEFAULTS } from './ContentProfilesDefaults.js';

// Mock node:fs
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

import { existsSync, readFileSync } from 'node:fs';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
  };
}

describe('loadContentProfiles', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    logger = createMockLogger();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return built-in defaults when no config file exists', () => {
    mockExistsSync.mockReturnValue(false);

    const result = loadContentProfiles(logger);

    expect(result).toEqual(BUILTIN_DEFAULTS);
    expect(logger.info).toHaveBeenCalledWith(
      'No content-profiles.json found, using built-in defaults',
      expect.any(Object)
    );
  });

  it('should load and parse a valid config file', () => {
    const validConfig = {
      language: 'de',
      defaultProfile: 'minimal',
      profiles: {
        minimal: {
          tonality: 'Neutral',
          addressing: 'Sie',
          structure: ['Inhalt'],
          targetAudience: 'Alle',
          exampleIntro: 'Willkommen.',
        },
      },
      categoryMapping: {},
    };

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));

    const result = loadContentProfiles(logger);

    expect(result.defaultProfile).toBe('minimal');
    expect(result.profiles['minimal']).toBeDefined();
    expect(result.profiles['minimal']!.includeSnippets).toBe(false);
    expect(logger.info).toHaveBeenCalledWith(
      'Content profiles loaded from file',
      expect.objectContaining({
        profiles: ['minimal'],
        defaultProfile: 'minimal',
      })
    );
  });

  it('should throw on invalid JSON syntax', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{ invalid json }}}');

    expect(() => loadContentProfiles(logger)).toThrow('Invalid JSON');
  });

  it('should throw on schema validation error with helpful message', () => {
    const invalidConfig = {
      language: 'de',
      defaultProfile: 'nonexistent',
      profiles: {
        creative: {
          tonality: 'Warm',
          addressing: 'du',
          structure: ['Einstieg'],
          targetAudience: 'Bastler',
          exampleIntro: 'Hi',
        },
      },
      categoryMapping: {},
    };

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

    expect(() => loadContentProfiles(logger)).toThrow('defaultProfile');
  });

  it('should throw when categoryMapping references invalid profile', () => {
    const invalidConfig = {
      language: 'de',
      defaultProfile: 'creative',
      profiles: {
        creative: {
          tonality: 'Warm',
          addressing: 'du',
          structure: ['Einstieg'],
          targetAudience: 'Bastler',
          exampleIntro: 'Hi',
        },
      },
      categoryMapping: {
        Software: 'does-not-exist',
      },
    };

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

    expect(() => loadContentProfiles(logger)).toThrow('categoryMapping');
  });

  it('should respect CONTENT_PROFILES_PATH env variable', () => {
    vi.stubEnv('CONTENT_PROFILES_PATH', '/custom/path/profiles.json');

    mockExistsSync.mockImplementation((path) => {
      return String(path) === '/custom/path/profiles.json';
    });
    mockReadFileSync.mockReturnValue(JSON.stringify(BUILTIN_DEFAULTS));

    const result = loadContentProfiles(logger);

    expect(result.defaultProfile).toBe(BUILTIN_DEFAULTS.defaultProfile);
    expect(mockReadFileSync).toHaveBeenCalledWith(
      '/custom/path/profiles.json',
      'utf-8'
    );
  });

  it('should include reference to example file in validation error', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ invalid: true }));

    expect(() => loadContentProfiles(logger)).toThrow(
      'content-profiles.example.json'
    );
  });

  it('should accept config with multiple custom profiles', () => {
    const multiConfig = {
      language: 'en',
      defaultProfile: 'professional',
      profiles: {
        professional: {
          tonality: 'Formal, precise',
          addressing: 'Sie',
          structure: ['Overview', 'Features', 'Specs'],
          targetAudience: 'Business customers',
          exampleIntro: 'Introducing our solution.',
          includeSnippets: true,
        },
        casual: {
          tonality: 'Friendly, relaxed',
          addressing: 'du',
          structure: ['Hook', 'Benefits', 'Call to action'],
          targetAudience: 'Young adults',
          exampleIntro: 'Hey there!',
        },
        luxury: {
          tonality: 'Elegant, exclusive',
          addressing: 'Sie',
          structure: ['Aspiration', 'Craftsmanship', 'Heritage'],
          targetAudience: 'Premium customers',
          exampleIntro: 'Experience excellence.',
          includeSnippets: false,
        },
      },
      categoryMapping: {
        Electronics: 'professional',
        Fashion: 'casual',
        Jewelry: 'luxury',
      },
    };

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(multiConfig));

    const result = loadContentProfiles(logger);

    expect(Object.keys(result.profiles)).toHaveLength(3);
    expect(result.defaultProfile).toBe('professional');
    expect(result.profiles['luxury']!.includeSnippets).toBe(false);
    expect(result.profiles['professional']!.includeSnippets).toBe(true);
  });
});
