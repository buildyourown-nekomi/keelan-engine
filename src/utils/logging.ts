import chalk from "chalk";

// Performance optimization: Pre-compute ANSI codes
const CLEAR_LINE = '\x1b[2K';
const CURSOR_UP = '\x1b[1A';
const MAX_LINES = 5;

// Cache for chalk colors to avoid repeated function calls
const colorCache = {
  red: chalk.red,
  yellow: chalk.yellow,
  blue: chalk.blue,
  green: chalk.green
};

/**
 * Optimized logging utility with reduced console overhead
 */
export class TailLog {
    private logBuffer: string[] = [];
    private isInitialized = false;
    private static instance: TailLog;
    private errorLog: string[] = [];
    private maxErrorLogSize = 100;

    constructor() {
        if (TailLog.instance) {
            return TailLog.instance;
        }
        TailLog.instance = this;
    }

    private initialize() {
        if (!this.isInitialized) {
            console.log("\n");
            this.isInitialized = true;
        }
    }

    /**
     * Optimized error logging with cached colors
     */
    error(message: string) {
        const timestamp = new Date().toISOString();
        const errorLogEntry = `[${timestamp}] ERROR: ${message}`;
        this.errorLog.push(errorLogEntry);
        
        // Keep only the most recent errors
        if (this.errorLog.length > this.maxErrorLogSize) {
            this.errorLog.shift();
        }
        
        console.log(colorCache.red(`❌ [ERROR] ${message}`));
    }

    /**
     * Optimized warning logging with cached colors
     */
    warn(message: string) {
        console.log(colorCache.yellow(`⚠️  [WARN] ${message}`));
    }

    /**
     * Optimized info logging with cached colors
     */
    info(message: string) {
        console.log(colorCache.blue(`ℹ️  [INFO] ${message}`));
    }

    /**
     * Optimized success logging with cached colors
     */
    success(message: string) {
        console.log(colorCache.green(`✅ [SUCCESS] ${message}`));
    }

    /**
     * Optimized tail logging with reduced cursor operations
     */
    log(message: string) {
        this.initialize();

        // Handle multi-line messages efficiently
        if (message.includes("\n")) {
            const lines = message.split("\n");
            for (const line of lines) {
                this.log(line);
            }
            return;
        }

        // Optimize cursor operations by batching them
        const linesToClear = Math.max(this.logBuffer.length, MAX_LINES);
        const clearSequence = CURSOR_UP.repeat(linesToClear) + CLEAR_LINE.repeat(linesToClear);
        process.stdout.write(clearSequence);

        // Update buffer efficiently
        this.logBuffer.push(message);
        if (this.logBuffer.length > MAX_LINES) {
            this.logBuffer.shift();
        }

        // Batch output operations
        const output = this.logBuffer.join('\n') + '\n'.repeat(Math.max(0, MAX_LINES - this.logBuffer.length));
        process.stdout.write(output);
    }
    
    /**
     * Get recent error logs
     */
    getErrorLogs(): string[] {
        return [...this.errorLog];
    }
    
    /**
     * Clear error logs
     */
    clearErrorLogs(): void {
        this.errorLog = [];
    }
    
    /**
     * Get error log count
     */
    getErrorLogCount(): number {
        return this.errorLog.length;
    }
    
    /**
     * Set maximum error log size
     */
    setErrorLogSize(size: number): void {
        this.maxErrorLogSize = size;
        if (this.errorLog.length > size) {
            this.errorLog = this.errorLog.slice(-size);
        }
    }
}