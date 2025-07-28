import fs from 'fs-extra';
import * as fs_original from 'fs';
import { execSync } from 'child_process';
import { parse } from 'yaml';
import chalk from 'chalk';
import path from 'path';
import { KeelanParser } from '../keelan-parser.js';
import { keelanFiles, keelanShips } from '../database/schema.js';
import { eq } from 'drizzle-orm';
import { db } from '../database/db.js';
import { makeid } from '../utils/utils.js';
import { resolveLayer } from '../core/layer.js';
import { createDirectory } from '../core/core.js';
import { createAndMountOverlay } from '../utils/layer.js';
import { PATHS } from '../constants.js';

import net from 'net';

/**
 * Deployment configuration options for the deploy handler.
 * 
 * @property {'dev'|'staging'|'production'} env - The target environment for deployment
 * @property {string} name - The name of the crate/ship to deploy
 */
interface DeployOptions {
  env: 'dev' | 'staging' | 'production';
  name: string;
}

/**
 * Handles the deployment of a Keelan ship (container).
 * 
 * This function orchestrates the deployment process including:
 * - Validating the deployment configuration
 * - Resolving and setting up container layers
 * - Creating and mounting the container filesystem
 * - Communicating with the daemon to start the container
 * 
 * @param {DeployOptions} options - Deployment configuration options
 * @throws {Error} If deployment configuration is invalid or deployment fails
 * @example
 * await deployHandler({
 *   env: 'production',
 *   name: 'my-app'
 * });
 */
export const deployHandler = async (options: DeployOptions) => {
  
  const file_data = await db.select().from(keelanFiles).where(
    eq(keelanFiles.name, options.name)
  )

  if (!file_data.length) {
    console.error(chalk.red('❌ Error: Crate not found bestie.'));
    process.exit(1);
  }

  // console.log(file_data[0].content)

  const config = KeelanParser.parseFromString(file_data[0].content);

  const steps = config.runtime_command || config.runtime_entrypoint;
  if (!steps) {
    console.error(chalk.red('❌ Error: No "deploy" configuration found in Keelanfile.yml bestie.'));
    process.exit(1);
  }

  console.log(chalk.cyan('🚢 Ready to sail like we\'re about to conquer the seven seas!'));

  // Create ship
  const shipID = makeid(12)

  // Reserve space for the ship
  console.log(chalk.yellow('🔍 Resolving base image layers like we\'re solving a puzzle...'));
  const lowerlayers = await resolveLayer(file_data[0].name);
  console.log(chalk.green('✅ Successfully resolved'), chalk.cyan(lowerlayers.length), chalk.green('layers - that\'s giving organized vibes!'));

  const upperdir_path = path.join(PATHS.ships, shipID);

  const workdir_path = upperdir_path + "_work";
  const merge_path = upperdir_path + "_merge";

  await createAndMountOverlay(upperdir_path, lowerlayers, workdir_path, merge_path);

  const command_w_chroot = `chroot ${path.join(PATHS.ships, shipID + '_merge')} ${steps.join(' ')}`;

  console.log(chalk.blue(`🚀 Time to deploy ship ${options.name} and let it sail into the digital ocean like the main character it is...`));

  // Ensure the log directory exists
  const logDir = path.join(PATHS.logs, options.name);
  await fs.ensureDir(logDir);

  /**
   * Establishes a connection to the Keelan daemon to manage the container lifecycle.
   * 
   * @returns {Promise<void>} Resolves when the deployment is acknowledged by the daemon
   * @throws {Error} If connection to the daemon fails
   * @private
   */
  const connectToDaemon = () => {
    return new Promise<void>((resolve, reject) => {
      const message = {
        type: 'deploy',
        shipID,
        command: command_w_chroot,
        logDir,
        imageId: file_data[0].id
      };

      const client = net.createConnection(9876, 'localhost', () => {
        client.write(JSON.stringify(message));
      });

      client.on('data', (data) => {
        const response = JSON.parse(data.toString());
        if (response.status === 'success') {
          console.log(chalk.green(`✅ Ship '${options.name}' deployed successfully and it's giving main character energy - ready to sail!`));
        } else {
          console.error(chalk.red(`❌ Ship '${options.name}' deployment hit some rough waters and failed:`), response.message);
        }
        client.end();
        resolve();
      });

      client.on('error', (err) => {
        console.log(chalk.yellow(`⚠️  Ship '${options.name}' is already out there living its best life bestie.`));
        reject(err);
      });
    });
  };

  try {
    await connectToDaemon();
  } catch (error) {
    console.error(chalk.red('❌ Failed to connect to daemon bestie'));
    process.exit(1);
  }

  console.log(chalk.green('🎉 Deploy initiated bestie!'));
  console.log(chalk.blue('📊 Monitoring handled by daemon bestie...'));
  console.log(chalk.gray(`📁 Logs: ${path.join(PATHS.logs, options.name)}/`));
};