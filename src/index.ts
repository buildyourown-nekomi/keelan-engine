/**
 * Main CLI entry point for Keelan
 *
 * This file sets up the command-line interface (CLI) for the Keelan project,
 * a container/virtualization management tool. It uses yargs to define commands
 * for managing "ships" (running containers), "crates" (container images),
 * configuration, building, deploying, and controlling the background daemon.
 *
 * Key Features:
 * - Command parsing and dispatch to handler modules
 * - Environment variable loading
 * - Modular handler imports for each major command
 *
 * Commands:
 *   - ship: Manage running containers (deploy, start, stop, restart, remove, list)
 *   - crate: Manage container images (build, remove, list)
 *   - config: Configure project settings
 *   - build: Build project crates
 *   - deploy: Deploy ships
 *   - daemon: Control the background monitoring daemon
 *   - init: Initialize a new project
 *
 * Usage:
 *   keelan <command> [options]
 *
 * See individual handler files for detailed logic for each command.
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs-extra';
import chalk from 'chalk';
import load_env from 'dotenv';
load_env.config({ quiet: true });

// Lazy load handlers for better startup performance
const handlers = {
  build: () => import('./handlers/build.js').then(m => m.buildHandler),
  deploy: () => import('./handlers/deploy.js').then(m => m.deployHandler),
  config: () => import('./handlers/config.js').then(m => m.configHandler),
  remove: {
    crate: () => import('./handlers/remove.js').then(m => m.removeCrateHandler),
    ship: () => import('./handlers/remove.js').then(m => m.removeShipHandler)
  },
  daemon: () => import('./handlers/daemon.js').then(m => m.daemonHandler),
  ship: {
    start: () => import('./handlers/ship.js').then(m => m.startShipHandler),
    stop: () => import('./handlers/ship.js').then(m => m.stopShipHandler),
    restart: () => import('./handlers/ship.js').then(m => m.restartShipHandler),
    list: () => import('./handlers/ship.js').then(m => m.listShipsHandler)
  },
  crate: {
    list: () => import('./handlers/crate.js').then(m => m.listCratesHandler)
  },
  monitor: () => import('./daemon/monitor-daemon.js').then(m => m.monitorAllShips)
};

// CLI setup
const argv = yargs(hideBin(process.argv))
  .scriptName('keelan')
  .usage('Usage: $0 <command> [options]')
  .command(
    'ship <action> [name]',
    'Manage ships (running containers)',
    (yargs) => {
      return yargs
        .positional('action', {
          describe: 'Action to perform on ship',
          type: 'string',
          choices: ['deploy', 'start', 'stop', 'restart', 'remove', 'list'] as const,
          demandOption: true
        })
        .positional('name', {
          describe: 'Name of the ship (required for deploy, start, stop, restart, remove)',
          type: 'string'
        })
        .option('env', {
          alias: 'e',
          type: 'string',
          description: 'Environment (for deploy/start)',
          choices: ['dev', 'staging', 'production'] as const,
          default: 'dev'
        })
        .option('force', {
          alias: 'f',
          type: 'boolean',
          description: 'Force action (for stop/remove)',
          default: false
        })
        .option('recursive', {
          alias: 'r',
          type: 'boolean',
          description: 'Recursive removal (for remove)',
          default: false
        });
    },
    async (argv) => {
      const { action, name, env, force, recursive } = argv as any;
      
      switch (action) {
        case 'deploy':
          if (!name) {
            console.error(chalk.red('❌ Ship name is required'));
            process.exit(1);
          }
          const deployHandler = await handlers.deploy();
          await deployHandler({ name, env });
          break;
        case 'start':
          if (!name) {
            console.error(chalk.red('❌ Ship name is required'));
            process.exit(1);
          }
          const startShipHandler = await handlers.ship.start();
          await startShipHandler({ name, env });
          break;
        case 'stop':
          if (!name) {
            console.error(chalk.red('❌ Ship name is required'));
            process.exit(1);
          }
          const stopShipHandler = await handlers.ship.stop();
          await stopShipHandler({ name, force });
          break;
        case 'restart':
          if (!name) {
            console.error(chalk.red('❌ Ship name is required'));
            process.exit(1);
          }
          const restartShipHandler = await handlers.ship.restart();
          await restartShipHandler({ name, env });
          break;
        case 'remove':
          if (!name) {
            console.error(chalk.red('❌ Ship name is required'));
            process.exit(1);
          }
          const removeShipHandler = await handlers.remove.ship();
          await removeShipHandler({ name, force, recursive });
          break;
        case 'list':
          const listShipsHandler = await handlers.ship.list();
          await listShipsHandler();
          break;
        default:
          console.error(chalk.red(`❌ Invalid ship action: ${action}`));
          process.exit(1);
      }
    }
  )
  .command(
    'build',
    'Build the project',
    (yargs) => {
      return yargs
        .option('watch', {
          type: 'boolean',
          description: 'Watch for changes',
          default: false
        })
        .option('production', {
          alias: 'p',
          type: 'boolean',
          description: 'Build for production',
          default: false
        })
        .option('workingDirectory', {
          alias: "w",
          type: 'string',
          description: 'Working directory for build'
        })
        .option('name', {
          alias: 'n',
          type: 'string',
          description: 'Name of the build',
          demandOption: true
        });
    },
    async (argv) => {
      const buildHandler = await handlers.build();
      await buildHandler(argv as any);
    }
  )
  .command(
    'config [key] [value]',
    'Manage configuration',
    (yargs) => {
      return yargs
        .positional('key', {
          describe: 'Configuration key',
          type: 'string'
        })
        .positional('value', {
          describe: 'Configuration value',
          type: 'string'
        })
        .option('list', {
          alias: 'l',
          type: 'boolean',
          description: 'List all configuration',
          default: false
        })
        .option('reset', {
          type: 'boolean',
          description: 'Reset to default configuration',
          default: false
        });
    },
    async (argv) => {
      const configHandler = await handlers.config();
      await configHandler(argv as any);
    }
  )
  .command(
    'crate <action> [name]',
    'Manage crates (container images)',
    (yargs) => {
      return yargs
        .positional('action', {
          describe: 'Action to perform on crate',
          type: 'string',
          choices: ['list', 'remove'] as const,
          demandOption: true
        })
        .positional('name', {
          describe: 'Name of the crate (required for remove)',
          type: 'string'
        })
        .option('force', {
          alias: 'f',
          type: 'boolean',
          description: 'Force removal',
          default: false
        });
    },
    async (argv) => {
      const { action, name, force } = argv as any;
      
      switch (action) {
        case 'list':
          const listCratesHandler = await handlers.crate.list();
          await listCratesHandler();
          break;
        case 'remove':
          if (!name) {
            console.error(chalk.red('❌ Crate name is required'));
            process.exit(1);
          }
          const removeCrateHandler = await handlers.remove.crate();
          await removeCrateHandler({ name, force, recursive: false });
          break;
        default:
          console.error(chalk.red(`❌ Invalid crate action: ${action}`));
          process.exit(1);
      }
    }
  )
  .command(
    'init',
    'Initialize a new Keelan project',
    () => {
      // No options for init command
    },
    (argv) => {
      const KeelanfileContent = `
        # Keelanfile for project
        # See https://Keelan.dev/docs/Keelanfile
        
        build:
          engine: debian_rootfs
          commands:
            - apt-get update
            - apt-get install -y curl
            - curl -sL https://deb.nodesource.com/setup_18.x | bash -
            - apt-get install -y nodejs
        
        deploy:
          cmd: 'node'
          args: ['dist/index.js']
      `;
      
      fs.writeFileSync('Keelanfile.yml', KeelanfileContent.trim());
      
      console.log('✅ Keelanfile.yml created and it\'s giving fresh project energy bestie!');
    }
  )

  .command(
    'monitor',
    'Monitor all running ships and update their status',
    (yargs) => {
      return yargs
        .option('watch', {
          alias: 'w',
          type: 'boolean',
          description: 'Continuously monitor ships (runs every 30 seconds)',
          default: false
        })
        .option('interval', {
          alias: 'i',
          type: 'number',
          description: 'Monitoring interval in seconds (only with --watch)',
          default: 30
        });
    },
    async (argv) => {
      if (argv.watch) {
        console.log(`🔍 Starting continuous monitoring like a helicopter parent bestie (every ${argv.interval} seconds)...`);
        console.log('Press Ctrl+C when you\'re done being nosy - no judgment');
        
        // Run initial check
        const monitorAllShips = await handlers.monitor();
        await monitorAllShips();
        
        // Set up interval for continuous monitoring
        const monitorInterval = setInterval(async () => {
          await monitorAllShips();
        }, argv.interval * 1000);
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
          console.log('\n🛑 Stopping monitor because you said so - totally valid bestie, no cap...');
          clearInterval(monitorInterval);
          process.exit(0);
        });
      } else {
        // Run one-time check
        console.log('🔍 Checking on all ships...');
        const listShipsHandler = await handlers.ship.list();
        await listShipsHandler();
        console.log('✅ Monitoring check completed');
      }
    }
  )
  .command(
    'daemon <action>',
    'Manage the background monitoring daemon',
    (yargs) => {
      return yargs
        .positional('action', {
          describe: 'Action to perform',
          type: 'string',
          choices: ['start', 'stop', 'status', 'restart'] as const,
          demandOption: true
        })
        .option('interval', {
          alias: 'i',
          type: 'number',
          description: 'Monitoring interval in seconds (default: 30)',
          default: 30
        })
        .option('log-file', {
          alias: 'l',
          type: 'string',
          description: 'Custom log file path'
        })
        .option('pid-file', {
          alias: 'p',
          type: 'string',
          description: 'Custom PID file path'
        })
        .option('foreground', {
          alias: 'f',
          type: 'boolean',
          description: 'Run in foreground (for debugging)',
          default: false
        });
    },
    async (argv) => {
      const daemonHandler = await handlers.daemon();
      await daemonHandler({
        action: argv.action as 'start' | 'stop' | 'status' | 'restart',
        interval: argv.interval,
        logFile: argv.logFile,
        pidFile: argv.pidFile,
        detach: !argv.foreground
      });
    }
  )
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Run with verbose logging',
    default: false
  })
  .option('quiet', {
    alias: 'q',
    type: 'boolean',
    description: 'Run quietly',
    default: false
  })
  .help()
  .alias('help', 'h')
  .version('1.0.0')
  .alias('version', 'V')
  .demandCommand(1, 'You need at least one command before moving on')
  .strict()
  .parse();

// Handle global options
if ('verbose' in argv && argv.verbose) {
  console.log('Verbose mode enabled - prepare for TMI bestie, no cap');
}

if ('quiet' in argv && argv.quiet) {
  console.log = () => {};
}
