/**
 * MailTemplateService - Business logic for mail template management
 *
 * Implements all 4 mail template tool methods:
 * - list: List mail templates with optional search
 * - get: Get mail template by ID or technicalName
 * - update: Update mail template content
 * - sendTest: Send a test mail
 *
 * NOTE: No CREATE or DELETE operations - mail templates are managed
 * by Shopware/plugins, we only allow reading and updating content.
 */
import type { Logger } from '../../infrastructure/logging/Logger.js';
import type {
  ShopwareApiClient,
  SearchCriteria,
  SearchFilter,
} from '../../infrastructure/shopware/ShopwareApiClient.js';
import type { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import type {
  MailTemplate,
  MailTemplateListItem,
  SendTestMailResult,
} from '../domain/MailTemplate.js';
import type {
  MailTemplateListInput,
  MailTemplateGetInput,
  MailTemplateUpdateInput,
  MailTemplateSendTestInput,
} from '../../application/schemas/MailTemplateSchemas.js';
import { MCPError, ErrorCode } from '../domain/Errors.js';

/**
 * Cache TTL for mail templates: 10 minutes (they change rarely)
 */
const MAIL_TEMPLATE_CACHE_TTL = 10 * 60 * 1000;

/**
 * Cache key prefix for mail templates
 */
const CACHE_PREFIX = 'mailtemplate:';

/**
 * Standard associations to load with mail templates
 */
const MAIL_TEMPLATE_ASSOCIATIONS = {
  mailTemplateType: {},
};

/**
 * Rate limit configuration for sendTest
 * Prevents email-bombing and spam
 */
const SEND_TEST_RATE_LIMIT = {
  maxCallsPerTemplate: 5,   // Max calls per template per window
  maxCallsGlobal: 10,       // Max calls across all templates per window
  windowMs: 60 * 1000,      // 1 minute window
};

/**
 * Rate limit tracking entry
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Shopware raw mail template response structure
 */
interface ShopwareMailTemplate {
  id: string;
  mailTemplateTypeId: string;
  systemDefault: boolean;
  senderName: string | null;
  subject: string;
  contentHtml: string;
  contentPlain: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  mailTemplateType?: {
    id: string;
    technicalName: string;
    name: string;
    availableEntities: Record<string, string> | null;
  } | null;
}

export class MailTemplateService {
  /**
   * Per-template rate limit tracking for sendTest calls
   * Key: template ID, Value: call count and reset time
   */
  private readonly sendTestRateLimit = new Map<string, RateLimitEntry>();

  /**
   * Global rate limit tracking across all templates
   */
  private globalRateLimit: RateLimitEntry = { count: 0, resetAt: 0 };

  /**
   * Timer for cleaning up expired rate limit entries
   */
  private readonly rateLimitCleanupInterval: ReturnType<typeof setInterval>;

  constructor(
    private readonly api: ShopwareApiClient,
    private readonly cache: InMemoryCache,
    private readonly logger: Logger,
    private readonly defaultSalesChannelId: string
  ) {
    // Cleanup expired rate limit entries every minute
    // .unref() prevents this interval from keeping Node.js alive on shutdown
    this.rateLimitCleanupInterval = setInterval(() => {
      this.cleanupExpiredRateLimits();
    }, SEND_TEST_RATE_LIMIT.windowMs);
    this.rateLimitCleanupInterval.unref();
  }

  /**
   * Clean up resources when service is destroyed
   */
  destroy(): void {
    clearInterval(this.rateLimitCleanupInterval);
  }

  // ===========================================================================
  // list() - List mail templates
  // ===========================================================================

  /**
   * List mail templates with optional search
   *
   * Lists are NOT cached to ensure fresh data.
   */
  async list(input: MailTemplateListInput): Promise<{
    templates: MailTemplateListItem[];
    total: number;
  }> {
    const criteria: SearchCriteria = {
      limit: input.limit ?? 50,
      page: input.offset ? Math.floor(input.offset / (input.limit ?? 50)) + 1 : 1,
      associations: MAIL_TEMPLATE_ASSOCIATIONS,
      filter: [],
      sort: [{ field: 'mailTemplateType.name', order: 'ASC' }],
    };

    const filters: SearchFilter[] = [];

    // Search in template type name or subject
    if (input.search) {
      filters.push({
        type: 'multi',
        operator: 'OR',
        queries: [
          { type: 'contains', field: 'mailTemplateType.name', value: input.search },
          { type: 'contains', field: 'subject', value: input.search },
        ],
      });
    }

    criteria.filter = filters;

    const response = await this.api.search<ShopwareMailTemplate>('mail-template', criteria);

    const templates = response.data.map((t) => this.mapToListItem(t));

    return {
      templates,
      total: response.total,
    };
  }

  // ===========================================================================
  // get() - Get mail template by ID or technicalName
  // ===========================================================================

  /**
   * Get a mail template by ID or technical name
   *
   * Returns null if not found (doesn't throw).
   * Results are cached for 10 minutes.
   */
  async get(input: MailTemplateGetInput): Promise<MailTemplate | null> {
    const cacheKey = input.id
      ? `${CACHE_PREFIX}id:${input.id}`
      : `${CACHE_PREFIX}name:${input.technicalName}`;

    // Check cache first
    const cached = this.cache.get<MailTemplate>(cacheKey);
    if (cached) {
      this.logger.debug('Mail template from cache', { key: cacheKey });
      return cached;
    }

    // Build search criteria
    const criteria: SearchCriteria = {
      limit: 1,
      associations: MAIL_TEMPLATE_ASSOCIATIONS,
      filter: [],
    };

    if (input.id) {
      criteria.ids = [input.id];
    } else if (input.technicalName) {
      criteria.filter = [
        { type: 'equals', field: 'mailTemplateType.technicalName', value: input.technicalName },
      ];
    }

    try {
      const response = await this.api.search<ShopwareMailTemplate>('mail-template', criteria);

      const raw = response.data[0];
      if (!raw) {
        return null;
      }

      const template = this.mapToMailTemplate(raw);

      // Cache the result
      this.cache.set(cacheKey, template, MAIL_TEMPLATE_CACHE_TTL);

      // Also cache by both ID and technicalName for cross-lookup
      if (input.id && template.templateType) {
        this.cache.set(
          `${CACHE_PREFIX}name:${template.templateType.technicalName}`,
          template,
          MAIL_TEMPLATE_CACHE_TTL
        );
      } else if (input.technicalName) {
        this.cache.set(`${CACHE_PREFIX}id:${template.id}`, template, MAIL_TEMPLATE_CACHE_TTL);
      }

      return template;
    } catch (error) {
      if (error instanceof MCPError && error.code === ErrorCode.NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  // ===========================================================================
  // update() - Update mail template content
  // ===========================================================================

  /**
   * Update mail template content
   *
   * Only updates provided fields. Subject, contentHtml, contentPlain,
   * senderName, and description can be updated.
   */
  async update(
    id: string,
    data: Partial<Omit<MailTemplateUpdateInput, 'id'>>
  ): Promise<MailTemplate> {
    this.logger.info('Updating mail template', { id, fields: Object.keys(data) });

    const payload: Record<string, unknown> = {};

    if (data.subject !== undefined) payload.subject = data.subject;
    if (data.contentHtml !== undefined) payload.contentHtml = data.contentHtml;
    if (data.contentPlain !== undefined) payload.contentPlain = data.contentPlain;
    if (data.senderName !== undefined) payload.senderName = data.senderName;
    if (data.description !== undefined) payload.description = data.description;

    try {
      await this.api.patch(`/api/mail-template/${id}`, payload);
      this.invalidateCache(id);

      // Fetch and return updated template
      const updated = await this.get({ id });
      if (!updated) {
        throw MCPError.notFound('Mail template', id);
      }

      this.logger.info('Mail template updated', { id });
      return updated;
    } catch (error) {
      if (error instanceof MCPError && error.code === ErrorCode.NOT_FOUND) {
        throw MCPError.notFound('Mail template', id);
      }
      throw error;
    }
  }

  // ===========================================================================
  // sendTest() - Send a test mail
  // ===========================================================================

  /**
   * Send a test mail
   *
   * Uses testMode to generate mock data for Twig variables.
   * Requires the mail template to exist.
   * Rate limited to 5 calls per minute per template to prevent spam.
   */
  async sendTest(input: MailTemplateSendTestInput): Promise<SendTestMailResult> {
    // Check rate limit first
    this.checkSendTestRateLimit(input.mailTemplateId);

    // Mask email for logging (GDPR compliance)
    const maskedEmail = input.recipient.replace(/(.{2}).*(@.*)/, '$1***$2');
    this.logger.info('Sending test mail', {
      mailTemplateId: input.mailTemplateId,
      recipient: maskedEmail,
    });

    const salesChannelId = input.salesChannelId ?? this.defaultSalesChannelId;

    // First, get the template to verify it exists and get type info
    const template = await this.get({ id: input.mailTemplateId });
    if (!template) {
      throw MCPError.notFound('Mail template', input.mailTemplateId);
    }

    // Shopware API requires contentHtml, contentPlain, subject even in testMode
    // testMode only generates mock data for Twig variables, not for the content itself
    const payload = {
      mailTemplateId: input.mailTemplateId,
      salesChannelId,
      testMode: true,
      recipients: {
        [input.recipient]: input.recipient, // { email: displayName }
      },
      contentHtml: template.contentHtml,
      contentPlain: template.contentPlain,
      subject: template.subject,
      senderName: template.senderName ?? undefined,
    };

    try {
      await this.api.post('/api/_action/mail-template/send', payload);

      this.logger.info('Test mail sent', {
        mailTemplateId: input.mailTemplateId,
        recipient: input.recipient,
      });

      return {
        success: true,
        recipient: input.recipient,
        mailTemplateId: input.mailTemplateId,
        templateType: template.templateType?.technicalName ?? 'unknown',
      };
    } catch (error) {
      throw new MCPError(
        `Failed to send test mail: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.API_ERROR,
        true,
        'Check mail configuration in Shopware Admin'
      );
    }
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Check and enforce rate limit for sendTest calls
   * Throws MCPError if rate limit is exceeded
   */
  private checkSendTestRateLimit(templateId: string): void {
    const now = Date.now();

    // Check global rate limit first
    if (now >= this.globalRateLimit.resetAt) {
      this.globalRateLimit = { count: 1, resetAt: now + SEND_TEST_RATE_LIMIT.windowMs };
    } else if (this.globalRateLimit.count >= SEND_TEST_RATE_LIMIT.maxCallsGlobal) {
      const secondsRemaining = Math.ceil((this.globalRateLimit.resetAt - now) / 1000);
      throw new MCPError(
        `Global rate limit exceeded: Maximum ${SEND_TEST_RATE_LIMIT.maxCallsGlobal} test emails per minute`,
        ErrorCode.RATE_LIMITED,
        true,
        `Wait ${secondsRemaining} seconds before sending another test email`
      );
    } else {
      this.globalRateLimit.count++;
    }

    // Check per-template rate limit
    const entry = this.sendTestRateLimit.get(templateId);

    if (entry) {
      if (now >= entry.resetAt) {
        this.sendTestRateLimit.set(templateId, {
          count: 1,
          resetAt: now + SEND_TEST_RATE_LIMIT.windowMs,
        });
        return;
      }

      if (entry.count >= SEND_TEST_RATE_LIMIT.maxCallsPerTemplate) {
        const secondsRemaining = Math.ceil((entry.resetAt - now) / 1000);
        throw new MCPError(
          `Rate limit exceeded: Maximum ${SEND_TEST_RATE_LIMIT.maxCallsPerTemplate} test emails per minute for this template`,
          ErrorCode.RATE_LIMITED,
          true,
          `Wait ${secondsRemaining} seconds before sending another test email`
        );
      }

      entry.count++;
    } else {
      this.sendTestRateLimit.set(templateId, {
        count: 1,
        resetAt: now + SEND_TEST_RATE_LIMIT.windowMs,
      });
    }
  }

  /**
   * Invalidate cache for a mail template
   */
  private invalidateCache(id: string): void {
    const cached = this.cache.get<MailTemplate>(`${CACHE_PREFIX}id:${id}`);
    if (cached?.templateType) {
      this.cache.delete(`${CACHE_PREFIX}name:${cached.templateType.technicalName}`);
    }
    this.cache.delete(`${CACHE_PREFIX}id:${id}`);
  }

  /**
   * Map Shopware response to MailTemplate entity
   */
  private mapToMailTemplate(raw: ShopwareMailTemplate): MailTemplate {
    return {
      id: raw.id,
      mailTemplateTypeId: raw.mailTemplateTypeId,
      systemDefault: raw.systemDefault,
      senderName: raw.senderName,
      subject: raw.subject,
      contentHtml: raw.contentHtml,
      contentPlain: raw.contentPlain,
      description: raw.description,
      templateType: raw.mailTemplateType
        ? {
            id: raw.mailTemplateType.id,
            technicalName: raw.mailTemplateType.technicalName,
            name: raw.mailTemplateType.name,
            availableEntities: raw.mailTemplateType.availableEntities,
          }
        : null,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  /**
   * Map Shopware response to MailTemplateListItem
   */
  private mapToListItem(raw: ShopwareMailTemplate): MailTemplateListItem {
    return {
      id: raw.id,
      technicalName: raw.mailTemplateType?.technicalName ?? 'unknown',
      typeName: raw.mailTemplateType?.name ?? 'Unknown',
      subject: raw.subject,
      systemDefault: raw.systemDefault,
      updatedAt: raw.updatedAt,
    };
  }

  /**
   * Clean up expired rate limit entries to prevent memory leak
   */
  private cleanupExpiredRateLimits(): void {
    const now = Date.now();
    for (const [templateId, entry] of this.sendTestRateLimit) {
      if (now >= entry.resetAt) {
        this.sendTestRateLimit.delete(templateId);
      }
    }
  }
}
