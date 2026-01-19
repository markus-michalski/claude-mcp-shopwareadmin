/**
 * Test fixtures for Mail Template API mocking
 */
import { MOCK_SALES_CHANNEL_ID } from './fixtures.js';

// =============================================================================
// Mail Template Type Fixtures
// =============================================================================

export const MOCK_MAIL_TEMPLATE_TYPE_ORDER_ID = 'mtt-order-confirmation-uuid';
export const MOCK_MAIL_TEMPLATE_TYPE_CUSTOMER_ID = 'mtt-customer-register-uuid';
export const MOCK_MAIL_TEMPLATE_TYPE_CONTACT_ID = 'mtt-contact-form-uuid';

export const MOCK_MAIL_TEMPLATE_TYPE_ORDER = {
  id: MOCK_MAIL_TEMPLATE_TYPE_ORDER_ID,
  technicalName: 'order_confirmation_mail',
  name: 'Bestellbestaetigung',
  availableEntities: {
    order: 'order',
    salesChannel: 'sales_channel',
  },
};

export const MOCK_MAIL_TEMPLATE_TYPE_CUSTOMER = {
  id: MOCK_MAIL_TEMPLATE_TYPE_CUSTOMER_ID,
  technicalName: 'customer_register',
  name: 'Kundenregistrierung',
  availableEntities: {
    customer: 'customer',
    salesChannel: 'sales_channel',
  },
};

export const MOCK_MAIL_TEMPLATE_TYPE_CONTACT = {
  id: MOCK_MAIL_TEMPLATE_TYPE_CONTACT_ID,
  technicalName: 'contact_form',
  name: 'Kontaktformular',
  availableEntities: {
    contactFormData: 'array',
    salesChannel: 'sales_channel',
  },
};

export const MOCK_MAIL_TEMPLATE_TYPE_LIST = [
  MOCK_MAIL_TEMPLATE_TYPE_ORDER,
  MOCK_MAIL_TEMPLATE_TYPE_CUSTOMER,
  MOCK_MAIL_TEMPLATE_TYPE_CONTACT,
];

// =============================================================================
// Mail Template Fixtures
// =============================================================================

export const MOCK_MAIL_TEMPLATE_ORDER_ID = 'mt-order-confirmation-uuid';
export const MOCK_MAIL_TEMPLATE_CUSTOMER_ID = 'mt-customer-register-uuid';
export const MOCK_MAIL_TEMPLATE_CONTACT_ID = 'mt-contact-form-uuid';

export const MOCK_MAIL_TEMPLATE_ORDER = {
  id: MOCK_MAIL_TEMPLATE_ORDER_ID,
  mailTemplateTypeId: MOCK_MAIL_TEMPLATE_TYPE_ORDER_ID,
  systemDefault: false,
  senderName: 'MM Kreativ Shop',
  subject: 'Deine Bestellung {{ order.orderNumber }} bei MM Kreativ',
  contentHtml: `<h1>Vielen Dank fuer deine Bestellung!</h1>
<p>Hallo {{ order.orderCustomer.firstName }},</p>
<p>wir haben deine Bestellung <strong>{{ order.orderNumber }}</strong> erhalten.</p>
<p>Gesamtsumme: {{ order.amountTotal|currency }}</p>`,
  contentPlain: `Vielen Dank fuer deine Bestellung!

Hallo {{ order.orderCustomer.firstName }},

wir haben deine Bestellung {{ order.orderNumber }} erhalten.

Gesamtsumme: {{ order.amountTotal|currency }}`,
  description: 'Standard-Bestellbestaetigung fuer den Shop',
  mailTemplateType: MOCK_MAIL_TEMPLATE_TYPE_ORDER,
  createdAt: '2025-01-01T10:00:00.000Z',
  updatedAt: '2025-01-14T15:00:00.000Z',
};

export const MOCK_MAIL_TEMPLATE_CUSTOMER = {
  id: MOCK_MAIL_TEMPLATE_CUSTOMER_ID,
  mailTemplateTypeId: MOCK_MAIL_TEMPLATE_TYPE_CUSTOMER_ID,
  systemDefault: true,
  senderName: null,
  subject: 'Willkommen bei MM Kreativ, {{ customer.firstName }}!',
  contentHtml: `<h1>Willkommen!</h1>
<p>Hallo {{ customer.firstName }},</p>
<p>vielen Dank fuer deine Registrierung bei MM Kreativ.</p>`,
  contentPlain: `Willkommen!

Hallo {{ customer.firstName }},

vielen Dank fuer deine Registrierung bei MM Kreativ.`,
  description: null,
  mailTemplateType: MOCK_MAIL_TEMPLATE_TYPE_CUSTOMER,
  createdAt: '2025-01-01T10:00:00.000Z',
  updatedAt: '2025-01-12T10:00:00.000Z',
};

export const MOCK_MAIL_TEMPLATE_CONTACT = {
  id: MOCK_MAIL_TEMPLATE_CONTACT_ID,
  mailTemplateTypeId: MOCK_MAIL_TEMPLATE_TYPE_CONTACT_ID,
  systemDefault: false,
  senderName: 'Kontaktformular',
  subject: 'Neue Kontaktanfrage von {{ contactFormData.firstName }}',
  contentHtml: `<h1>Neue Kontaktanfrage</h1>
<p><strong>Name:</strong> {{ contactFormData.firstName }} {{ contactFormData.lastName }}</p>
<p><strong>E-Mail:</strong> {{ contactFormData.email }}</p>
<p><strong>Nachricht:</strong></p>
<p>{{ contactFormData.comment }}</p>`,
  contentPlain: `Neue Kontaktanfrage

Name: {{ contactFormData.firstName }} {{ contactFormData.lastName }}
E-Mail: {{ contactFormData.email }}
Nachricht:
{{ contactFormData.comment }}`,
  description: 'Kontaktformular-Benachrichtigung',
  mailTemplateType: MOCK_MAIL_TEMPLATE_TYPE_CONTACT,
  createdAt: '2025-01-01T10:00:00.000Z',
  updatedAt: '2025-01-10T10:00:00.000Z',
};

export const MOCK_MAIL_TEMPLATE_LIST = [
  MOCK_MAIL_TEMPLATE_ORDER,
  MOCK_MAIL_TEMPLATE_CUSTOMER,
  MOCK_MAIL_TEMPLATE_CONTACT,
];

// =============================================================================
// Input Fixtures for Service Tests
// =============================================================================

export const MOCK_MAIL_TEMPLATE_UPDATE_INPUT = {
  id: MOCK_MAIL_TEMPLATE_ORDER_ID,
  subject: 'Bestellung #{{ order.orderNumber }} - Bestaetigung',
  contentHtml: '<p>Neuer HTML Content</p>',
  contentPlain: 'Neuer Plain Text Content',
};

export const MOCK_MAIL_TEMPLATE_SEND_TEST_INPUT = {
  mailTemplateId: MOCK_MAIL_TEMPLATE_ORDER_ID,
  recipient: 'test@example.com',
  salesChannelId: MOCK_SALES_CHANNEL_ID,
};

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a mock mail template with custom overrides
 */
export function createMockMailTemplate(
  overrides: Partial<typeof MOCK_MAIL_TEMPLATE_ORDER> = {}
) {
  return {
    ...MOCK_MAIL_TEMPLATE_ORDER,
    id: `mt-${Date.now()}-uuid`,
    ...overrides,
  };
}

/**
 * Create a mock mail template type with custom overrides
 */
export function createMockMailTemplateType(
  overrides: Partial<typeof MOCK_MAIL_TEMPLATE_TYPE_ORDER> = {}
) {
  return {
    ...MOCK_MAIL_TEMPLATE_TYPE_ORDER,
    id: `mtt-${Date.now()}-uuid`,
    ...overrides,
  };
}
