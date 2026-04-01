# Contributing to Shopware Admin MCP Server

## Development Setup

```bash
git clone https://github.com/markus-michalski/claude-mcp-shopwareadmin.git
cd claude-mcp-shopwareadmin
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Shopware 6 API credentials

# Optional: Custom content profiles
cp content-profiles.example.json content-profiles.json

# Build TypeScript
npm run build
```

## Code Style

- **Language:** TypeScript (strict mode)
- **Indentation:** 2 spaces
- **Linting:** ESLint (`npm run lint`)
- **Type checking:** `npm run typecheck`
- **Comments:** English

## Architecture

```
src/
  index.ts                          # Entry point, MCP server setup
  config/Configuration.ts           # .env loader
  application/schemas/*.ts          # Zod schemas for all tools
  core/domain/*.ts                  # Domain entities (Product, Category, Content)
  infrastructure/shopware/*.ts      # Shopware API client + OAuth2
```

### Adding a New MCP Tool

1. Define a Zod schema in `src/application/schemas/`
2. Create the service method in the appropriate service
3. Register the tool handler in `src/index.ts`
4. Add tests

## Development Commands

```bash
npm run build          # Compile TypeScript
npm run dev            # Watch mode with tsx
npm run typecheck      # TypeScript check without emit
npm run lint           # ESLint
npm test               # Run tests (Vitest)
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
```

## Testing

Tests use [Vitest](https://vitest.dev/). Run with `npm test`.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new MCP tool
fix: correct a bug
docs: update documentation
refactor: restructure code
test: add or modify tests
```

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Ensure `npm run build`, `npm run lint`, and `npm test` pass
4. Open a PR with a clear description
