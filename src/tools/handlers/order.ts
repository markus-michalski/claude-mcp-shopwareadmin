import {
  OrderListInput,
  OrderGetInput,
  OrderStatsInput,
} from '../../application/schemas.js';
import type { ServiceContainer, ToolHandler } from './types.js';

export function orderHandlers(services: ServiceContainer): Record<string, ToolHandler> {
  return {
    order_list: async (args) => {
      const input = OrderListInput.parse(args);
      const result = await services.order.list(input);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: result.orders.length,
            total: result.total,
            orders: result.orders,
          }, null, 2),
        }],
      };
    },

    order_get: async (args) => {
      const input = OrderGetInput.parse(args);
      const order = await services.order.get(input);
      if (!order) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: true, message: 'Order not found' }, null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(order, null, 2) }],
      };
    },

    order_stats: async (args) => {
      const input = OrderStatsInput.parse(args);
      const stats = await services.order.stats(input);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            statistics: stats,
            summary: `${stats.totalOrders} orders, ${stats.totalRevenue} ${stats.currencySymbol} total revenue, ${stats.averageOrderValue} ${stats.currencySymbol} average`,
          }, null, 2),
        }],
      };
    },
  };
}
