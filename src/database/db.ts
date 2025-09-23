/**
 * Database connection and initialization for Keelan.
 * 
 * This module sets up the SQLite database connection using better-sqlite3
 * and Drizzle ORM for type-safe database operations. The database stores
 * information about crates (container images), ships (running containers),
 * and associated metadata.
 * 
 * Database location: {PATHS.database}/keelan.db
 * 
 * @module Database
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import load_env from "dotenv";
import { PATHS } from '../constants.js';
import { DatabaseError, KeelanError, withRetry, DEFAULT_RETRY_OPTIONS } from '../utils/error.js';
import { TailLog } from '../utils/logging.js';
load_env.config({ quiet: true });

// Global logger instance
const logger = new TailLog();

/**
 * Database connection configuration
 */
interface DatabaseConfig {
  path: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * Default database configuration
 */
const DEFAULT_DB_CONFIG: DatabaseConfig = {
  path: `${PATHS.database}/keelan.db`,
  timeout: 5000,
  maxRetries: 3
};

/**
 * Create a resilient database connection with retry logic
 */
function createDatabaseConnection(config: DatabaseConfig = DEFAULT_DB_CONFIG): any {
  let dbInstance: any;
  let lastError: Error | undefined;

  // Attempt to create database connection with retry logic
  for (let attempt = 1; attempt <= config.maxRetries!; attempt++) {
    try {
      // Ensure database directory exists
      const fs = require('fs-extra');
      fs.ensureDirSync(config.path.substring(0, config.path.lastIndexOf('/')));
      
      // Create database connection
      dbInstance = new Database(config.path);
      
      // Configure connection settings
      dbInstance.pragma('journal_mode = WAL');
      dbInstance.pragma('synchronous = NORMAL');
      dbInstance.pragma('cache_size = 10000');
      dbInstance.pragma('temp_store = MEMORY');
      
      logger.info(`Database connection established successfully on attempt ${attempt}`);
      return dbInstance;
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === config.maxRetries) {
        throw new DatabaseError(
          `Failed to establish database connection after ${config.maxRetries} attempts: ${lastError.message}`,
          { config, attempt },
          lastError
        );
      }
      
      logger.warn(`Database connection attempt ${attempt} failed. Retrying...`);
      // Wait before retrying with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new DatabaseError(
    'Unexpected error in database connection creation',
    { config },
    lastError!
  );
}

/**
 * SQLite database instance using better-sqlite3.
 * Located at the configured database path from PATHS.database.
 * The connection is created with retry logic and error handling.
 */
let sqlite: any;

try {
  sqlite = createDatabaseConnection();
} catch (error) {
  logger.error(`Fatal error creating database connection: ${(error as Error).message}`);
  throw error;
}

/**
 * Drizzle ORM database instance for type-safe database operations.
 *
 * This is the main database interface used throughout the application
 * for all database queries and operations.
 *
 * @example
 * import { db } from './database/db.js';
 * const crates = await db.select().from(keelanCrate);
 */
export const db = drizzle(sqlite);

/**
 * Verify database connection and health
 */
export async function verifyDatabaseConnection(): Promise<boolean> {
  try {
    // Simple query to test database connectivity
    await withRetry(
      async () => {
        const result = sqlite.prepare('SELECT 1 as test').get();
        if (!result || result.test !== 1) {
          throw new DatabaseError('Database health check failed');
        }
      },
      DEFAULT_RETRY_OPTIONS,
      logger
    );
    
    logger.info('Database connection verified successfully');
    return true;
  } catch (error) {
    logger.error(`Database connection verification failed: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Gracefully close database connections
 */
export async function closeDatabaseConnections(): Promise<void> {
  try {
    if (sqlite) {
      sqlite.close();
      logger.info('Database connection closed successfully');
    }
  } catch (error) {
    logger.error(`Error closing database connection: ${(error as Error).message}`);
    throw error;
  }
}

// Handle process exit to ensure database connections are closed
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, closing database connections...');
  await closeDatabaseConnections();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, closing database connections...');
  await closeDatabaseConnections();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  closeDatabaseConnections().finally(() => {
    process.exit(1);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at ${promise}, reason: ${reason}`);
  closeDatabaseConnections().finally(() => {
    process.exit(1);
  });
});
