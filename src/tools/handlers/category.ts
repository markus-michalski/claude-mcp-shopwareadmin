import {
  CategoryListInput,
  CategoryGetInput,
  CategoryGenerateContentInput,
  CategoryUpdateInput,
} from '../../application/schemas.js';
import type { ServiceContainer, ToolHandler } from './types.js';

export function categoryHandlers(services: ServiceContainer): Record<string, ToolHandler> {
  return {
    category_list: async (args) => {
      const input = CategoryListInput.parse(args);
      const categories = await services.category.list(input);
      return {
        content: [{ type: 'text', text: JSON.stringify({ categories }, null, 2) }],
      };
    },

    category_get: async (args) => {
      const input = CategoryGetInput.parse(args);
      const category = await services.category.get(input);
      if (!category) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: true, message: 'Category not found' }, null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(category, null, 2) }],
      };
    },

    category_generate_content: async (args) => {
      const input = CategoryGenerateContentInput.parse(args);
      const category = await services.category.get({ id: input.id, includeProducts: false, productLimit: 0 });
      if (!category) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: true, message: 'Category not found' }, null, 2) }],
          isError: true,
        };
      }
      const breadcrumb = await services.category.getBreadcrumb(input.id);
      const style = input.style ?? services.content.detectStyleFromBreadcrumb(breadcrumb);
      const profile = services.content.getProfile(style);
      const instructions = profile.addressing === 'Sie'
        ? `Generate professional SEO text. Use formal Sie-Form. Tonality: ${profile.tonality}. Target audience: ${profile.targetAudience}.`
        : `Generate engaging SEO text. Use informal Du-Form. Tonality: ${profile.tonality}. Target audience: ${profile.targetAudience}.`;
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            category: {
              id: category.id,
              name: category.name,
              breadcrumb,
            },
            style,
            maxLength: input.maxLength ?? 500,
            instructions,
          }, null, 2),
        }],
      };
    },

    category_update: async (args) => {
      const input = CategoryUpdateInput.parse(args);
      const { id, ...updateData } = input;
      const category = await services.category.update(id, updateData);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Category updated',
            category: {
              id: category.id,
              name: category.name,
              seoData: category.seoData,
            },
            updated: Object.keys(updateData),
          }, null, 2),
        }],
      };
    },
  };
}
