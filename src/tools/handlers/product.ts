import {
  ProductCreateInput,
  ProductGetInput,
  ProductListInput,
  ProductSetActiveInput,
  ProductUpdateInput,
  SearchProductsInput,
} from '../../application/schemas.js';
import type { ServiceContainer, ToolHandler } from './types.js';

export function productHandlers(services: ServiceContainer): Record<string, ToolHandler> {
  return {
    product_create: async (args) => {
      const input = ProductCreateInput.parse(args);
      const product = await services.product.create(input);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Product created (inactive)',
            product: {
              id: product.id,
              productNumber: product.productNumber,
              name: product.name,
              active: product.active,
            },
          }, null, 2),
        }],
      };
    },

    product_get: async (args) => {
      const input = ProductGetInput.parse(args);
      const product = await services.product.get(input);
      if (!product) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: true, message: 'Product not found' }, null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(product, null, 2) }],
      };
    },

    product_list: async (args) => {
      const input = ProductListInput.parse(args);
      const result = await services.product.list(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },

    product_set_active: async (args) => {
      const input = ProductSetActiveInput.parse(args);
      await services.product.setActive(input.id, input.active);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Product ${input.active ? 'activated' : 'deactivated'}`,
            productId: input.id,
            active: input.active,
          }, null, 2),
        }],
      };
    },

    product_update: async (args) => {
      const input = ProductUpdateInput.parse(args);
      const { id, ...updateData } = input;
      const product = await services.product.update(id, updateData);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Product updated',
            product: {
              id: product.id,
              productNumber: product.productNumber,
              name: product.name,
            },
          }, null, 2),
        }],
      };
    },

    search_products: async (args) => {
      const input = SearchProductsInput.parse(args);
      const products = await services.product.search(input.query, input.limit ?? 20);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            query: input.query,
            count: products.length,
            products: products.map(p => ({
              id: p.id,
              productNumber: p.productNumber,
              name: p.name,
              active: p.active,
            })),
          }, null, 2),
        }],
      };
    },
  };
}
