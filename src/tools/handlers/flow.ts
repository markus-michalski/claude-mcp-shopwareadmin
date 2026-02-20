import {
  FlowListInput,
  FlowGetInput,
  FlowToggleInput,
} from '../../application/schemas.js';
import type { ServiceContainer, ToolHandler } from './types.js';

export function flowHandlers(services: ServiceContainer): Record<string, ToolHandler> {
  return {
    flow_list: async (args) => {
      const input = FlowListInput.parse(args);
      const result = await services.flow.list(input);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: result.flows.length,
            total: result.total,
            flows: result.flows,
          }, null, 2),
        }],
      };
    },

    flow_get: async (args) => {
      const input = FlowGetInput.parse(args);
      const flow = await services.flow.get(input);
      if (!flow) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: true, message: 'Flow not found' }, null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(flow, null, 2) }],
      };
    },

    flow_toggle: async (args) => {
      const input = FlowToggleInput.parse(args);
      const flow = await services.flow.toggle(input);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Flow ${input.active ? 'activated' : 'deactivated'}`,
            flow: {
              id: flow.id,
              name: flow.name,
              active: flow.active,
            },
          }, null, 2),
        }],
      };
    },
  };
}
