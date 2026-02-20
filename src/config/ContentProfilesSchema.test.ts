import { describe, it, expect } from 'vitest';
import { ContentProfilesConfigSchema, StyleProfileSchema } from './ContentProfilesSchema.js';
import { BUILTIN_DEFAULTS } from './ContentProfilesDefaults.js';

describe('StyleProfileSchema', () => {
  it('should accept a valid profile', () => {
    const result = StyleProfileSchema.safeParse({
      tonality: 'Warm und freundlich',
      addressing: 'du',
      structure: ['Einstieg', 'Details', 'Fazit'],
      targetAudience: 'Kreative',
      exampleIntro: 'Hallo Welt!',
      includeSnippets: false,
    });

    expect(result.success).toBe(true);
  });

  it('should default includeSnippets to false', () => {
    const result = StyleProfileSchema.safeParse({
      tonality: 'Sachlich',
      addressing: 'Sie',
      structure: ['Intro'],
      targetAudience: 'Entwickler',
      exampleIntro: 'Test',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeSnippets).toBe(false);
    }
  });

  it('should reject empty tonality', () => {
    const result = StyleProfileSchema.safeParse({
      tonality: '',
      addressing: 'du',
      structure: ['Einstieg'],
      targetAudience: 'Alle',
      exampleIntro: 'Test',
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid addressing value', () => {
    const result = StyleProfileSchema.safeParse({
      tonality: 'Test',
      addressing: 'ihr',
      structure: ['Einstieg'],
      targetAudience: 'Alle',
      exampleIntro: 'Test',
    });

    expect(result.success).toBe(false);
  });

  it('should reject empty structure array', () => {
    const result = StyleProfileSchema.safeParse({
      tonality: 'Test',
      addressing: 'du',
      structure: [],
      targetAudience: 'Alle',
      exampleIntro: 'Test',
    });

    expect(result.success).toBe(false);
  });
});

describe('ContentProfilesConfigSchema', () => {
  it('should accept the built-in defaults', () => {
    const result = ContentProfilesConfigSchema.safeParse(BUILTIN_DEFAULTS);

    expect(result.success).toBe(true);
  });

  it('should accept a config with 3+ profiles', () => {
    const result = ContentProfilesConfigSchema.safeParse({
      language: 'de',
      defaultProfile: 'creative',
      profiles: {
        creative: {
          tonality: 'Warm',
          addressing: 'du',
          structure: ['Einstieg'],
          targetAudience: 'Bastler',
          exampleIntro: 'Hallo!',
        },
        software: {
          tonality: 'Sachlich',
          addressing: 'Sie',
          structure: ['Problem', 'Loesung'],
          targetAudience: 'Entwickler',
          exampleIntro: 'Professionell.',
          includeSnippets: true,
        },
        fashion: {
          tonality: 'Trendy, jung, frisch',
          addressing: 'du',
          structure: ['Look', 'Kombination', 'Details'],
          targetAudience: 'Fashion-Liebhaber',
          exampleIntro: 'Der neue Trend!',
        },
      },
      categoryMapping: {
        Software: 'software',
        Mode: 'fashion',
      },
    });

    expect(result.success).toBe(true);
  });

  it('should default language to "de"', () => {
    const result = ContentProfilesConfigSchema.safeParse({
      defaultProfile: 'test',
      profiles: {
        test: {
          tonality: 'Test',
          addressing: 'du',
          structure: ['A'],
          targetAudience: 'Alle',
          exampleIntro: 'Hi',
        },
      },
      categoryMapping: {},
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe('de');
    }
  });

  it('should reject when defaultProfile references non-existing profile', () => {
    const result = ContentProfilesConfigSchema.safeParse({
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
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('defaultProfile');
    }
  });

  it('should reject when categoryMapping references non-existing profile', () => {
    const result = ContentProfilesConfigSchema.safeParse({
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
        Software: 'nonexistent',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('categoryMapping');
    }
  });

  it('should reject empty profiles object', () => {
    const result = ContentProfilesConfigSchema.safeParse({
      language: 'de',
      defaultProfile: 'creative',
      profiles: {},
      categoryMapping: {},
    });

    expect(result.success).toBe(false);
  });

  it('should reject missing required fields', () => {
    const result = ContentProfilesConfigSchema.safeParse({
      language: 'de',
    });

    expect(result.success).toBe(false);
  });

  it('should accept empty categoryMapping', () => {
    const result = ContentProfilesConfigSchema.safeParse({
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
    });

    expect(result.success).toBe(true);
  });
});
