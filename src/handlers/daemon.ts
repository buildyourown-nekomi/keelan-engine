import chalk from 'chalk';
import { spawn, exec } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { PATHS } from '../constants.js';

const execAsync = promisify(exec);

/**
 * Options for daemon management operations.
 * 
 * @property {'start' | 'stop' | 'status' | 'restart'} action - The daemon action to perform
 * @property {number} [interval] - Monitoring interval in seconds (default: 10)
 * @property {string} [logFile] - Custom log file path (optional)
 * @property {string} [pidFile] - Custom PID file path (optional)
 * @property {boolean} [detach] - Whether to run daemon in detached mode (default: true)
 */
interface DaemonOptions {
  action: 'start' | 'stop' | 'status' | 'restart';
  interval?: number;
  logFile?: string;
  pidFile?: string;
  detach?: boolean;
}

/**
 * Handles Keelan daemon management operations.
 * 
 * This function manages the Keelan monitor daemon which is responsible for
 * monitoring and managing running ships (containers). Supports starting,
 * stopping, checking status, and restarting the daemon process.
 * 
 * @param {DaemonOptions} options - Daemon management options
 * @throws {Error} If daemon operation fails
 * @example
 * // Start daemon with default settings
 * await daemonHandler({ action: 'start' });
 * 
 * // Start daemon with custom interval
 * await daemonHandler({ action: 'start', interval: 30 });
 * 
 * // Check daemon status
 * await daemonHandler({ action: 'status' });
 */
export const daemonHandler = async (options: DaemonOptions) => {
  const logDir = PATHS.logs;
  const pidDir = PATHS.pids;
  
  // Ensure directories exist
  await fs.ensureDir(logDir);
  await fs.ensureDir(pidDir);
  
  const defaultLogFile = path.join(logDir, 'monitor-daemon.log');
  const defaultPidFile = path.join(pidDir, 'monitor-daemon.pid');
  
  const logFile = options.logFile || defaultLogFile;
  const pidFile = options.pidFile || defaultPidFile;
  const interval = options.interval || 10;
  
  switch (options.action) {
    case 'start':
      await startDaemon(interval, logFile, pidFile, options.detach);
      break;
    case 'stop':
      await stopDaemon(pidFile);
      break;
    case 'status':
      await getDaemonStatus(pidFile, logFile);
      break;
    case 'restart':
      await stopDaemon(pidFile);
      // Wait a moment before restarting
      await new Promise(resolve => setTimeout(resolve, 2000));
      await startDaemon(interval, logFile, pidFile, options.detach);
      break;
    default:
      console.error(chalk.red('❌ Invalid daemon action bestie. Use: start, stop, status, or restart'));
      process.exit(1);
  }
};

/**
 * Starts the Keelan monitor daemon process.
 * 
 * This function spawns a new daemon process that monitors running ships.
 * The daemon can run in detached mode (background) or foreground mode for debugging.
 * 
 * @param {number} interval - Monitoring interval in seconds
 * @param {string} logFile - Path to the daemon log file
 * @param {string} pidFile - Path to the daemon PID file
 * @param {boolean} detach - Whether to run in detached mode (default: true)
 * @throws {Error} If daemon fails to start or is already running
 */
async function startDaemon(interval: number, logFile: string, pidFile: string, detach: boolean = true) {
  try {
    // Check if daemon is already running
    if (await isDaemonRunning(pidFile)) {
      console.log(chalk.yellow('⚠️  Daemon is already running bestie - no need to start what\'s already awake'));
      return;
    }
    
    console.log(chalk.cyan('🚀 Starting Keelan Monitor Daemon bestie...'));
    
    // Path to the daemon script
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const daemonScript = path.join(__dirname, '..', 'daemon', 'monitor-daemon.js');
    
    // Check if compiled daemon exists, if not use TypeScript version
    const daemonPath = fs.existsSync(daemonScript) 
      ? daemonScript 
      : path.join(__dirname, '..', 'daemon', 'monitor-daemon.ts');
    
    const command = fs.existsSync(daemonScript) 
      ? 'node'
      : 'tsx';
    
    const args = [
      daemonPath,
      `--interval=${interval}`,
      `--log-file=${logFile}`,
      `--pid-file=${pidFile}`
    ];
    
    if (detach) {
      // Start daemon as detached process
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        shell: false,
      });
      
      child.unref();
      
      console.log(chalk.gray(`🚀 Daemon started with PID: ${child.pid} bestie`));
      // Wait a moment to check if it started successfully
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      if (await isDaemonRunning(pidFile)) {
        console.log(chalk.green('✅ Daemon started successfully and it\'s giving management vibes - ready to handle your ships!'));
        console.log(chalk.gray(`📁 Log file: ${logFile}`));
        console.log(chalk.gray(`📋 PID file: ${pidFile}`));
        console.log(chalk.gray(`⏱️  Monitoring interval: ${interval} seconds`));
      } else {
        console.error(chalk.red('❌ Failed to start daemon bestie'));
        process.exit(1);
      }
    } else {
      // Start daemon in foreground (for debugging)
      console.log(chalk.blue('🔍 Starting daemon in foreground mode bestie...'));
console.log(chalk.gray('Press Ctrl+C to stop'));
      
      const child = spawn(command, args, {
        stdio: 'inherit'
      });
      
      child.on('exit', (code) => {
        if (code === 0) {
          console.log(chalk.green('✅ Daemon stopped gracefully bestie'));
        } else {
          console.error(chalk.red(`❌ Daemon exited with code ${code} bestie`));
        }
      });
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Daemon said "nah fam" and refused to start:'), error);
    process.exit(1);
  }
}

/**
 * Stops the running Keelan monitor daemon.
 * 
 * This function reads the PID from the PID file and attempts to gracefully
 * terminate the daemon process. Handles cleanup of PID file after stopping.
 * 
 * @param {string} pidFile - Path to the daemon PID file
 * @throws {Error} If daemon cannot be stopped or PID file is corrupted
 */
async function stopDaemon(pidFile: string) {
  try {
    if (!(await fs.pathExists(pidFile))) {
      console.log(chalk.yellow('⚠️  Daemon is not running bestie - it\'s already taking a nap'));
      return;
    }
    
    const pidStr = await fs.readFile(pidFile, 'utf8');
    const pid = parseInt(pidStr.trim());
    
    if (isNaN(pid)) {
      console.error(chalk.red('❌ PID file is giving corrupted energy (invalid data)'));
      await fs.remove(pidFile);
      return;
    }
    
    console.log(chalk.cyan(`🛑 Time to tell daemon ${pid} to clock out bestie...`));
    
    try {
      // Send SIGTERM to gracefully stop the daemon
      process.kill(pid, 'SIGTERM');
      
      // Wait for the daemon to stop
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
          // Check if process is still running
          process.kill(pid, 0);
          attempts++;
        } catch (error: any) {
          // Process is no longer running
          if (error.code === 'ESRCH') {
            break;
          }
          throw error;
        }
      }
      
      if (attempts >= maxAttempts) {
        console.log(chalk.yellow('⚠️  Daemon is being stubborn so we\'re forcing it to stop (not very demure)...'));
        process.kill(pid, 'SIGKILL');
      }
      
      // Clean up PID file
      await fs.remove(pidFile);
      
      console.log(chalk.green('✅ Daemon stopped successfully and it\'s giving peaceful sleep vibes'));
      
    } catch (error: any) {
      if (error.code === 'ESRCH') {
        console.log(chalk.yellow('⚠️  Daemon ghosted us (process already stopped)'));
        await fs.remove(pidFile);
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Daemon is being stubborn and won\'t stop (not very demure):'), error);
    process.exit(1);
  }
}

/**
 * Gets the current status of the Keelan monitor daemon.
 * 
 * This function checks if the daemon is running and displays detailed
 * status information including PID, log file location, and recent log entries.
 * 
 * @param {string} pidFile - Path to the daemon PID file
 * @param {string} logFile - Path to the daemon log file
 */
async function getDaemonStatus(pidFile: string, logFile: string) {
  try {
    console.log(chalk.blue('📊 Let\'s check if the daemon is still serving bestie:'));
console.log(chalk.gray('─'.repeat(40)));
    
    if (!(await fs.pathExists(pidFile))) {
      console.log(chalk.red('Status: ❌ Not running (daemon is taking a break bestie)'));
console.log(chalk.gray(`PID file: ${pidFile} (not found)`));
      return;
    }
    
    const pidStr = await fs.readFile(pidFile, 'utf8');
    const pid = parseInt(pidStr.trim());
    
    if (isNaN(pid)) {
      console.log(chalk.red('Status: ❌ PID file is corrupted bestie'));
      return;
    }
    
    try {
      // Check if process is running
      process.kill(pid, 0);
      console.log(chalk.green('Status: ✅ Running and serving background energy bestie'));
console.log(chalk.gray(`PID: ${pid} (the process ID)`));
console.log(chalk.gray(`PID file: ${pidFile}`));
      
      // Show log file info if it exists
      if (await fs.pathExists(logFile)) {
        const stats = await fs.stat(logFile);
        console.log(chalk.gray(`Log file: ${logFile}`));
        console.log(chalk.gray(`Log file: ${logFile} (${stats.size} bytes)`));
        console.log(chalk.gray(`Last modified: ${stats.mtime.toLocaleString()}`));
        
        // Show last few log lines
        try {
          const { stdout } = await execAsync(`tail -n 5 "${logFile}"`);
          if (stdout.trim()) {
            console.log(chalk.gray('\nRecent log entries:'));
            console.log(chalk.gray(stdout.trim()));
          }
        } catch (error) {
          // Ignore errors reading log file
        }
      } else {
        console.log(chalk.gray(`Log file: ${logFile} (not found)`));
      }
      
    } catch (error: any) {
      if (error.code === 'ESRCH') {
        console.log(chalk.red('Status: ❌ Not running (process not found bestie)'));
        console.log(chalk.gray(`PID file: ${pidFile} (stale)`));
        console.log(chalk.yellow('💡 Run "keelan daemon stop" to clean up this mess bestie'));
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Error checking daemon status bestie:'), error);
    process.exit(1);
  }
}

/**
 * Checks if the daemon is currently running.
 * 
 * This function verifies daemon status by checking the PID file existence
 * and validating that the process is actually running on the system.
 * 
 * @param {string} pidFile - Path to the daemon PID file
 * @returns {Promise<boolean>} True if daemon is running, false otherwise
 */
async function isDaemonRunning(pidFile: string): Promise<boolean> {
  try {
    if (!(await fs.pathExists(pidFile))) {
      return false;
    }
    
    const pidStr = await fs.readFile(pidFile, 'utf8');
    const pid = parseInt(pidStr.trim());
    
    if (isNaN(pid)) {
      return false;
    }
    
    // Check if process is running
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    return error.code !== 'ESRCH';
  }
}