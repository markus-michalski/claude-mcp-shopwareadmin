import type { ContentProfilesConfig } from './ContentProfilesSchema.js';

/**
 * Built-in default content profiles (MMKreativ shop values).
 * Used as fallback when no content-profiles.json is found.
 */
export const BUILTIN_DEFAULTS: ContentProfilesConfig = {
  language: 'de',
  defaultProfile: 'creative',
  profiles: {
    creative: {
      tonality: 'Persoenlich, warm, emotional',
      addressing: 'du',
      structure: [
        'Emotionaler Einstieg (Frage/Anekdote)',
        'Was ist es?',
        'Technische Details (Format, Groesse)',
        'Anwendungstipps',
      ],
      targetAudience: 'Hobbybastler, Kreative, DIY-Enthusiasten',
      exampleIntro: 'Was waere denn Ostern ohne den Osterhasen?',
      includeSnippets: false,
    },
    software: {
      tonality: 'Professionell, sachlich, loesungsorientiert',
      addressing: 'Sie',
      structure: [
        'Problem-Statement',
        'Loesungsansatz',
        'Feature-Tabelle',
        'Systemanforderungen',
        'Dokumentations-Links',
      ],
      targetAudience: 'Shop-Betreiber, Entwickler, Agenturen',
      exampleIntro: 'Spam-Schutz ohne Google, ohne Cookies, ohne Bild-Puzzles.',
      includeSnippets: true,
    },
  },
  categoryMapping: {
    Software: 'software',
    Stickdateien: 'creative',
    Genaehtes: 'creative',
    '3D-Druck': 'creative',
  },
};
