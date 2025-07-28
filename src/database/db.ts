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
load_env.config({ quiet: true });

/**
 * SQLite database instance using better-sqlite3.
 * Located at the configured database path from PATHS.database.
 */
const sqlite = new Database(`${PATHS.database}/keelan.db`);

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
