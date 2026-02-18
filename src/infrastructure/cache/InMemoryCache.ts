import type { Logger } from '../logging/Logger.js';

/**
 * Cache entry with value and expiration
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple in-memory cache with TTL support
 *
 * Suitable for caching categories, properties, and other
 * relatively static data that doesn't change often.
 */
/**
 * Maximum cache entries before forced pruning
 */
const MAX_CACHE_SIZE = 500;

/**
 * Auto-prune interval (60 seconds)
 */
const PRUNE_INTERVAL_MS = 60000;

export class InMemoryCache {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly logger: Logger) {
    // Auto-prune expired entries periodically
    this.pruneTimer = setInterval(() => this.prune(), PRUNE_INTERVAL_MS);
    // Allow Node.js to exit even if timer is running
    if (this.pruneTimer.unref) {
      this.pruneTimer.unref();
    }
  }

  /**
   * Stop the auto-prune timer (for clean shutdown)
   */
  dispose(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }

  /**
   * Get a value from cache
   * Returns null if not found or expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.logger.debug('Cache entry expired', { key });
      return null;
    }

    this.logger.debug('Cache hit', { key });
    return entry.value as T;
  }

  /**
   * Set a value in cache with TTL
   * @param key Cache key
   * @param value Value to cache
   * @param ttlMs Time-to-live in milliseconds
   */
  set<T>(key: string, value: T, ttlMs: number): void {
    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + ttlMs,
    };

    this.cache.set(key, entry);

    // Prevent unbounded growth
    if (this.cache.size > MAX_CACHE_SIZE) {
      this.prune();
    }

    this.logger.debug('Cache set', { key, ttlMs });
  }

  /**
   * Delete a specific key from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.logger.debug('Cache entry deleted', { key });
    }
    return deleted;
  }

  /**
   * Delete all keys matching a prefix
   */
  deleteByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    if (count > 0) {
      this.logger.debug('Cache entries deleted by prefix', { prefix, count });
    }
    return count;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.logger.info('Cache cleared', { entriesRemoved: size });
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Remove expired entries (garbage collection)
   * Call periodically to prevent memory bloat
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
      }
    }

    if (pruned > 0) {
      this.logger.debug('Cache pruned', { entriesRemoved: pruned });
    }

    return pruned;
  }
}
