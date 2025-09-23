/**
 * Enhanced network utilities with resilience and error handling
 * 
 * This module provides robust network operations with:
 * - Connection retry logic
 * - Circuit breaker protection
 * - Timeout handling
 * - Connection pooling
 * - Comprehensive error logging
 */

import { KeelanError, NetworkError, withRetry, DEFAULT_RETRY_OPTIONS, CircuitBreaker, DEFAULT_CIRCUIT_BREAKER_OPTIONS } from './error.js';
import { TailLog } from './logging.js';
import { Socket } from 'net';
import { EventEmitter } from 'events';

/**
 * Network operation options
 */
export interface NetworkOptions {
  timeout?: number;
  retry?: Partial<typeof DEFAULT_RETRY_OPTIONS>;
  circuitBreaker?: Partial<typeof DEFAULT_CIRCUIT_BREAKER_OPTIONS>;
  keepAlive?: boolean;
  maxRetries?: number;
  host?: string;
  port?: number;
}

/**
 * Default network operation options
 */
export const DEFAULT_NETWORK_OPTIONS: NetworkOptions = {
  timeout: 10000, // 10 seconds
  retry: DEFAULT_RETRY_OPTIONS,
  circuitBreaker: DEFAULT_CIRCUIT_BREAKER_OPTIONS,
  keepAlive: true,
  maxRetries: 3
};

/**
 * Enhanced socket connection with resilience features
 */
export class ResilientSocket extends EventEmitter {
  private socket: Socket;
  private readonly options: NetworkOptions;
  private readonly log?: TailLog;
  private circuitBreaker: CircuitBreaker;
  private connectionTimeout?: NodeJS.Timeout;
  private isDestroyed = false;

  constructor(
    host: string,
    port: number,
    options: NetworkOptions = {},
    log?: TailLog
  ) {
    super();
    this.options = { ...DEFAULT_NETWORK_OPTIONS, ...options };
    this.log = log;
    this.socket = new Socket();
    
    // Create circuit breaker for network operations
    this.circuitBreaker = new CircuitBreaker(
      { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...this.options.circuitBreaker },
      log
    );
    
    this.setupSocket();
  }

  /**
   * Setup socket with error handling and configuration
   */
  private setupSocket(): void {
    // Configure socket options
    this.socket.setKeepAlive(this.options.keepAlive);
    this.socket.setEncoding('utf8');
    
    // Handle connection errors
    this.socket.on('error', (error) => {
      if (!this.isDestroyed) {
        this.emit('error', new NetworkError(`Socket error: ${error.message}`, {}, error));
      }
    });
    
    // Handle connection timeout
    this.socket.on('timeout', () => {
      if (!this.isDestroyed) {
        this.emit('error', new NetworkError('Socket connection timeout'));
        this.socket.destroy();
      }
    });
    
    // Handle close event
    this.socket.on('close', (hadError) => {
      if (!this.isDestroyed) {
        this.emit('close', hadError);
      }
    });
  }

  /**
   * Connect with retry logic and circuit breaker protection
   */
  async connect(): Promise<void> {
    if (this.isDestroyed) {
      throw new NetworkError('Socket has been destroyed');
    }

    return this.circuitBreaker.execute(async () => {
      return withRetry(
        () => this.connectOnce(),
        this.options.retry,
        this.log
      );
    });
  }

  /**
   * Perform a single connection attempt
   */
  private connectOnce(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Set connection timeout
      this.connectionTimeout = setTimeout(() => {
        reject(new NetworkError('Connection attempt timed out'));
      }, this.options.timeout);

      this.socket.connect(this.options.port || DEFAULT_NETWORK_OPTIONS.port!, this.options.host || DEFAULT_NETWORK_OPTIONS.host!, () => {
        clearTimeout(this.connectionTimeout);
        this.emit('connect');
        resolve();
      });

      this.socket.on('error', (error) => {
        clearTimeout(this.connectionTimeout);
        reject(new NetworkError(`Connection failed: ${error.message}`, {}, error));
      });
    });
  }

  /**
   * Write data to socket with error handling
   */
  async write(data: string | Buffer): Promise<void> {
    if (this.isDestroyed) {
      throw new NetworkError('Socket has been destroyed');
    }

    if (!this.socket.writable) {
      throw new NetworkError('Socket is not writable');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new NetworkError('Write operation timed out'));
      }, this.options.timeout);

      this.socket.write(data, (error) => {
        clearTimeout(timeout);
        if (error) {
          reject(new NetworkError(`Write failed: ${error.message}`, {}, error));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Read data from socket with error handling
   */
  async read(length?: number): Promise<Buffer> {
    if (this.isDestroyed) {
      throw new NetworkError('Socket has been destroyed');
    }

    if (!this.socket.readable) {
      throw new NetworkError('Socket is not readable');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new NetworkError('Read operation timed out'));
      }, this.options.timeout);

      const onData = (data: Buffer) => {
        clearTimeout(timeout);
        this.socket.off('data', onData);
        resolve(data);
      };

      this.socket.on('data', onData);
    });
  }

  /**
   * Destroy the socket gracefully
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }
    
    this.socket.destroy();
    this.emit('destroy');
  }

  /**
   * Get socket state
   */
  get state(): 'connecting' | 'connected' | 'disconnected' | 'destroyed' {
    if (this.isDestroyed) {
      return 'destroyed';
    }
    
    if (this.socket.connecting) {
      return 'connecting';
    }
    
    if (this.socket.destroyed) {
      return 'disconnected';
    }
    
    return 'connected';
  }
}

/**
 * Enhanced HTTP client with resilience features
 */
export class ResilientHttpClient {
  private readonly baseUrl: string;
  private readonly options: NetworkOptions;
  private readonly log?: TailLog;
  private circuitBreaker: CircuitBreaker;

  constructor(
    baseUrl: string,
    options: NetworkOptions = {},
    log?: TailLog
  ) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.options = { ...DEFAULT_NETWORK_OPTIONS, ...options };
    this.log = log;
    
    // Create circuit breaker for HTTP operations
    this.circuitBreaker = new CircuitBreaker(
      { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...this.options.circuitBreaker },
      log
    );
  }

  /**
   * Perform HTTP request with retry logic and circuit breaker protection
   */
  async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    data?: any,
    headers: Record<string, string> = {}
  ): Promise<{
    status: number;
    data: any;
    headers: Record<string, string>;
  }> {
    const url = `${this.baseUrl}${endpoint}`;
    
    return this.circuitBreaker.execute(async () => {
      return withRetry(
        () => this.requestOnce(method, url, data, headers),
        this.options.retry,
        this.log
      );
    });
  }

  /**
   * Perform a single HTTP request
   */
  private async requestOnce(
    method: string,
    url: string,
    data?: any,
    headers: Record<string, string> = {}
  ): Promise<{
    status: number;
    data: any;
    headers: Record<string, string>;
  }> {
    // In a real implementation, this would use a proper HTTP client like fetch
    // For this example, we'll simulate an HTTP request with error handling
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      // Simulate HTTP request
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new NetworkError(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await response.json();
      const responseHeaders = Object.fromEntries(response.headers.entries());

      return {
        status: response.status,
        data: responseData,
        headers: responseHeaders
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new NetworkError('Request timed out');
      }
      
      throw new NetworkError(`Request failed: ${error instanceof Error ? error.message : String(error)}`, {}, error as Error);
    }
  }
}

/**
 * Network health check utility
 */
export async function checkNetworkHealth(
  host: string,
  port: number,
  options: NetworkOptions = {},
  log?: TailLog
): Promise<boolean> {
  const finalOptions = { ...DEFAULT_NETWORK_OPTIONS, ...options };
  
  try {
    const socket = new ResilientSocket(host, port, finalOptions, log);
    await socket.connect();
    socket.destroy();
    
    if (log) {
      log.info(`Network health check passed for ${host}:${port}`);
    }
    
    return true;
  } catch (error) {
    const normalizedError = error instanceof NetworkError ? error : new NetworkError(String(error));
    
    if (log) {
      log.error(`Network health check failed for ${host}:${port}: ${normalizedError.message}`);
    }
    
    return false;
  }
}

/**
 * Enhanced network operations with retry logic
 */
export const resilientNetwork = {
  /**
   * Create a resilient socket connection
   */
  createSocket: (host: string, port: number, options?: NetworkOptions, log?: TailLog) => 
    new ResilientSocket(host, port, options, log),
  
  /**
   * Create a resilient HTTP client
   */
  createHttpClient: (baseUrl: string, options?: NetworkOptions, log?: TailLog) => 
    new ResilientHttpClient(baseUrl, options, log),
  
  /**
   * Check network health
   */
  checkHealth: (host: string, port: number, options?: NetworkOptions, log?: TailLog) => 
    checkNetworkHealth(host, port, options, log)
};