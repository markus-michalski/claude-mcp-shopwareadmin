# claude-mcp-shopwareadmin

MCP-Server fuer die Verwaltung von Produkten, Kategorien und Content-Generierung in Shopware 6 via Claude Code.

## Projekt-Status

**ALLE PHASEN ABGESCHLOSSEN** - Produktionsbereit

- [x] Phase 1: Grundgeruest (Configuration, Logger, OAuth2)
- [x] Phase 2: Produkt-Tools (ProductService, 6 Tools)
- [x] Phase 3: Content-Generierung (ContentService, SnippetService, WikiJsService)
- [x] Phase 4: Kategorien + Helpers (CategoryService, PropertyService, ManufacturerService)
- [x] Phase 5: Tests (188 Tests, alle bestanden)

**16 MCP Tools implementiert:**
- product_create, product_get, product_list, product_update, product_set_active, search_products
- product_generate_content, product_generate_seo, variant_generate_content, content_update
- category_list, category_get, category_generate_content
- get_properties, get_manufacturers, snippet_list

## Architektur

Siehe `ARCHITECTURE.md` fuer vollstaendige Dokumentation.

## Wichtige Dateien

| Datei | Beschreibung |
|-------|--------------|
| `src/index.ts` | Entry Point, MCP Server Setup, Tool-Handler |
| `src/config/Configuration.ts` | .env Loader |
| `src/application/schemas/*.ts` | Zod-Schemas fuer alle Tools |
| `src/core/domain/*.ts` | Domain-Entities (Product, Category, Content, Errors) |
| `src/infrastructure/shopware/*.ts` | Shopware API Client + OAuth2 |

## Entwicklung

```bash
# Dependencies installieren
npm install

# TypeScript kompilieren
npm run build

# Dev-Mode (Hot-Reload)
npm run dev

# Type-Check
npm run typecheck

# Tests (wenn vorhanden)
npm test
```

## Deployment

```bash
# 1. Build
npm run build

# 2. Deploy nach ~/.claude/mcp-servers/
mkdir -p ~/.claude/mcp-servers/shopwareadmin
cp -r dist node_modules package.json .env ~/.claude/mcp-servers/shopwareadmin/

# 3. Registrieren (global)
claude mcp add --scope user --transport stdio shopwareadmin -- \
  node ~/.claude/mcp-servers/shopwareadmin/dist/index.js

# 4. Verify
claude mcp list
```

## Ticket-Referenz

osTicket #115291 - "MCP: shopware-admin - Produkt- und Content-Verwaltung via Claude"

## Kernphilosophie

1. **User** legt Varianten und Bilder an
2. **Claude** uebernimmt Texte, SEO und Verwaltung
3. Artikel werden **IMMER inaktiv** angelegt (Sicherheit)
4. Nur **ein Sales Channel** (kein Headless)
