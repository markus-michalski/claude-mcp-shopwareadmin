/**
 * Order domain types (read-only)
 *
 * Defines the structure of orders and related entities
 * for the Shopware 6 Admin API.
 * NOTE: Orders are read-only in this MCP server - no status changes.
 */

/**
 * Order status (state machine: order)
 */
export type OrderStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';

/**
 * Payment status (state machine: order_transaction)
 */
export type PaymentStatus =
  | 'open'
  | 'authorized'
  | 'paid'
  | 'paid_partially'
  | 'refunded'
  | 'refunded_partially'
  | 'failed'
  | 'cancelled'
  | 'unconfirmed'
  | 'reminded'
  | 'chargeback';

/**
 * Delivery status (state machine: order_delivery)
 */
export type DeliveryStatus =
  | 'open'
  | 'shipped'
  | 'shipped_partially'
  | 'returned'
  | 'returned_partially'
  | 'cancelled';

/**
 * Order customer reference
 */
export interface OrderCustomer {
  email: string;
  firstName: string;
  lastName: string;
  customerNumber: string | null;
  company: string | null;
}

/**
 * Order address
 */
export interface OrderAddress {
  firstName: string;
  lastName: string;
  street: string;
  zipcode: string | null;
  city: string;
  company: string | null;
  country: string | null;
  phoneNumber: string | null;
}

/**
 * Order line item (product, discount, etc.)
 */
export interface OrderLineItem {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  type: string | null;
  productId: string | null;
  productNumber: string | null;
  position: number;
}

/**
 * Order transaction (payment)
 */
export interface OrderTransaction {
  id: string;
  paymentMethodName: string | null;
  amount: number;
  status: string;
  statusTechnicalName: string;
}

/**
 * Order delivery (shipping)
 */
export interface OrderDelivery {
  id: string;
  shippingMethodName: string | null;
  trackingCodes: string[];
  shippingCosts: number;
  status: string;
  statusTechnicalName: string;
}

/**
 * Complete order entity with all details
 */
export interface Order {
  id: string;
  orderNumber: string;
  orderDateTime: string;
  amountTotal: number;
  amountNet: number;
  shippingTotal: number;
  currencySymbol: string;
  orderStatus: string;
  orderStatusTechnicalName: string;
  paymentStatus: string;
  paymentStatusTechnicalName: string;
  deliveryStatus: string;
  deliveryStatusTechnicalName: string;
  customer: OrderCustomer;
  billingAddress: OrderAddress | null;
  shippingAddress: OrderAddress | null;
  lineItems: OrderLineItem[];
  transactions: OrderTransaction[];
  deliveries: OrderDelivery[];
  salesChannelName: string | null;
  customerComment: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lightweight order for list views
 */
export interface OrderListItem {
  id: string;
  orderNumber: string;
  orderDateTime: string;
  amountTotal: number;
  currencySymbol: string;
  customerName: string;
  customerEmail: string;
  orderStatus: string;
  orderStatusTechnicalName: string;
  paymentStatus: string;
  paymentStatusTechnicalName: string;
  deliveryStatus: string;
  deliveryStatusTechnicalName: string;
  itemCount: number;
}

/**
 * Order statistics result
 */
export interface OrderStats {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  currencySymbol: string;
  byOrderStatus: Record<string, number>;
  byPaymentStatus: Record<string, number>;
  period: {
    from: string | null;
    to: string | null;
  };
}
