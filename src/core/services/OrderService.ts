/**
 * OrderService - Business logic for order management (read-only)
 *
 * Implements 3 order tool methods:
 * - list: List orders with filters (status, payment, date range, customer)
 * - get: Get order details by ID or order number
 * - stats: Get aggregated order statistics
 *
 * NOTE: Read-only. No status changes, cancellations, or modifications.
 */
import type { Logger } from '../../infrastructure/logging/Logger.js';
import type {
  ShopwareApiClient,
  SearchCriteria,
  SearchFilter,
} from '../../infrastructure/shopware/ShopwareApiClient.js';
import type { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import type {
  Order,
  OrderListItem,
  OrderStats,
  OrderCustomer,
  OrderAddress,
  OrderLineItem,
  OrderTransaction,
  OrderDelivery,
} from '../domain/Order.js';
import type {
  OrderListInput,
  OrderGetInput,
  OrderStatsInput,
} from '../../application/schemas/OrderSchemas.js';
import { MCPError, ErrorCode } from '../domain/Errors.js';

/**
 * Cache TTL for individual orders: 2 minutes (orders change frequently)
 */
const ORDER_CACHE_TTL = 2 * 60 * 1000;

/**
 * Cache key prefix
 */
const CACHE_PREFIX = 'order:';

/**
 * Associations for list view (lightweight)
 */
const ORDER_LIST_ASSOCIATIONS = {
  orderCustomer: {},
  stateMachineState: {},
  transactions: {
    associations: {
      stateMachineState: {},
    },
  },
  deliveries: {
    associations: {
      stateMachineState: {},
    },
  },
  lineItems: {},
  currency: {},
};

/**
 * Associations for detail view (full)
 */
const ORDER_DETAIL_ASSOCIATIONS = {
  ...ORDER_LIST_ASSOCIATIONS,
  transactions: {
    associations: {
      stateMachineState: {},
      paymentMethod: {},
    },
  },
  deliveries: {
    associations: {
      stateMachineState: {},
      shippingMethod: {},
      shippingOrderAddress: {
        associations: {
          country: {},
        },
      },
    },
  },
  lineItems: {
    associations: {
      product: {},
    },
  },
  billingAddress: {
    associations: {
      country: {},
    },
  },
  salesChannel: {},
};

/**
 * Shopware raw order response structure
 */
interface ShopwareOrder {
  id: string;
  orderNumber: string;
  orderDateTime: string;
  amountTotal: number;
  amountNet: number;
  shippingTotal: number;
  customerComment: string | null;
  createdAt: string;
  updatedAt: string;
  currency?: {
    symbol: string;
    shortName: string;
  } | null;
  stateMachineState?: {
    technicalName: string;
    name: string;
  } | null;
  orderCustomer?: {
    email: string;
    firstName: string;
    lastName: string;
    customerNumber: string | null;
    company: string | null;
  } | null;
  billingAddress?: {
    firstName: string;
    lastName: string;
    street: string;
    zipcode: string | null;
    city: string;
    company: string | null;
    phoneNumber: string | null;
    country?: { name: string } | null;
  } | null;
  salesChannel?: {
    name: string;
  } | null;
  lineItems?: Array<{
    id: string;
    label: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    type: string | null;
    productId: string | null;
    position: number;
    product?: {
      productNumber: string;
    } | null;
  }>;
  transactions?: Array<{
    id: string;
    amount: {
      totalPrice: number;
    };
    stateMachineState?: {
      technicalName: string;
      name: string;
    } | null;
    paymentMethod?: {
      name: string;
    } | null;
  }>;
  deliveries?: Array<{
    id: string;
    trackingCodes: string[];
    shippingCosts: {
      totalPrice: number;
    };
    stateMachineState?: {
      technicalName: string;
      name: string;
    } | null;
    shippingMethod?: {
      name: string;
    } | null;
    shippingOrderAddress?: {
      firstName: string;
      lastName: string;
      street: string;
      zipcode: string | null;
      city: string;
      company: string | null;
      phoneNumber: string | null;
      country?: { name: string } | null;
    } | null;
  }>;
}

export class OrderService {
  constructor(
    private readonly api: ShopwareApiClient,
    private readonly cache: InMemoryCache,
    private readonly logger: Logger
  ) {}

  // ===========================================================================
  // list() - List orders with filters
  // ===========================================================================

  /**
   * List orders with optional filters
   *
   * Supports filtering by status, payment status, delivery status,
   * customer email, and date range. Sorted by date descending (newest first).
   */
  async list(input: OrderListInput): Promise<{
    orders: OrderListItem[];
    total: number;
  }> {
    const criteria: SearchCriteria = {
      limit: input.limit ?? 25,
      page: input.offset ? Math.floor(input.offset / (input.limit ?? 25)) + 1 : 1,
      associations: ORDER_LIST_ASSOCIATIONS,
      filter: [],
      sort: [{ field: 'orderDateTime', order: 'DESC' }],
    };

    const filters: SearchFilter[] = [];

    // Filter by order status
    if (input.orderStatus) {
      filters.push({
        type: 'equals',
        field: 'stateMachineState.technicalName',
        value: input.orderStatus,
      });
    }

    // Filter by payment status
    if (input.paymentStatus) {
      filters.push({
        type: 'equals',
        field: 'transactions.stateMachineState.technicalName',
        value: input.paymentStatus,
      });
    }

    // Filter by delivery status
    if (input.deliveryStatus) {
      filters.push({
        type: 'equals',
        field: 'deliveries.stateMachineState.technicalName',
        value: input.deliveryStatus,
      });
    }

    // Filter by customer email (partial match)
    if (input.customerEmail) {
      filters.push({
        type: 'contains',
        field: 'orderCustomer.email',
        value: input.customerEmail,
      });
    }

    // Filter by date range
    if (input.dateFrom || input.dateTo) {
      const rangeParams: Record<string, string> = {};
      if (input.dateFrom) rangeParams.gte = input.dateFrom;
      if (input.dateTo) rangeParams.lte = input.dateTo;
      filters.push({
        type: 'range',
        field: 'orderDateTime',
        parameters: rangeParams as { gte?: number; lte?: number },
      });
    }

    criteria.filter = filters;

    const response = await this.api.search<ShopwareOrder>('order', criteria);

    const orders = response.data.map((o) => this.mapToListItem(o));

    return {
      orders,
      total: response.total,
    };
  }

  // ===========================================================================
  // get() - Get order details
  // ===========================================================================

  /**
   * Get a single order by ID or order number
   *
   * Returns full order details including line items, transactions,
   * deliveries, and addresses. Cached for 2 minutes.
   */
  async get(input: OrderGetInput): Promise<Order | null> {
    const cacheKey = input.id
      ? `${CACHE_PREFIX}id:${input.id}`
      : `${CACHE_PREFIX}number:${input.orderNumber}`;

    // Check cache first
    const cached = this.cache.get<Order>(cacheKey);
    if (cached) {
      this.logger.debug('Order from cache', { key: cacheKey });
      return cached;
    }

    const criteria: SearchCriteria = {
      limit: 1,
      associations: ORDER_DETAIL_ASSOCIATIONS,
    };

    if (input.id) {
      criteria.ids = [input.id];
    } else if (input.orderNumber) {
      criteria.filter = [
        { type: 'equals', field: 'orderNumber', value: input.orderNumber },
      ];
    }

    try {
      const response = await this.api.search<ShopwareOrder>('order', criteria);

      const raw = response.data[0];
      if (!raw) {
        return null;
      }

      const order = this.mapToOrder(raw);

      // Cache by both ID and orderNumber
      this.cache.set(`${CACHE_PREFIX}id:${order.id}`, order, ORDER_CACHE_TTL);
      this.cache.set(`${CACHE_PREFIX}number:${order.orderNumber}`, order, ORDER_CACHE_TTL);

      return order;
    } catch (error) {
      if (error instanceof MCPError && error.code === ErrorCode.NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  // ===========================================================================
  // stats() - Get order statistics
  // ===========================================================================

  /**
   * Get aggregated order statistics
   *
   * Returns total orders, revenue, average order value,
   * and breakdowns by order/payment status.
   */
  async stats(input: OrderStatsInput): Promise<OrderStats> {
    this.logger.info('Fetching order statistics', {
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });

    const criteria: SearchCriteria = {
      limit: 1,
      filter: [],
      associations: {
        stateMachineState: {},
        transactions: {
          associations: {
            stateMachineState: {},
          },
        },
        currency: {},
      },
    };

    const filters: SearchFilter[] = [];

    // Date range filter
    if (input.dateFrom || input.dateTo) {
      const rangeParams: Record<string, string> = {};
      if (input.dateFrom) rangeParams.gte = input.dateFrom;
      if (input.dateTo) rangeParams.lte = input.dateTo;
      filters.push({
        type: 'range',
        field: 'orderDateTime',
        parameters: rangeParams as { gte?: number; lte?: number },
      });
    }

    criteria.filter = filters;

    // Fetch all orders to compute stats (limited approach for now)
    // For large shops, this should use aggregations
    const allCriteria: SearchCriteria = {
      ...criteria,
      limit: 500,
      associations: {
        stateMachineState: {},
        transactions: {
          associations: {
            stateMachineState: {},
          },
        },
        currency: {},
      },
    };

    const response = await this.api.search<ShopwareOrder>('order', allCriteria);

    // Compute statistics
    let totalRevenue = 0;
    const orderStatusCounts: Record<string, number> = {};
    const paymentStatusCounts: Record<string, number> = {};
    let currencySymbol = 'EUR';

    for (const order of response.data) {
      totalRevenue += order.amountTotal;

      // Currency from first order
      if (order.currency?.symbol) {
        currencySymbol = order.currency.symbol;
      }

      // Order status breakdown
      const orderState = order.stateMachineState?.technicalName ?? 'unknown';
      orderStatusCounts[orderState] = (orderStatusCounts[orderState] ?? 0) + 1;

      // Payment status breakdown (from primary transaction)
      const paymentState =
        order.transactions?.[0]?.stateMachineState?.technicalName ?? 'unknown';
      paymentStatusCounts[paymentState] = (paymentStatusCounts[paymentState] ?? 0) + 1;
    }

    const totalOrders = response.total;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / response.data.length : 0;

    return {
      totalOrders,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      currencySymbol,
      byOrderStatus: orderStatusCounts,
      byPaymentStatus: paymentStatusCounts,
      period: {
        from: input.dateFrom ?? null,
        to: input.dateTo ?? null,
      },
    };
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Map Shopware response to full Order entity
   */
  private mapToOrder(raw: ShopwareOrder): Order {
    const primaryTransaction = raw.transactions?.[0];
    const primaryDelivery = raw.deliveries?.[0];

    return {
      id: raw.id,
      orderNumber: raw.orderNumber,
      orderDateTime: raw.orderDateTime,
      amountTotal: raw.amountTotal,
      amountNet: raw.amountNet,
      shippingTotal: raw.shippingTotal,
      currencySymbol: raw.currency?.symbol ?? 'EUR',
      orderStatus: raw.stateMachineState?.name ?? 'Unknown',
      orderStatusTechnicalName: raw.stateMachineState?.technicalName ?? 'unknown',
      paymentStatus: primaryTransaction?.stateMachineState?.name ?? 'Unknown',
      paymentStatusTechnicalName:
        primaryTransaction?.stateMachineState?.technicalName ?? 'unknown',
      deliveryStatus: primaryDelivery?.stateMachineState?.name ?? 'Unknown',
      deliveryStatusTechnicalName:
        primaryDelivery?.stateMachineState?.technicalName ?? 'unknown',
      customer: this.mapCustomer(raw.orderCustomer),
      billingAddress: this.mapAddress(raw.billingAddress),
      shippingAddress: this.mapAddress(primaryDelivery?.shippingOrderAddress),
      lineItems: this.mapLineItems(raw.lineItems),
      transactions: this.mapTransactions(raw.transactions),
      deliveries: this.mapDeliveries(raw.deliveries),
      salesChannelName: raw.salesChannel?.name ?? null,
      customerComment: raw.customerComment,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  /**
   * Map Shopware response to lightweight OrderListItem
   */
  private mapToListItem(raw: ShopwareOrder): OrderListItem {
    const primaryTransaction = raw.transactions?.[0];
    const primaryDelivery = raw.deliveries?.[0];

    return {
      id: raw.id,
      orderNumber: raw.orderNumber,
      orderDateTime: raw.orderDateTime,
      amountTotal: raw.amountTotal,
      currencySymbol: raw.currency?.symbol ?? 'EUR',
      customerName: raw.orderCustomer
        ? `${raw.orderCustomer.firstName} ${raw.orderCustomer.lastName}`
        : 'Unknown',
      customerEmail: raw.orderCustomer?.email ?? '',
      orderStatus: raw.stateMachineState?.name ?? 'Unknown',
      orderStatusTechnicalName: raw.stateMachineState?.technicalName ?? 'unknown',
      paymentStatus: primaryTransaction?.stateMachineState?.name ?? 'Unknown',
      paymentStatusTechnicalName:
        primaryTransaction?.stateMachineState?.technicalName ?? 'unknown',
      deliveryStatus: primaryDelivery?.stateMachineState?.name ?? 'Unknown',
      deliveryStatusTechnicalName:
        primaryDelivery?.stateMachineState?.technicalName ?? 'unknown',
      itemCount: raw.lineItems?.filter((li) => li.type === 'product').length ?? 0,
    };
  }

  /**
   * Map order customer
   */
  private mapCustomer(
    raw: ShopwareOrder['orderCustomer']
  ): OrderCustomer {
    if (!raw) {
      return {
        email: '',
        firstName: '',
        lastName: '',
        customerNumber: null,
        company: null,
      };
    }

    return {
      email: raw.email,
      firstName: raw.firstName,
      lastName: raw.lastName,
      customerNumber: raw.customerNumber,
      company: raw.company,
    };
  }

  /**
   * Map address (billing or shipping)
   */
  private mapAddress(
    raw?: {
      firstName: string;
      lastName: string;
      street: string;
      zipcode: string | null;
      city: string;
      company: string | null;
      phoneNumber: string | null;
      country?: { name: string } | null;
    } | null
  ): OrderAddress | null {
    if (!raw) return null;

    return {
      firstName: raw.firstName,
      lastName: raw.lastName,
      street: raw.street,
      zipcode: raw.zipcode,
      city: raw.city,
      company: raw.company,
      country: raw.country?.name ?? null,
      phoneNumber: raw.phoneNumber,
    };
  }

  /**
   * Map line items sorted by position
   */
  private mapLineItems(
    raw: ShopwareOrder['lineItems']
  ): OrderLineItem[] {
    if (!raw) return [];

    return raw
      .sort((a, b) => a.position - b.position)
      .map((li) => ({
        id: li.id,
        label: li.label,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        totalPrice: li.totalPrice,
        type: li.type,
        productId: li.productId,
        productNumber: li.product?.productNumber ?? null,
        position: li.position,
      }));
  }

  /**
   * Map transactions
   */
  private mapTransactions(
    raw: ShopwareOrder['transactions']
  ): OrderTransaction[] {
    if (!raw) return [];

    return raw.map((t) => ({
      id: t.id,
      paymentMethodName: t.paymentMethod?.name ?? null,
      amount: t.amount.totalPrice,
      status: t.stateMachineState?.name ?? 'Unknown',
      statusTechnicalName: t.stateMachineState?.technicalName ?? 'unknown',
    }));
  }

  /**
   * Map deliveries
   */
  private mapDeliveries(
    raw: ShopwareOrder['deliveries']
  ): OrderDelivery[] {
    if (!raw) return [];

    return raw.map((d) => ({
      id: d.id,
      shippingMethodName: d.shippingMethod?.name ?? null,
      trackingCodes: d.trackingCodes ?? [],
      shippingCosts: d.shippingCosts.totalPrice,
      status: d.stateMachineState?.name ?? 'Unknown',
      statusTechnicalName: d.stateMachineState?.technicalName ?? 'unknown',
    }));
  }
}
