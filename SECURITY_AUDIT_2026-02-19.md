# Security Audit Report: claude-mcp-shopwareadmin

**Datum:** 19.02.2026
**Scope:** Vollstaendige Codebase-Analyse (Source + Dependencies)
**Methode:** 3 spezialisierte Agents (Security Auditor, Backend Security Coder, Code Reviewer)
**Gesamtbewertung:** 7/10 - Solide Grundlage mit konkreten Luecken

---

## Findings-Uebersicht

| Severity | Anzahl | Status |
|----------|--------|--------|
| CRITICAL | 2 | Fix erforderlich |
| HIGH | 6 | Fix empfohlen |
| MEDIUM | 7 | Sollte behoben werden |
| LOW | 4 | Nice-to-have |

---

## CRITICAL

### C1: fileExtension wird ohne URL-Encoding in Query-String injiziert

**Datei:** `src/core/services/MediaService.ts:529`
**OWASP:** A03:2021 Injection

```typescript
`/api/_action/media/${mediaId}/upload?extension=${fileExtension}&fileName=...`
```

`fileExtension` wird direkt aus der URL extrahiert und **nicht** `encodeURIComponent`'d. Eine URL wie `https://evil.com/img.jpg%26admin=true` fuehrt zu Parameter-Injection im Shopware-API-Aufruf.

**Fix:** `encodeURIComponent(fileExtension)` - Einzeiler.

---

### C2: `parseResponse<T>` gibt `{} as T` fuer leere Responses zurueck

**Datei:** `src/infrastructure/shopware/ShopwareApiClient.ts:228`
**OWASP:** N/A (Type Safety)

```typescript
if (!text) {
  return {} as T;
}
```

Unsicherer Cast. Aufrufer erwarten ein vollstaendig typisiertes Objekt, bekommen aber `{}`. Das fuehrt zu Laufzeitfehlern bei Property-Access auf DELETE/PATCH-Responses.

**Fix:** Return-Typ auf `T | null` aendern, Aufrufer anpassen.

---

## HIGH

### H1: SSRF-Blocklist ist bypassbar

**Datei:** `src/application/schemas/MediaSchemas.ts:123-131`
**OWASP:** A10:2021 Server-Side Request Forgery

Fehlende Vektoren:
- IPv6-mapped IPv4: `::ffff:127.0.0.1`
- Dezimale IPs: `2130706433` (= 127.0.0.1)
- DNS-Rebinding (Domain resolvet zuerst extern, dann intern)
- Cloud-Metadata: `169.254.169.254` per DNS erreichbar (`metadata.google.internal`)
- `100.64.0.0/10` (AWS Shared Address Space) fehlt

**Kernproblem:** Die Validierung laeuft im MCP-Server, aber Shopware resolved die URL. Eine Blocklist kann DNS-Rebinding strukturell nicht verhindern.

**Fix:** Allowlist statt Blocklist, oder `media_upload_url` nur fuer bekannte Domains zulassen. Mindestens IPv6-Varianten und Cloud-Metadata-Domains ergaenzen.

---

### H2: `customFields` akzeptiert beliebige unvalidierte Werte

**Datei:** `src/application/schemas/ProductSchemas.ts:162-163`

```typescript
customFields: z.record(z.string(), z.unknown())
```

`z.unknown()` laesst beliebige Typen durch - tief verschachtelte Objekte, riesige Strings, Arrays. Kein Groessenlimit. Landet direkt in der Shopware API.

**Fix:** `z.record(z.string().max(255), z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]))`

---

### H3: 5 Services + index.ts ohne Tests

**Fehlende Test-Coverage:**

| Service | Risiko |
|---------|--------|
| MediaService | HOCH - SSRF-Schutz, BFSG-Audit, Upload-Cleanup |
| OrderService | MITTEL - Stats-Berechnung, Date-Filter |
| SeoUrlService | MITTEL - Audit-Logik, Duplicate-Detection |
| CrossSellingService | MITTEL - AI-Suggestion, Mapping |
| FlowService | NIEDRIG - Mostly read-only |
| index.ts (Handlers) | HOCH - Gesamte Tool-Dispatch-Logik |

10 von 15 Modulen getestet - die fehlenden sind teilweise sicherheitskritisch.

---

### H4: Monolithische index.ts (1.476 Zeilen)

Tool-Definitionen, Handler, Service-Wiring - alles in einer Datei. Doppelte Schema-Definitionen (JSON-Schema in ListTools + Zod-Schemas in `/application/schemas/`) die auseinanderlaufen koennen.

**Fix:** Aufteilung in `src/tools/definitions/`, `src/tools/handlers/`, `src/bootstrap.ts`. Zod-to-JSON-Schema fuer Single Source of Truth.

---

### H5: Rate-Limiting fuer Mail-Template-Tests ist per-Template, nicht global

**Datei:** `src/core/services/MailTemplateService.ts:95`

5 Calls/Minute **pro Template**. Bei 20 Templates = 100 Test-Mails/Minute. Kein globales Limit.

**Fix:** Zusaetzliches globales Rate-Limit (z.B. 10 Calls/Minute insgesamt).

---

### H6: MailTemplate Cleanup-Interval wird nie aufgeraeumt

**Datei:** `src/core/services/MailTemplateService.ts:109`

`setInterval` ohne `.unref()`, `destroy()` wird nirgendwo aufgerufen. Verhindert sauberen Node.js-Exit.

**Fix:** `.unref()` auf den Interval setzen.

---

## MEDIUM

### M1: URL-Konstruktion per String-Concat statt `new URL()`

**Datei:** `src/infrastructure/shopware/ShopwareApiClient.ts:69`

```typescript
const url = `${this.baseUrl}${endpoint}`;
```

**Fix:** `new URL(endpoint, this.baseUrl).toString()` verwenden.

---

### M2: SeoUrlService nutzt `Record<string, unknown>` statt typisierter Interfaces

**Datei:** `src/core/services/SeoUrlService.ts`

Der gesamte Service arbeitet mit untypisierter Rohdaten und castet mit `as string`, `as boolean`. Unterlauft Typsicherheit.

**Fix:** Private `ShopwareSeoUrl` Interface definieren (analog zu `ShopwareProduct` im ProductService).

---

### M3: OrderService.stats() laedt bis 500 Orders client-seitig

**Datei:** `src/core/services/OrderService.ts`

Statt Shopware-Aggregationen zu nutzen, werden bis zu 500 Orders geladen und in JavaScript aggregiert. Performance-Problem und falsche Ergebnisse ab Order 501.

**Fix:** Shopware `aggregations` API verwenden (`terms`, `sum`, `count`).

---

### M4: Date-Range-Filter gecastet als `number` statt `string`

**Datei:** `src/core/services/OrderService.ts`

```typescript
rangeParams as { gte?: number; lte?: number }
```

Die Werte sind ISO-8601-Strings, werden aber als `number` gecastet.

**Fix:** `SearchFilter` Range-Typ um String-Variante erweitern.

---

### M5: Shopware-URL/Endpoint in Fehlermeldungen exposed

**Datei:** `src/core/domain/Errors.ts:89` + `src/infrastructure/shopware/ShopwareApiClient.ts:275`

```typescript
case 404:
  return MCPError.notFound('Resource', endpoint);
```

API-Pfade landen ungefiltert in Error-Messages.

**Fix:** Endpoint aus Error-Messages entfernen oder auf Entity-Typ reduzieren.

---

### M6: OAuth-Token-Timing auf INFO-Level geloggt

**Datei:** `src/infrastructure/shopware/ShopwareAuthenticator.ts`

`expiresIn` und `expiresAt` auf INFO-Level sind unnoetig verbose. In Kombination mit Token-Timing koennte Token-Rotation vorhersagbar werden.

**Fix:** Auf DEBUG-Level herabstufen.

---

### M7: WikiJsService baut URLs per String-Concat ohne Encoding

**Datei:** `src/infrastructure/wikijs/WikiJsService.ts:70`

```typescript
return `${this.baseUrl}/${locale}/${system}/${slug}`;
```

`slug` wird nicht encoded. Ein Produktname mit `../` koennte die URL manipulieren.

**Fix:** `encodeURIComponent(slug)` verwenden.

---

## LOW

### L1: Hex-ID-Regex case-insensitive - Cache-Key-Kollisionen moeglich

**Datei:** `src/application/schemas/validators.ts:11`

```typescript
const SHOPWARE_HEX_ID_REGEX = /^[0-9a-f]{32}$/i;
```

Akzeptiert Uppercase-IDs, normalisiert aber nicht auf Lowercase. Cache-Keys koennen doppelt entstehen.

**Fix:** `.transform(v => v.toLowerCase())` nach Regex-Validierung.

---

### L2: `productNumber.min(1)` ohne `.trim()` - Leerzeichen passt

**Datei:** `src/application/schemas/ProductSchemas.ts:74`

Ein einzelnes Leerzeichen `" "` besteht die Validierung.

**Fix:** `.trim()` vor `.min(1)` einfuegen.

---

### L3: Hardcoded Default-URL fuer Wiki.js (produktionsspezifisch)

**Datei:** `src/config/Configuration.ts`

```typescript
optional('WIKIJS_BASE_URL', 'https://faq.markus-michalski.net')
```

Produktionsspezifische URL als Default.

**Fix:** Default entfernen oder auf Platzhalter setzen.

---

### L4: Kein `uncaughtException`/`unhandledRejection` Handler

**Datei:** `src/index.ts`

Unbehandelte Fehler fuehren zu stillem Crash ohne Logging.

**Fix:** Global Handler mit Logging hinzufuegen.

---

## Dependencies

18 Vulnerabilities (6 moderate, 12 high) - **alle in Dev-Dependencies** (eslint, vite, vitest).
**Keine Runtime-Dependencies betroffen** - nur 3 Runtime-Deps (@modelcontextprotocol/sdk, winston, zod).

**Fix:** `npm audit fix` fuer Dev-Dependencies ausfuehren.

---

## Positive Security-Patterns (bereits vorhanden)

- Zod-Validierung auf allen 37 Tool-Inputs
- Produkte werden IMMER inaktiv erstellt
- Orders sind read-only (kein Status-Change, keine Stornierung)
- OAuth2-Token-Deduplizierung gegen Race Conditions
- 30s Request-Timeout mit Exponential Backoff
- GDPR-konforme E-Mail-Maskierung in Logs
- Cache mit Size-Limit (500) und Auto-Prune
- `strict: true` + `noUncheckedIndexedAccess` in tsconfig
- Null `any` Vorkommen im Produktionscode
- `.env` in `.gitignore`
- Logging korrekt auf stderr (MCP-Protokoll auf stdout)
- Nur 3 Runtime-Dependencies (minimale Angriffsflaeche)

---

## Priorisierte Handlungsempfehlung

| Prio | Fix | Aufwand |
|------|-----|---------|
| 1 | C1: `encodeURIComponent(fileExtension)` | 5 Min |
| 2 | C2: `parseResponse` Return-Typ fixen | 30 Min |
| 3 | H2: `customFields` Zod-Schema einschraenken | 10 Min |
| 4 | H1: SSRF-Blocklist erweitern (IPv6, Dezimal-IPs) | 30 Min |
| 5 | H5+H6: Rate-Limiting global machen + Interval.unref() | 20 Min |
| 6 | M1-M7: Type-Safety und Medium Fixes | 1-2h |
| 7 | L1-L4: Low-Priority Fixes | 30 Min |
| 8 | H3: Tests fuer MediaService + OrderService + weitere | 2-4h |
| 9 | H4: index.ts aufteilen + zod-to-json-schema | 4-6h |
