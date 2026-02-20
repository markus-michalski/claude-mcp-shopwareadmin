import { productHandlers } from './product.js';
import { categoryHandlers } from './category.js';
import { contentHandlers } from './content.js';
import { helperHandlers } from './helpers.js';
import { mailTemplateHandlers } from './mailTemplate.js';
import { flowHandlers } from './flow.js';
import { mediaHandlers } from './media.js';
import { orderHandlers } from './order.js';
import { crossSellingHandlers } from './crossSelling.js';
import { seoUrlHandlers } from './seoUrl.js';
import type { ServiceContainer, ToolHandler } from './types.js';

export type { ServiceContainer, ToolHandler, ToolResponse } from './types.js';

/**
 * Build a unified handler registry from all domain-specific handler groups.
 * Each key is a tool name, each value is the async handler function.
 */
export function buildHandlerRegistry(services: ServiceContainer): Record<string, ToolHandler> {
  return {
    ...productHandlers(services),
    ...categoryHandlers(services),
    ...contentHandlers(services),
    ...helperHandlers(services),
    ...mailTemplateHandlers(services),
    ...flowHandlers(services),
    ...mediaHandlers(services),
    ...orderHandlers(services),
    ...crossSellingHandlers(services),
    ...seoUrlHandlers(services),
  };
}
