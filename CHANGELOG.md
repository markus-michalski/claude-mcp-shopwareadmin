# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- C1: File extension allowlist + `encodeURIComponent` for media upload URLs
- C2: `parseResponse<T>` returns `T | null` instead of unsafe `{} as T` cast
- H1: SSRF blocklist expanded (IPv6, cloud metadata, decimal IPs, AWS shared ranges)
- H2: `customFields` schema restricted (typed values, key length limits, max 50 entries)
- H5: Global rate limit (10/min) for mail template test sends
- H6: `setInterval.unref()` + graceful shutdown with `destroy()`
- M5: Entity type in error messages instead of full API endpoint paths
- M6: Token timing details moved to DEBUG log level
- L4: `uncaughtException`/`unhandledRejection` handlers + SIGINT/SIGTERM graceful shutdown

### Changed
- M1: URL construction via `new URL()` instead of string concatenation
- M2: `SeoUrlService` uses typed `ShopwareSeoUrl` interface instead of `Record<string, unknown>`
- M3: `OrderService.stats()` uses Shopware aggregations API instead of client-side computation
- M4: `SearchFilter` range type accepts `string | number`, removed unsafe casts
- M7: Wiki.js URL encoding with `encodeURIComponent`
- H4: Refactored monolithic `index.ts` (1497 lines) into modular handler architecture (126 lines)
- L1: Hex ID normalization to lowercase
- L2: `productNumber` trim before validation
- L3: Wiki.js default URL changed to empty string

### Added
- H3: Test coverage for MediaService, OrderService, SeoUrlService, CrossSellingService, FlowService (+156 tests, 379 total)
- Modular tool handler structure under `src/tools/handlers/`
- `src/bootstrap.ts` for service initialization

## [0.1.0] - 2026-01-15

### Added
- Initial implementation of MCP server for Shopware 6 Admin API
- Product management tools (create, list, get, update, search, set active)
- Category tools (list, get, update, generate content)
- Content generation tools (product descriptions, SEO metadata, variant content)
- Mail template tools (list, get, update, send test)
- Flow Builder tools (list, get, toggle)
- Media management tools (list, get, update, search, audit alt text, upload from URL)
- Order tools (list, get, stats)
- Cross-selling tools (list, get, create, update, suggest)
- SEO URL tools (list, audit, update, generate)
- Helper tools (properties, manufacturers, snippets)
- OAuth2 authentication with token caching
- SSRF protection for media uploads
- Rate limiting for mail test sends
- Wiki.js documentation link integration
- InMemoryCache with TTL support
