/**
 * Database schema definitions for Keelan.
 * 
 * This module defines the database tables and their relationships using Drizzle ORM.
 * The schema includes tables for storing Keelan files, crates (container images),
 * and ships (running containers).
 * 
 * @module Schema
 */

import { integer, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Table for storing Keelan configuration files and their metadata.
 * 
 * This table stores the content of Keelanfile configurations along with
 * checksums for integrity verification and timestamps for tracking changes.
 * 
 * @table keelan_files
 */
export const keelanFiles = sqliteTable('keelan_files', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    content: text('content').notNull(),
    createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(), // Added .notNull() as default is always provided
    updatedAt: text('updated_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(), // Added .notNull()
    checksum: text('checksum').unique()
}, (table) => ({
    nameIdx: index('idx_keelan_files_name').on(table.name)
}));

/**
 * Table for storing container image metadata (crates).
 * 
 * This table represents built container images with their associated metadata
 * including base images, file references, sizes, and content-addressable digests.
 * Each crate can be used to create multiple ships (running containers).
 * 
 * @table keelan_crate
 */
export const keelanCrate = sqliteTable('keelan_crate', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    tag: text('tag').notNull(),
    // Corrected: keelanFileId should be integer to match keelanFiles.id
    keelanFileId: integer('keelan_file_id').references(() => keelanFiles.id, { onDelete: 'set null' }),
    baseImage: text('base_image').notNull(),
    createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
    sizeBytes: integer('size_bytes'),
    digest: text('digest').unique(),
    layer: text('layer').notNull()
}, (table) => ({
    nameTagIdx: uniqueIndex('idx_keelan_crate_name_tag').on(table.name, table.tag)
}));

/**
 * Table for storing running container instances (ships).
 * 
 * This table tracks individual container instances created from crates,
 * including their runtime status, process information, and lifecycle timestamps.
 * Ships represent the actual running containers in the system.
 * 
 * @table keelan_ships
 */
export const keelanShips = sqliteTable('keelan_ships', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    // Corrected: imageId should be integer to match keelanCrate.id
    imageId: integer('image_id').notNull().references(() => keelanCrate.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
    startedAt: text('started_at'),
    stoppedAt: text('stopped_at'),
    exitCode: integer('exit_code'),
    processId: integer('process_id'),
});
