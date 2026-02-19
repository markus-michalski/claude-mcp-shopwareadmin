import {
  CrossSellingListInput,
  CrossSellingGetInput,
  CrossSellingCreateInput,
  CrossSellingUpdateInput,
  CrossSellingSuggestInput,
} from '../../application/schemas.js';
import type { ServiceContainer, ToolHandler } from './types.js';

export function crossSellingHandlers(services: ServiceContainer): Record<string, ToolHandler> {
  return {
    cross_selling_list: async (args) => {
      const input = CrossSellingListInput.parse(args);
      const items = await services.crossSelling.list(input);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            productId: input.productId,
            count: items.length,
            crossSellings: items,
          }, null, 2),
        }],
      };
    },

    cross_selling_get: async (args) => {
      const input = CrossSellingGetInput.parse(args);
      const cs = await services.crossSelling.get(input);
      if (!cs) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: true, message: 'Cross-selling not found' }, null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(cs, null, 2) }],
      };
    },

    cross_selling_create: async (args) => {
      const input = CrossSellingCreateInput.parse(args);
      const cs = await services.crossSelling.create(input);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Cross-selling created',
            crossSelling: {
              id: cs.id,
              name: cs.name,
              type: cs.type,
              assignedProductCount: cs.assignedProducts.length,
            },
          }, null, 2),
        }],
      };
    },

    cross_selling_update: async (args) => {
      const input = CrossSellingUpdateInput.parse(args);
      const { id, ...updateData } = input;
      const cs = await services.crossSelling.update(id, updateData);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Cross-selling updated',
            crossSelling: {
              id: cs.id,
              name: cs.name,
              active: cs.active,
              assignedProductCount: cs.assignedProducts.length,
            },
            updated: Object.keys(updateData),
          }, null, 2),
        }],
      };
    },

    cross_selling_suggest: async (args) => {
      const input = CrossSellingSuggestInput.parse(args);
      const context = await services.crossSelling.suggest(input);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            suggestion: 'Cross-selling recommendation context',
            sourceProduct: context.sourceProduct,
            candidateCount: context.candidates.length,
            candidates: context.candidates,
            existingCrossSellings: context.existingCrossSellings,
            instructions: 'Based on the source product and candidates, recommend which products to group as cross-sellings. Consider: category overlap, price range compatibility, complementary use cases.',
          }, null, 2),
        }],
      };
    },
  };
}
