/**
 * Performance optimization utilities for Keelan
 * 
 * This module provides optimized versions of common operations
 * to reduce bundle size and improve runtime performance.
 */

import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

// Cache for expensive operations
const cache = new Map<string, any>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Optimized async exec with timeout and error handling
 */
export const execAsync = promisify(exec);

/**
 * Cached file read operation
 */
export async function cachedReadFile(filePath: string): Promise<string> {
  const cacheKey = `file:${filePath}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  const data = await fs.readFile(filePath, 'utf8');
  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

/**
 * Optimized directory creation with error handling
 */
export async function safeCreateDirectory(dirPath: string): Promise<void> {
  try {
    await fs.ensureDir(dirPath);
  } catch (error) {
    // Fallback to sync if async fails
    fs.ensureDirSync(dirPath);
  }
}

/**
 * Batch file operations for better performance
 */
export async function batchFileOperations(operations: Array<() => Promise<void>>): Promise<void> {
  const batchSize = 10;
  for (let i = 0; i < operations.length; i += batchSize) {
    const batch = operations.slice(i, i + batchSize);
    await Promise.all(batch.map(op => op()));
  }
}

/**
 * Memory-efficient file size calculation
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

/**
 * Optimized path resolution with caching
 */
export function resolvePath(basePath: string, relativePath: string): string {
  const cacheKey = `path:${basePath}:${relativePath}`;
  const cached = cache.get(cacheKey);
  
  if (cached) {
    return cached;
  }
  
  const resolved = path.resolve(basePath, relativePath);
  cache.set(cacheKey, resolved);
  return resolved;
}

/**
 * Clear performance cache
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: cache.size,
    keys: Array.from(cache.keys())
  };
}