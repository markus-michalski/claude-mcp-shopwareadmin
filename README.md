# claude-mcp-shopwareadmin

MCP Server for Shopware 6 shop management via Claude Code. 43 specialized tools for products, content generation, SEO, media, orders, mail templates, and more.

**Docs DE:** [faq.markus-michalski.net/de/mcp/shopware-admin](https://faq.markus-michalski.net/de/mcp/shopware-admin)
**Docs EN:** [faq.markus-michalski.net/en/mcp/shopware-admin](https://faq.markus-michalski.net/en/mcp/shopware-admin)

## Installation

```bash
git clone https://github.com/markus-michalski/claude-mcp-shopwareadmin.git
cd claude-mcp-shopwareadmin
npm install

# Environment konfigurieren
cp .env.example .env
# .env mit Shopware-Zugangsdaten befuellen

# Optional: Content-Profile anpassen
cp content-profiles.example.json content-profiles.json
# content-profiles.json bearbeiten (siehe Content Profiles)

npm run build
```

### Deployment

```bash
mkdir -p ~/.claude/mcp-servers/shopwareadmin
cp -r dist node_modules package.json .env ~/.claude/mcp-servers/shopwareadmin/
# Optional: content-profiles.json mitkopieren
```

### Claude Code registrieren

```bash
claude mcp add --scope user --transport stdio shopwareadmin -- \
  node ~/.claude/mcp-servers/shopwareadmin/dist/index.js
```

## Update

```bash
cd claude-mcp-shopwareadmin
git pull
npm install
npm run build

# Deployment aktualisieren
cp -r dist node_modules package.json ~/.claude/mcp-servers/shopwareadmin/
```

## Content Profiles

Die Content-Generierung nutzt konfigurierbare Style-Profile (Tonalitaet, Anrede, Struktur, Zielgruppe). Ohne eigene `content-profiles.json` werden die Built-in Defaults verwendet (creative + software).

Fuer eigene Profile:

```bash
cp content-profiles.example.json content-profiles.json
```

Jedes Profil definiert:

| Feld | Beschreibung | Beispiel |
|------|-------------|----------|
| `tonality` | Ton der Beschreibung | "Persoenlich, warm, emotional" |
| `addressing` | Anrede: `du` oder `Sie` | "du" |
| `structure` | Aufbau-Abschnitte | ["Einstieg", "Details", "Tipps"] |
| `targetAudience` | Zielgruppe | "Hobbybastler, Kreative" |
| `exampleIntro` | Beispiel-Einleitung | "Was waere Ostern ohne..." |
| `includeSnippets` | Snippets einbinden | `true` / `false` |

Profile werden ueber `categoryMapping` automatisch anhand der Produktkategorie erkannt. Der Stil kann auch manuell per `style`-Parameter erzwungen werden.

Pfad konfigurierbar ueber `CONTENT_PROFILES_PATH` in `.env` (Default: `./content-profiles.json`).

## Development

```bash
npm run typecheck   # TypeScript pruefen
npm run build       # Kompilieren
npm run dev         # Watch Mode
npm test            # Tests (Vitest)
```

## License

MIT - Markus Michalski
