import type { LogLevel } from '../../config/Configuration.js';

/**
 * Log level priority mapping
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Simple logger that writes to stderr
 *
 * MCP servers use stdout for protocol communication,
 * so all logging MUST go to stderr to avoid protocol corruption.
 */
export class Logger {
  private readonly levelValue: number;

  constructor(private readonly level: LogLevel = 'info') {
    this.levelValue = LOG_LEVELS[level];
  }

  /**
   * Check if a message at the given level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.levelValue;
  }

  /**
   * Format a log message with timestamp and level
   */
  private formatMessage(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): string {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${levelStr}] ${message}${contextStr}`;
  }

  /**
   * Log at debug level
   */
  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.error(this.formatMessage('debug', message, context));
    }
  }

  /**
   * Log at info level
   */
  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.error(this.formatMessage('info', message, context));
    }
  }

  /**
   * Log at warn level
   */
  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.error(this.formatMessage('warn', message, context));
    }
  }

  /**
   * Log at error level
   */
  error(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, context));
    }
  }
}
