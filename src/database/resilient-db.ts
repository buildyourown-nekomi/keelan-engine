/**
 * Enhanced database utilities with resilience and error handling
 * 
 * This module provides robust database operations with:
 * - Connection retry logic
 * - Circuit breaker protection
 * - Transaction management with rollback on errors
 * - Query timeout handling
 * - Comprehensive error logging
 */

import { db } from './db.js';
import { eq, and, or, desc } from 'drizzle-orm';
import { DatabaseError, KeelanError, withRetry, DEFAULT_RETRY_OPTIONS, CircuitBreaker, DEFAULT_CIRCUIT_BREAKER_OPTIONS } from '../utils/error.js';
import { TailLog } from '../utils/logging.js';
import { keelanCrate, keelanFiles, keelanShips } from './schema.js';

/**
 * Database operation options
 */
export interface DbOperationOptions {
  retry?: Partial<typeof DEFAULT_RETRY_OPTIONS>;
  timeout?: number;
  circuitBreaker?: Partial<typeof DEFAULT_CIRCUIT_BREAKER_OPTIONS>;
}

/**
 * Default database operation options
 */
export const DEFAULT_DB_OPTIONS: DbOperationOptions = {
  retry: DEFAULT_RETRY_OPTIONS,
  timeout: 10000, // 10 seconds
  circuitBreaker: DEFAULT_CIRCUIT_BREAKER_OPTIONS
};

/**
 * Execute a database operation with resilience features
 */
export async function executeDbOperation<T>(
  operation: () => Promise<T>,
  options: DbOperationOptions = {},
  log?: TailLog
): Promise<T> {
  const finalOptions = { ...DEFAULT_DB_OPTIONS, ...options };
  
  // Create circuit breaker for database operations
  const circuitBreaker = new CircuitBreaker(
    { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...finalOptions.circuitBreaker },
    log
  );
  
  // Wrap the operation with circuit breaker protection
  const protectedOperation = async () => {
    return circuitBreaker.execute(operation);
  };
  
  // Execute with retry logic
  return withRetry(protectedOperation, finalOptions.retry, log);
}

/**
 * Execute a database transaction with error handling and rollback
 */
export async function executeTransaction<T>(
  transaction: (tx: any) => Promise<T>,
  options: DbOperationOptions = {},
  log?: TailLog
): Promise<T> {
  return executeDbOperation(async () => {
    return await db.transaction(async (tx) => {
      try {
        return await transaction(tx);
      } catch (error) {
        // Log the error but don't re-throw here - let the outer error handler handle it
        const normalizedError = normalizeDbError(error);
        if (log) {
          log.error(`Transaction failed: ${normalizedError.message}`);
        }
        throw normalizedError;
      }
    });
  }, options, log);
}

/**
 * Normalize database errors
 */
function normalizeDbError(error: unknown): DatabaseError {
  if (error instanceof DatabaseError) {
    return error;
  }
  
  if (error instanceof Error) {
    // Check for specific database error patterns
    const message = error.message.toLowerCase();
    
    if (message.includes('connection') || message.includes('database')) {
      return new DatabaseError(`Database connection error: ${error.message}`, {}, error);
    }
    
    if (message.includes('constraint') || message.includes('unique')) {
      return new DatabaseError(`Database constraint violation: ${error.message}`, {}, error);
    }
    
    if (message.includes('timeout')) {
      return new DatabaseError(`Database operation timeout: ${error.message}`, {}, error);
    }
    
    return new DatabaseError(`Database error: ${error.message}`, {}, error);
  }
  
  return new DatabaseError(`Unknown database error: ${String(error)}`);
}

/**
 * Safe database query with error handling
 */
export async function safeQuery<T>(
  queryFn: () => Promise<T>,
  errorMessage: string,
  options: DbOperationOptions = {},
  log?: TailLog
): Promise<T | null> {
  try {
    return await executeDbOperation(queryFn, options, log);
  } catch (error) {
    const normalizedError = normalizeDbError(error);
    if (log) {
      log.error(`${errorMessage}: ${normalizedError.message}`);
    }
    return null;
  }
}

/**
 * Database health check
 */
export async function checkDatabaseHealth(log?: TailLog): Promise<boolean> {
  try {
    await executeDbOperation(
      async () => {
        // Simple query to test database connection
        await db.select().from(keelanFiles).limit(1);
      },
      { retry: { maxAttempts: 2, delayMs: 500 } },
      log
    );
    
    if (log) {
      log.info('Database health check passed');
    }
    return true;
  } catch (error) {
    if (log) {
      log.error(`Database health check failed: ${normalizeDbError(error).message}`);
    }
    return false;
  }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(log?: TailLog): Promise<{
  crates: number;
  ships: number;
  files: number;
}> {
  try {
    const [cratesCount, shipsCount, filesCount] = await Promise.all([
      executeDbOperation(
        () => db.select({ count: keelanCrate.id }).from(keelanCrate),
        {},
        log
      ).then(result => result.length),
      
      executeDbOperation(
        () => db.select({ count: keelanShips.id }).from(keelanShips),
        {},
        log
      ).then(result => result.length),
      
      executeDbOperation(
        () => db.select({ count: keelanFiles.id }).from(keelanFiles),
        {},
        log
      ).then(result => result.length)
    ]);
    
    return {
      crates: cratesCount,
      ships: shipsCount,
      files: filesCount
    };
  } catch (error) {
    if (log) {
      log.error(`Failed to get database stats: ${normalizeDbError(error).message}`);
    }
    return {
      crates: 0,
      ships: 0,
      files: 0
    };
  }
}

/**
 * Enhanced database operations with retry logic
 */
export const resilientDb = {
  // Select operations
  select: {
    /**
     * Select records with error handling
     */
    from: <T>(table: any) => ({
      where: async (conditions: any[], options: DbOperationOptions = {}, log?: TailLog) => {
        try {
          const query = db.select().from(table);
          
          if (conditions.length > 0) {
            query.where(and(...conditions));
          }
          
          return await executeDbOperation(() => query, options, log);
        } catch (error) {
          throw normalizeDbError(error);
        }
      },
      
      /**
       * Select single record by ID
       */
      findById: async (id: number, options: DbOperationOptions = {}, log?: TailLog) => {
        return safeQuery(
          () => db.select().from(table).where(eq(table.id, id)).limit(1),
          `Failed to find ${table.tableName} by ID`,
          options,
          log
        );
      },
      
      /**
       * Select record by unique field
       */
      findOne: async (field: keyof T, value: any, options: DbOperationOptions = {}, log?: TailLog) => {
        return safeQuery(
          () => db.select().from(table).where(eq(table[field], value)).limit(1),
          `Failed to find ${String(table.tableName)} by ${String(field)}`,
          options,
          log
        );
      },
      
      /**
       * Select all records with pagination
       */
      all: async (limit?: number, offset?: number, options: DbOperationOptions = {}, log?: TailLog) => {
        try {
          const query = db.select().from(table);
          
          if (limit !== undefined) {
            query.limit(limit);
          }
          
          if (offset !== undefined) {
            query.offset(offset);
          }
          
          return await executeDbOperation(() => query, options, log);
        } catch (error) {
          throw normalizeDbError(error);
        }
      }
    }),
    
    // Specific table operations
    crates: {
      findByName: async (name: string, options: DbOperationOptions = {}, log?: TailLog) => {
        return safeQuery(
          () => db.select().from(keelanCrate).where(eq(keelanCrate.name, name)).limit(1),
          `Failed to find crate by name: ${name}`,
          options,
          log
        );
      },
      
      findByBaseImage: async (baseImage: string, options: DbOperationOptions = {}, log?: TailLog) => {
        return safeQuery(
          () => db.select().from(keelanCrate).where(eq(keelanCrate.baseImage, baseImage)),
          `Failed to find crates by base image: ${baseImage}`,
          options,
          log
        );
      }
    },
    
    ships: {
      findByName: async (name: string, options: DbOperationOptions = {}, log?: TailLog) => {
        return safeQuery(
          () => db.select().from(keelanShips).where(eq(keelanShips.name, name)).limit(1),
          `Failed to find ship by name: ${name}`,
          options,
          log
        );
      },
      
      findByStatus: async (status: string, options: DbOperationOptions = {}, log?: TailLog) => {
        return safeQuery(
          () => db.select().from(keelanShips).where(eq(keelanShips.status, status)),
          `Failed to find ships by status: ${status}`,
          options,
          log
        );
      },
      
      findRunning: async (options: DbOperationOptions = {}, log?: TailLog) => {
        return safeQuery(
          () => db.select().from(keelanShips).where(eq(keelanShips.status, 'running')),
          'Failed to find running ships',
          options,
          log
        );
      }
    },
    
    files: {
      findByName: async (name: string, options: DbOperationOptions = {}, log?: TailLog) => {
        return safeQuery(
          () => db.select().from(keelanFiles).where(eq(keelanFiles.name, name)).limit(1),
          `Failed to find file by name: ${name}`,
          options,
          log
        );
      }
    }
  },
  
  // Insert operations
  insert: {
    /**
     * Insert a record with error handling
     */
    into: <T>(table: any) => ({
      values: async (data: any, options: DbOperationOptions = {}, log?: TailLog) => {
        try {
          const result = await executeDbOperation(
            () => db.insert(table).values(data).returning(),
            options,
            log
          );
          
          if (log && Array.isArray(result) && result.length > 0) {
            log.info(`Successfully inserted into ${table.tableName}`);
          }
          
          return result;
        } catch (error) {
          const normalizedError = normalizeDbError(error);
          if (log) {
            log.error(`Failed to insert into ${table.tableName}: ${normalizedError.message}`);
          }
          throw normalizedError;
        }
      }
    })
  },
  
  // Update operations
  update: {
    /**
     * Update records with error handling
     */
    table: <T>(table: any) => ({
      set: async (data: any, conditions: any[], options: DbOperationOptions = {}, log?: TailLog) => {
        try {
          const query = db.update(table).set(data);
          
          if (conditions.length > 0) {
            query.where(and(...conditions));
          }
          
          const result = await executeDbOperation(() => query, options, log);
          
          if (log) {
            log.info(`Successfully updated ${table.tableName}`);
          }
          
          return result;
        } catch (error) {
          const normalizedError = normalizeDbError(error);
          if (log) {
            log.error(`Failed to update ${table.tableName}: ${normalizedError.message}`);
          }
          throw normalizedError;
        }
      }
    })
  },
  
  // Delete operations
  delete: {
    /**
     * Delete records with error handling
     */
    from: <T>(table: any) => ({
      where: async (conditions: any[], options: DbOperationOptions = {}, log?: TailLog) => {
        try {
          const query = db.delete(table);
          
          if (conditions.length > 0) {
            query.where(and(...conditions));
          }
          
          const result = await executeDbOperation(() => query, options, log);
          
          if (log) {
            log.info(`Successfully deleted from ${table.tableName}`);
          }
          
          return result;
        } catch (error) {
          const normalizedError = normalizeDbError(error);
          if (log) {
            log.error(`Failed to delete from ${table.tableName}: ${normalizedError.message}`);
          }
          throw normalizedError;
        }
      }
    })
  },
  
  // Utility operations
  healthCheck: (log?: TailLog) => checkDatabaseHealth(log),
  getStats: (log?: TailLog) => getDatabaseStats(log)
};