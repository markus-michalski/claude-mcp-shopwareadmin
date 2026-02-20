import {
  ProductGenerateContentInput,
  ProductGenerateSeoInput,
  VariantGenerateContentInput,
  ContentUpdateInput,
} from '../../application/schemas.js';
import type { ServiceContainer, ToolHandler } from './types.js';

export function contentHandlers(services: ServiceContainer): Record<string, ToolHandler> {
  return {
    product_generate_content: async (args) => {
      const input = ProductGenerateContentInput.parse(args);
      const prompt = await services.content.generateContentPrompt(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(prompt, null, 2) }],
      };
    },

    product_generate_seo: async (args) => {
      const input = ProductGenerateSeoInput.parse(args);
      const prompt = await services.content.generateSeoPrompt(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(prompt, null, 2) }],
      };
    },

    variant_generate_content: async (args) => {
      const input = VariantGenerateContentInput.parse(args);
      const prompt = await services.content.generateVariantPrompt(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(prompt, null, 2) }],
      };
    },

    content_update: async (args) => {
      const input = ContentUpdateInput.parse(args);
      const { productId, ...updateData } = input;
      const product = await services.product.update(productId, updateData);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Content updated',
            productId: product.id,
            updated: Object.keys(updateData),
          }, null, 2),
        }],
      };
    },
  };
}
