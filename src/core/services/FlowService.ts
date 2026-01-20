/**
 * FlowService - Business logic for Shopware Flow Builder management
 *
 * Implements flow tool methods:
 * - list: List flows with optional filters
 * - get: Get flow by ID or name with all sequences
 * - toggle: Activate/deactivate a flow
 *
 * NOTE: We don't implement CREATE/DELETE for flows as they are complex
 * and should be managed via Shopware Admin UI.
 */
import type { Logger } from '../../infrastructure/logging/Logger.js';
import type {
  ShopwareApiClient,
  SearchCriteria,
  SearchFilter,
} from '../../infrastructure/shopware/ShopwareApiClient.js';
import type { InMemoryCache } from '../../infrastructure/cache/InMemoryCache.js';
import type {
  Flow,
  FlowListItem,
  FlowSequence,
} from '../domain/Flow.js';
import { MAIL_SENDING_ACTIONS } from '../domain/Flow.js';
import type {
  FlowListInput,
  FlowGetInput,
  FlowToggleInput,
} from '../../application/schemas/FlowSchemas.js';
import { MCPError, ErrorCode } from '../domain/Errors.js';

/**
 * Cache TTL for flows: 5 minutes
 */
const FLOW_CACHE_TTL = 5 * 60 * 1000;

/**
 * Cache key prefix
 */
const CACHE_PREFIX = 'flow:';

/**
 * Standard associations to load with flows
 */
const FLOW_ASSOCIATIONS = {
  sequences: {
    associations: {
      rule: {},
    },
  },
};

/**
 * Shopware raw flow response structure
 */
interface ShopwareFlow {
  id: string;
  name: string;
  eventName: string;
  priority: number;
  active: boolean;
  invalid: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string | null;
  sequences?: ShopwareFlowSequence[];
}

/**
 * Shopware raw flow sequence structure
 */
interface ShopwareFlowSequence {
  id: string;
  parentId: string | null;
  flowId: string;
  ruleId: string | null;
  actionName: string | null;
  config: Record<string, unknown> | null;
  position: number;
  displayGroup: number;
  trueCase: boolean;
  rule?: {
    id: string;
    name: string;
    priority: number;
  } | null;
}

export class FlowService {
  constructor(
    private readonly api: ShopwareApiClient,
    private readonly cache: InMemoryCache,
    private readonly logger: Logger
  ) {}

  // ===========================================================================
  // list() - List flows
  // ===========================================================================

  /**
   * List flows with optional filters
   *
   * When hasMailAction is true, filters to flows that contain mail-sending actions.
   */
  async list(input: FlowListInput): Promise<{
    flows: FlowListItem[];
    total: number;
  }> {
    const criteria: SearchCriteria = {
      limit: input.limit ?? 50,
      page: input.offset ? Math.floor(input.offset / (input.limit ?? 50)) + 1 : 1,
      associations: FLOW_ASSOCIATIONS,
      filter: [],
      sort: [{ field: 'name', order: 'ASC' }],
    };

    const filters: SearchFilter[] = [];

    // Filter by active status
    if (input.active !== undefined) {
      filters.push({
        type: 'equals',
        field: 'active',
        value: input.active,
      });
    }

    // Filter by event name
    if (input.eventName) {
      filters.push({
        type: 'equals',
        field: 'eventName',
        value: input.eventName,
      });
    }

    // Search in name or description
    if (input.search) {
      filters.push({
        type: 'multi',
        operator: 'OR',
        queries: [
          { type: 'contains', field: 'name', value: input.search },
          { type: 'contains', field: 'description', value: input.search },
        ],
      });
    }

    criteria.filter = filters;

    const response = await this.api.search<ShopwareFlow>('flow', criteria);

    let flows = response.data.map((f) => this.mapToListItem(f));

    // Filter by mail action (post-fetch, as we need to check sequences)
    if (input.hasMailAction === true) {
      flows = flows.filter((f) => f.hasMailAction);
    } else if (input.hasMailAction === false) {
      flows = flows.filter((f) => !f.hasMailAction);
    }

    return {
      flows,
      total: input.hasMailAction !== undefined ? flows.length : response.total,
    };
  }

  // ===========================================================================
  // get() - Get flow by ID or name
  // ===========================================================================

  /**
   * Get a flow by ID or name
   *
   * Returns null if not found (doesn't throw).
   * Results are cached for 5 minutes.
   */
  async get(input: FlowGetInput): Promise<Flow | null> {
    const cacheKey = input.id
      ? `${CACHE_PREFIX}id:${input.id}`
      : `${CACHE_PREFIX}name:${input.name}`;

    // Check cache first
    const cached = this.cache.get<Flow>(cacheKey);
    if (cached) {
      this.logger.debug('Flow from cache', { key: cacheKey });
      return cached;
    }

    // Build search criteria
    const criteria: SearchCriteria = {
      limit: 1,
      associations: FLOW_ASSOCIATIONS,
      filter: [],
    };

    if (input.id) {
      criteria.ids = [input.id];
    } else if (input.name) {
      criteria.filter = [
        { type: 'equals', field: 'name', value: input.name },
      ];
    }

    try {
      const response = await this.api.search<ShopwareFlow>('flow', criteria);

      const raw = response.data[0];
      if (!raw) {
        return null;
      }

      const flow = this.mapToFlow(raw);

      // Cache the result
      this.cache.set(cacheKey, flow, FLOW_CACHE_TTL);

      // Also cache by both ID and name for cross-lookup
      if (input.id) {
        this.cache.set(`${CACHE_PREFIX}name:${flow.name}`, flow, FLOW_CACHE_TTL);
      } else if (input.name) {
        this.cache.set(`${CACHE_PREFIX}id:${flow.id}`, flow, FLOW_CACHE_TTL);
      }

      return flow;
    } catch (error) {
      if (error instanceof MCPError && error.code === ErrorCode.NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  // ===========================================================================
  // toggle() - Activate/deactivate a flow
  // ===========================================================================

  /**
   * Toggle flow active status
   */
  async toggle(input: FlowToggleInput): Promise<Flow> {
    this.logger.info('Toggling flow', { id: input.id, active: input.active });

    try {
      await this.api.patch(`/api/flow/${input.id}`, { active: input.active });
      this.invalidateCache(input.id);

      // Fetch and return updated flow
      const updated = await this.get({ id: input.id });
      if (!updated) {
        throw MCPError.notFound('Flow', input.id);
      }

      this.logger.info('Flow toggled', { id: input.id, active: input.active });
      return updated;
    } catch (error) {
      if (error instanceof MCPError && error.code === ErrorCode.NOT_FOUND) {
        throw MCPError.notFound('Flow', input.id);
      }
      throw error;
    }
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Invalidate cache for a flow
   */
  private invalidateCache(id: string): void {
    const cached = this.cache.get<Flow>(`${CACHE_PREFIX}id:${id}`);
    if (cached) {
      this.cache.delete(`${CACHE_PREFIX}name:${cached.name}`);
    }
    this.cache.delete(`${CACHE_PREFIX}id:${id}`);
  }

  /**
   * Check if a flow contains mail-sending actions
   */
  private hasMailSendingAction(sequences: ShopwareFlowSequence[]): boolean {
    return sequences.some(
      (seq) =>
        seq.actionName &&
        MAIL_SENDING_ACTIONS.includes(seq.actionName as typeof MAIL_SENDING_ACTIONS[number])
    );
  }

  /**
   * Count non-null actions in sequences
   */
  private countActions(sequences: ShopwareFlowSequence[]): number {
    return sequences.filter((seq) => seq.actionName !== null).length;
  }

  /**
   * Map Shopware response to Flow entity
   */
  private mapToFlow(raw: ShopwareFlow): Flow {
    const sequences = (raw.sequences ?? []).map((seq) => this.mapToSequence(seq));

    // Build hierarchy (nest children under parents)
    const sequenceMap = new Map<string, FlowSequence>();
    sequences.forEach((seq) => sequenceMap.set(seq.id, seq));

    const rootSequences: FlowSequence[] = [];
    sequences.forEach((seq) => {
      if (seq.parentId) {
        const parent = sequenceMap.get(seq.parentId);
        if (parent) {
          parent.children = parent.children ?? [];
          parent.children.push(seq);
        }
      } else {
        rootSequences.push(seq);
      }
    });

    // Sort sequences by position
    const sortByPosition = (a: FlowSequence, b: FlowSequence) => a.position - b.position;
    rootSequences.sort(sortByPosition);
    rootSequences.forEach((seq) => {
      if (seq.children) {
        seq.children.sort(sortByPosition);
      }
    });

    return {
      id: raw.id,
      name: raw.name,
      eventName: raw.eventName,
      priority: raw.priority,
      active: raw.active,
      invalid: raw.invalid,
      description: raw.description,
      sequences: rootSequences,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  /**
   * Map Shopware sequence to FlowSequence
   */
  private mapToSequence(raw: ShopwareFlowSequence): FlowSequence {
    return {
      id: raw.id,
      parentId: raw.parentId,
      flowId: raw.flowId,
      ruleId: raw.ruleId,
      actionName: raw.actionName,
      config: raw.config,
      position: raw.position,
      displayGroup: raw.displayGroup,
      trueCase: raw.trueCase,
      rule: raw.rule
        ? {
            id: raw.rule.id,
            name: raw.rule.name,
            priority: raw.rule.priority,
          }
        : null,
    };
  }

  /**
   * Map Shopware response to FlowListItem
   */
  private mapToListItem(raw: ShopwareFlow): FlowListItem {
    const sequences = raw.sequences ?? [];
    return {
      id: raw.id,
      name: raw.name,
      eventName: raw.eventName,
      priority: raw.priority,
      active: raw.active,
      invalid: raw.invalid,
      description: raw.description,
      actionCount: this.countActions(sequences),
      hasMailAction: this.hasMailSendingAction(sequences),
      updatedAt: raw.updatedAt,
    };
  }
}
