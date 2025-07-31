#!/usr/bin/env node

/**
 * Bundle analysis script for Keelan
 * Analyzes the compiled bundle to identify optimization opportunities
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DIST_DIR = './dist';

function analyzeBundle() {
  console.log('🔍 Analyzing Keelan bundle...\n');

  // Get all JS files
  const files = getAllJsFiles(DIST_DIR);
  
  // Analyze file sizes
  const fileSizes = files.map(file => ({
    file,
    size: fs.statSync(file).size,
    lines: countLines(file)
  }));

  // Sort by size
  fileSizes.sort((a, b) => b.size - a.size);

  console.log('📊 File Size Analysis:');
  console.log('='.repeat(60));
  
  fileSizes.forEach(({ file, size, lines }) => {
    const relativePath = path.relative(DIST_DIR, file);
    const sizeKB = (size / 1024).toFixed(1);
    console.log(`${relativePath.padEnd(40)} ${sizeKB.padStart(8)} KB (${lines} lines)`);
  });

  // Calculate totals
  const totalSize = fileSizes.reduce((sum, f) => sum + f.size, 0);
  const totalLines = fileSizes.reduce((sum, f) => sum + f.lines, 0);
  
  console.log('\n📈 Summary:');
  console.log(`Total size: ${(totalSize / 1024).toFixed(1)} KB`);
  console.log(`Total lines: ${totalLines}`);
  console.log(`Average file size: ${(totalSize / files.length / 1024).toFixed(1)} KB`);

  // Identify large files
  const largeFiles = fileSizes.filter(f => f.size > 50 * 1024); // > 50KB
  if (largeFiles.length > 0) {
    console.log('\n⚠️  Large files (>50KB):');
    largeFiles.forEach(({ file, size }) => {
      const relativePath = path.relative(DIST_DIR, file);
      console.log(`  - ${relativePath} (${(size / 1024).toFixed(1)} KB)`);
    });
  }

  // Check for duplicate imports
  console.log('\n🔍 Checking for potential optimizations...');
  checkForOptimizations();
}

function getAllJsFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...getAllJsFiles(fullPath));
    } else if (item.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function countLines(file) {
  const content = fs.readFileSync(file, 'utf8');
  return content.split('\n').length;
}

function checkForOptimizations() {
  // Check for common optimization opportunities
  const distContent = fs.readFileSync('./dist/index.js', 'utf8');
  
  // Check for large imports
  const importMatches = distContent.match(/import.*from.*['"]([^'"]+)['"]/g);
  if (importMatches) {
    console.log('📦 Import analysis:');
    importMatches.forEach(imp => {
      if (imp.includes('chalk') || imp.includes('fs-extra') || imp.includes('better-sqlite3')) {
        console.log(`  - ${imp.trim()}`);
      }
    });
  }

  // Check for potential tree-shaking opportunities
  const unusedExports = [
    'fs-extra',
    'chalk',
    'yaml'
  ];
  
  console.log('\n💡 Optimization suggestions:');
  console.log('  - Consider using dynamic imports for large modules');
  console.log('  - Implement code splitting for handlers');
  console.log('  - Use tree-shaking for unused exports');
  console.log('  - Consider replacing sync operations with async');
}

// Run analysis
analyzeBundle();