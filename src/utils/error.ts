/**
 * Enhanced error handling utilities for Keelan
 * 
 * This module provides sophisticated error handling mechanisms including:
 * - Custom error types for different failure scenarios
 * - Retry logic for resilient operations
 * - Error classification and recovery strategies
 * - Resource cleanup on errors
 */

import chalk from 'chalk';
import { TailLog } from './logging.js';

/**
 * Error classification types
 */
export enum ErrorType {
  DATABASE = 'DATABASE',
  NETWORK = 'NETWORK',
  FILESYSTEM = 'FILESYSTEM',
  PERMISSION = 'PERMISSION',
  CONFIGURATION = 'CONFIGURATION',
  VALIDATION = 'VALIDATION',
  RUNTIME = 'RUNTIME',
  DAEMON = 'DAEMON',
  DEPLOYMENT = 'DEPLOYMENT',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * Enhanced error class with classification and recovery information
 */
export class KeelanError extends Error {
  public readonly type: ErrorType;
  public readonly severity: ErrorSeverity;
  public readonly recoverable: boolean;
  public readonly timestamp: Date;
  public readonly details?: Record<string, any>;
  public readonly retryCount?: number;
  public readonly originalError?: Error;

  constructor(
    message: string,
    type: ErrorType = ErrorType.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    recoverable: boolean = false,
    details?: Record<string, any>,
    retryCount?: number,
    originalError?: Error
  ) {
    super(message);
    this.name = 'KeelanError';
    this.type = type;
    this.severity = severity;
    this.recoverable = recoverable;
    this.timestamp = new Date();
    this.details = details;
    this.retryCount = retryCount;
    this.originalError = originalError;
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, KeelanError);
    }
  }

  /**
   * Convert error to a structured log object
   */
  toLogObject(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      recoverable: this.recoverable,
      timestamp: this.timestamp.toISOString(),
      details: this.details,
      retryCount: this.retryCount,
      stack: this.stack,
      originalError: this.originalError?.message
    };
  }

  /**
   * Get colored representation for console output
   */
  toColoredString(): string {
    const typeColor = {
      [ErrorType.DATABASE]: chalk.red,
      [ErrorType.NETWORK]: chalk.yellow,
      [ErrorType.FILESYSTEM]: chalk.magenta,
      [ErrorType.PERMISSION]: chalk.red,
      [ErrorType.CONFIGURATION]: chalk.cyan,
      [ErrorType.VALIDATION]: chalk.blue,
      [ErrorType.RUNTIME]: chalk.red,
      [ErrorType.DAEMON]: chalk.red,
      [ErrorType.DEPLOYMENT]: chalk.red,
      [ErrorType.UNKNOWN]: chalk.gray
    }[this.type] || chalk.gray;

    const severityColor = {
      [ErrorSeverity.LOW]: chalk.gray,
      [ErrorSeverity.MEDIUM]: chalk.yellow,
      [ErrorSeverity.HIGH]: chalk.red,
      [ErrorSeverity.CRITICAL]: chalk.bgRed.white
    }[this.severity] || chalk.gray;

    const recoverable = this.recoverable ? chalk.green('✅') : chalk.red('❌');
    const timestamp = chalk.gray(`[${this.timestamp.toISOString()}]`);
    
    return `${timestamp} ${typeColor(`[${this.type}]`)} ${severityColor(`[${this.severity}]`)} ${recoverable} ${this.message}`;
  }
}

/**
 * Specialized error types
 */
export class DatabaseError extends KeelanError {
  constructor(message: string, details?: Record<string, any>, originalError?: Error) {
    super(message, ErrorType.DATABASE, ErrorSeverity.HIGH, true, details, undefined, originalError);
    this.name = 'DatabaseError';
  }
}

export class NetworkError extends KeelanError {
  constructor(message: string, details?: Record<string, any>, originalError?: Error) {
    super(message, ErrorType.NETWORK, ErrorSeverity.HIGH, true, details, undefined, originalError);
    this.name = 'NetworkError';
  }
}

export class FileSystemError extends KeelanError {
  constructor(message: string, details?: Record<string, any>, originalError?: Error) {
    super(message, ErrorType.FILESYSTEM, ErrorSeverity.MEDIUM, true, details, undefined, originalError);
    this.name = 'FileSystemError';
  }
}

export class ConfigurationError extends KeelanError {
  constructor(message: string, details?: Record<string, any>, originalError?: Error) {
    super(message, ErrorType.CONFIGURATION, ErrorSeverity.CRITICAL, false, details, undefined, originalError);
    this.name = 'ConfigurationError';
  }
}

export class ValidationError extends KeelanError {
  constructor(message: string, details?: Record<string, any>, originalError?: Error) {
    super(message, ErrorType.VALIDATION, ErrorSeverity.LOW, false, details, undefined, originalError);
    this.name = 'ValidationError';
  }
}

/**
 * Retry configuration options
 */
export interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoffFactor?: number;
  jitter?: boolean;
  onRetry?: (error: KeelanError, attempt: number) => void;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffFactor: 2,
  jitter: true
};

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  log?: TailLog
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: KeelanError;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = normalizeError(error);
      
      if (attempt === config.maxAttempts || !lastError.recoverable) {
        throw lastError;
      }

      const delay = calculateDelay(config.delayMs, attempt, config.backoffFactor, config.jitter);
      
      if (log) {
        log.warn(`Attempt ${attempt}/${config.maxAttempts} failed. Retrying in ${delay}ms: ${lastError.message}`);
      }
      
      if (config.onRetry) {
        config.onRetry(lastError, attempt);
      }
      
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  baseDelay: number,
  attempt: number,
  backoffFactor?: number,
  jitter?: boolean
): number {
  const backoff = backoffFactor ? Math.pow(backoffFactor, attempt - 1) : 1;
  let delay = baseDelay * backoff;
  
  if (jitter) {
    // Add random jitter between 0 and 50% of the delay
    const jitterAmount = Math.random() * delay * 0.5;
    delay += jitterAmount;
  }
  
  return Math.min(delay, 30000); // Cap at 30 seconds
}

/**
 * Normalize any error to a KeelanError
 */
export function normalizeError(error: unknown): KeelanError {
  if (error instanceof KeelanError) {
    return error;
  }
  
  if (error instanceof Error) {
    // Classify based on error message patterns
    const message = error.message.toLowerCase();
    
    if (message.includes('database') || message.includes('sqlite') || message.includes('drizzle')) {
      return new DatabaseError(error.message, {}, error);
    }
    
    if (message.includes('network') || message.includes('socket') || message.includes('connection')) {
      return new NetworkError(error.message, {}, error);
    }
    
    if (message.includes('file') || message.includes('directory') || message.includes('permission')) {
      return new FileSystemError(error.message, {}, error);
    }
    
    if (message.includes('config') || message.includes('parse') || message.includes('invalid')) {
      return new ConfigurationError(error.message, {}, error);
    }
    
    return new KeelanError(error.message, ErrorType.RUNTIME, ErrorSeverity.MEDIUM, false, {}, undefined, error);
  }
  
  // Handle non-Error objects
  return new KeelanError(String(error), ErrorType.UNKNOWN, ErrorSeverity.MEDIUM, false);
}

/**
 * Execute a function with guaranteed cleanup
 */
export async function withCleanup<T>(
  fn: () => Promise<T>,
  cleanup: () => Promise<void> | void,
  log?: TailLog
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (log) {
      log.error(`Operation failed: ${normalizeError(error).message}`);
    }
    
    try {
      await cleanup();
    } catch (cleanupError) {
      if (log) {
        log.error(`Cleanup failed: ${normalizeError(cleanupError).message}`);
      }
      // Don't throw the cleanup error - we want the original error to propagate
    }
    
    throw error;
  }
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Circuit breaker state
 */
interface CircuitBreakerState {
  failureCount: number;
  lastFailureTime: number | null;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  onStateChange?: (state: CircuitBreakerState['state']) => void;
}

/**
 * Circuit breaker for resilient operations
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = {
    failureCount: 0,
    lastFailureTime: null,
    state: 'CLOSED'
  };
  
  private readonly options: CircuitBreakerOptions;
  private readonly log?: TailLog;
  
  constructor(options: CircuitBreakerOptions, log?: TailLog) {
    this.options = options;
    this.log = log;
  }
  
  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.checkState();
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  /**
   * Check if the circuit breaker allows execution
   */
  private checkState(): void {
    const now = Date.now();
    
    if (this.state.state === 'OPEN') {
      if (this.state.lastFailureTime && 
          now - this.state.lastFailureTime > this.options.resetTimeout) {
        this.transitionTo('HALF_OPEN');
      } else {
        throw new KeelanError(
          'Circuit breaker is OPEN - operation blocked',
          ErrorType.RUNTIME,
          ErrorSeverity.HIGH,
          false
        );
      }
    }
  }
  
  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    if (this.state.state === 'HALF_OPEN') {
      this.transitionTo('CLOSED');
    }
    
    this.state.failureCount = 0;
  }
  
  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.state.failureCount++;
    this.state.lastFailureTime = Date.now();
    
    if (this.state.state === 'CLOSED' && 
        this.state.failureCount >= this.options.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }
  
  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitBreakerState['state']): void {
    const oldState = this.state.state;
    this.state.state = newState;
    
    if (this.log) {
      this.log.info(`Circuit breaker state changed: ${oldState} → ${newState}`);
    }
    
    if (this.options.onStateChange) {
      this.options.onStateChange(newState);
    }
  }
  
  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return { ...this.state };
  }
  
  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.state = {
      failureCount: 0,
      lastFailureTime: null,
      state: 'CLOSED'
    };
    
    if (this.log) {
      this.log.info('Circuit breaker reset');
    }
  }
}

/**
 * Default circuit breaker options
 */
export const DEFAULT_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  monitoringPeriod: 300000 // 5 minutes
};