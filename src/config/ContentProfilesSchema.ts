import { z } from 'zod';

/**
 * Zod schema for a single style profile in content-profiles.json
 */
export const StyleProfileSchema = z.object({
  tonality: z.string().min(1, 'Tonality must not be empty'),
  addressing: z.enum(['du', 'Sie'], {
    errorMap: () => ({ message: 'Addressing must be "du" or "Sie"' }),
  }),
  structure: z
    .array(z.string().min(1))
    .min(1, 'Structure must have at least one element'),
  targetAudience: z.string().min(1, 'Target audience must not be empty'),
  exampleIntro: z.string().min(1, 'Example intro must not be empty'),
  includeSnippets: z.boolean().default(false),
});

/**
 * Zod schema for the complete content-profiles.json config file
 */
export const ContentProfilesConfigSchema = z
  .object({
    language: z.string().min(2).max(5).default('de'),
    defaultProfile: z.string().min(1, 'Default profile name must not be empty'),
    profiles: z
      .record(z.string(), StyleProfileSchema)
      .refine((profiles) => Object.keys(profiles).length >= 1, {
        message: 'At least one profile must be defined',
      }),
    categoryMapping: z.record(z.string(), z.string()),
  })
  .refine((data) => data.profiles[data.defaultProfile] !== undefined, {
    message: 'defaultProfile must reference an existing profile',
    path: ['defaultProfile'],
  })
  .refine(
    (data) =>
      Object.values(data.categoryMapping).every(
        (profileName) => data.profiles[profileName] !== undefined
      ),
    {
      message: 'All categoryMapping values must reference existing profiles',
      path: ['categoryMapping'],
    }
  );

export type ContentProfilesConfig = z.infer<typeof ContentProfilesConfigSchema>;
export type StyleProfileConfig = z.infer<typeof StyleProfileSchema>;
