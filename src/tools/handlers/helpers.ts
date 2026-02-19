import {
  GetPropertiesInput,
  GetManufacturersInput,
  SnippetListInput,
} from '../../application/schemas.js';
import type { ServiceContainer, ToolHandler } from './types.js';

export function helperHandlers(services: ServiceContainer): Record<string, ToolHandler> {
  return {
    get_properties: async (args) => {
      const input = GetPropertiesInput.parse(args);
      const properties = await services.property.list(input.groupId);
      return {
        content: [{ type: 'text', text: JSON.stringify({ properties }, null, 2) }],
      };
    },

    get_manufacturers: async (args) => {
      const input = GetManufacturersInput.parse(args);
      const manufacturers = await services.manufacturer.list(input.search, input.limit ?? 50);
      return {
        content: [{ type: 'text', text: JSON.stringify({ manufacturers }, null, 2) }],
      };
    },

    snippet_list: async (args) => {
      const input = SnippetListInput.parse(args);
      const snippets = await services.snippet.list(input.activeOnly ?? true);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: snippets.length,
            snippets: snippets.map(s => ({
              identifier: s.identifier,
              name: s.name,
              active: s.active,
            })),
          }, null, 2),
        }],
      };
    },
  };
}
