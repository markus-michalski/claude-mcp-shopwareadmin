# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Nothing yet

### Changed
- Nothing yet

### Deprecated
- Nothing yet

### Removed
- Nothing yet

### Fixed
- Nothing yet

### Security
- Nothing yet

## [1.0.0] - 2026-02-20

### Added
- add SEO URL audit and management tools
- add cross-selling management with AI suggestions
- add read-only order tools (list, get, stats)
- add 6 media management tools for BFSG compliance
- add missing schema properties
- Add Flow Builder management tools
- Add mail template management tools
- add tags and searchKeywords to product update
- add SEO fields support to product update
- Add customFields support to product_update tool
- Add sales channel, tags and search keywords to product creation
- Add configurable tax rate and fix product creation
- Add category_update tool and fix Shopware ID validation
- Initial implementation of claude-mcp-shopwareadmin

### Changed
- upgrade dev-dependencies (eslint 10, vitest 4)
- update changelog with unreleased section link
- add MIT license and changelog
- remove security audit report from repo
- added package-lock.json to gitignore

### Fixed
- implement all 19 findings from security audit
- harden API client, auth, validation and add CI
- remove leftover locale references from snippet handlers
- align SnippetService and ProductService tests with actual implementation
- Include template content in sendTest payload
- Use Sync API for product updates with customFields
- Correct SnippetService for mmd-product-snippet plugin
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

[Unreleased]: https://github.com/markus-michalski/claude-mcp-shopwareadmin/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/markus-michalski/claude-mcp-shopwareadmin/releases/tag/v1.0.0
