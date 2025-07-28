import chalk from "chalk";

// ANSI escape codes for cursor manipulation and clearing lines
const CLEAR_LINE = '\x1b[2K'; // Clears the entire line
const CURSOR_UP = '\x1b[1A'; // Moves cursor up 1 line
const MAX_LINES = 5; // The number of lines to "keep" in the dynamic window


/**
 * A logging utility that provides a tail-like console output with multiple log levels.
 * Maintains a fixed-size buffer of log messages and supports dynamic updates to the console.
 * 
 * @example
 * const log = new TailLog();
 * log.info('Application started');
 * log.warn('This is a warning');
 * log.error('Something went wrong');
 * log.success('Operation completed');
 */
export class TailLog {

    /**
     * Internal buffer storing log messages for the tail display
     * @private
     */
    private logBuffer: string[];

    constructor() {
        this.logBuffer = [];
        console.log("\n"); // This blank line ensures the dynamic content starts below the static text
    }

    /**
     * Logs an error message with red color and error emoji
     * @param {string} message - The error message to log
     * @example
     * log.error('Failed to load configuration');
     */
    error(message: string) {
        console.log(chalk.red(`❌ [ERROR] ${message} (and that's not very cash money)`));
    }

    /**
     * Logs a warning message with yellow color and warning emoji
     * @param {string} message - The warning message to log
     * @example
     * log.warn('Using default configuration');
     */
    warn(message: string) {
        console.log(chalk.yellow(`⚠️  [WARN] ${message} (just a heads up bestie)`));
    }

    /**
     * Logs an informational message with blue color and info emoji
     * @param {string} message - The info message to log
     * @example
     * log.info('Processing started');
     */
    info(message: string) {
        console.log(chalk.blue(`ℹ️  [INFO] ${message} (no cap)`));
    }

    /**
     * Logs a success message with green color and checkmark emoji
     * @param {string} message - The success message to log
     * @example
     * log.success('Operation completed successfully');
     */
    success(message: string) {
        console.log(chalk.green(`✅ [SUCCESS] ${message} (and we love that for us)`));
    }

    /**
     * Logs a raw message to the console with tail-like behavior.
     * Maintains a fixed number of lines in the console output.
     * 
     * @param {string} message - The message to log (can contain multiple lines)
     * @private
     * @example
     * log.log('Processing item 1/100');
     */
    log(message: string) {

        // Check if it a multiple lines
        if (message.includes("\n")) {
            message.split("\n").forEach(line => {
                this.log(line);
            });
            return;
        }

        // 1. Move cursor to the start of the dynamic area (which is the blank line we just printed)
        // We need to move up MAX_LINES + 1 (for the initial blank line)
        // Then clear MAX_LINES + 1 lines to ensure a clean slate before redrawing.
        // However, it's safer to only clear what we know we've printed.
        // If the buffer isn't full yet, we still need to clear potential previous short outputs.
        const linesToClear = Math.max(this.logBuffer.length, MAX_LINES); // Clear up to MAX_LINES or current buffer size

        for (let i = 0; i < linesToClear; i++) {
            process.stdout.write(CURSOR_UP + CLEAR_LINE);
        }
        // After clearing, the cursor is at the line where the dynamic content starts.

        // 2. Add the new message to the buffer
        this.logBuffer.push(message);

        // 3. If the buffer exceeds MAX_LINES, remove the oldest message
        if (this.logBuffer.length > MAX_LINES) {
            this.logBuffer.shift(); // Remove the first element
        }

        // 4. Print the current content of the buffer
        this.logBuffer.forEach(line => {
            process.stdout.write(line + '\n');
        });

        // If the buffer isn't full, print enough blank lines to fill up to MAX_LINES
        // This ensures the dynamic area always occupies the same vertical space.
        for (let i = this.logBuffer.length; i < MAX_LINES; i++) {
            process.stdout.write('\n');
        }
    }
}