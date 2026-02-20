#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { MCPError } from './core/domain/Errors.js';
import { bootstrap } from './bootstrap.js';
import { toolDefinitions } from './tools/definitions.js';
import { buildHandlerRegistry } from './tools/handlers/index.js';

// Initialize infrastructure and services
const { config, logger, services, mailTemplateService } = bootstrap();

// Create MCP server
const server = new Server(
  {
    name: 'claude-mcp-shopwareadmin',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register all tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions,
}));

// Build dispatcher from all domain handler groups
const handlers = buildHandlerRegistry(services);

// Dispatch incoming tool calls to the appropriate handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const handler = handlers[name];
  if (!handler) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    return await handler(args);
  } catch (error) {
    if (error instanceof MCPError) {
      return {
        content: [{ type: 'text', text: JSON.stringify(error.toResponse(), null, 2) }],
        isError: true,
      };
    }

    // Zod validation errors
    if (error instanceof Error && error.name === 'ZodError') {
      const zodError = error as unknown as { errors: Array<{ path: string[]; message: string }> };
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: true,
            code: 'INVALID_INPUT',
            message: 'Validation failed',
            details: zodError.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          }, null, 2),
        }],
        isError: true,
      };
    }

    logger.error('Tool execution error', { tool: name, error: String(error) });
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  logger.info('Starting claude-mcp-shopwareadmin server', {
    version: '0.1.0',
    shopwareUrl: config.shopware.url,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Server connected and ready');
}

// Global error handlers to prevent silent crashes
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: String(error), stack: error.stack });
  mailTemplateService.destroy();
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

// Graceful shutdown
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info(`Received ${signal}, shutting down`);
    mailTemplateService.destroy();
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error('Failed to start server', { error: String(error) });
  mailTemplateService.destroy();
  process.exit(1);
});
