import chalk from 'chalk';
import fs from 'fs-extra';
import net from 'net';
import { db } from '../database/db.js';
import { keelanFiles, keelanShips } from '../database/schema.js';
import { eq } from 'drizzle-orm';
import { KeelanParser } from '../keelan-parser.js';
import { resolveLayer } from '../core/layer.js';
import { createAndMountOverlay } from '../utils/layer.js';
import { PATHS } from '../constants.js';

/**
 * Configuration options for ship operations.
 * 
 * @property {string} name - The name of the ship to operate on
 * @property {boolean} [force] - Whether to force the operation (optional)
 */
interface ShipOptions {
  name: string;
  force?: boolean;
}

/**
 * Configuration options for starting a ship, extending basic ship options.
 * 
 * @property {string} name - The name of the ship to start
 * @property {boolean} [force] - Whether to force the start operation (optional)
 * @property {'dev'|'staging'|'production'} [env] - The environment to start the ship in (optional, defaults to 'dev')
 */
interface StartShipOptions extends ShipOptions {
  env?: 'dev' | 'staging' | 'production';
}

/**
 * Sends a message to the Keelan daemon via TCP socket connection.
 * 
 * @param {any} message - The message object to send to the daemon
 * @returns {Promise<any>} The response from the daemon
 * @throws {Error} If connection to daemon fails
 * @private
 * @example
 * const response = await sendMessageToDaemon({
 *   type: 'start',
 *   shipName: 'my-app',
 *   env: 'production'
 * });
 */
async function sendMessageToDaemon(message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(9876, 'localhost', () => {
      client.write(JSON.stringify(message));
    });

    client.on('data', (data) => {
      const response = JSON.parse(data.toString());
      client.end();
      resolve(response);
    });

    client.on('error', (err) => {
      reject(new Error(`Failed to connect to daemon: ${err.message}`));
    });
  });
}

/**
 * Handles starting a Keelan ship (container).
 * 
 * This function orchestrates the ship startup process including:
 * - Validating the ship configuration exists
 * - Checking if the ship is already running
 * - Setting up the container environment
 * - Communicating with the daemon to start the ship process
 * 
 * @param {StartShipOptions} options - Ship startup configuration options
 * @throws {Error} If ship configuration is invalid or startup fails
 * @example
 * await startShipHandler({
 *   name: 'my-app',
 *   env: 'production'
 * });
 */
export const startShipHandler = async (options: StartShipOptions) => {
  const { name, env = 'dev' } = options;
  
  try {
    // Check if ship already exists and is running
    const existingShip = await db.select()
      .from(keelanShips)
      .where(eq(keelanShips.name, name))
      .limit(1);
    
    if (existingShip.length > 0) {
      const ship = existingShip[0];
      if (ship.status === 'running' && ship.processId) {
        console.log(chalk.yellow(`⚠️  Ship '${name}' is already running bestie (PID: ${ship.processId}) - no need to start what's already sailing`));
        return;
      }
    }
    
    // Get the crate data to restart the ship
    const shipData = existingShip.length > 0 ? existingShip[0] : null;
    if (!shipData) {
      console.error(chalk.red(`❌ Ship '${name}' doesn't exist bestie. Use 'keelan ship deploy' to birth a new ship into existence fr.`));
      process.exit(1);
    }
    
    // Get the crate configuration
    const crateData = await db.select()
      .from(keelanFiles)
      .where(eq(keelanFiles.id, shipData.imageId))
      .limit(1);
    
    if (!crateData.length) {
      console.error(chalk.red(`❌ Crate data for ship '${name}' went missing - that's sus bestie.`));
      process.exit(1);
    }
    
    const config = KeelanParser.parseFromString(crateData[0].content);
    const steps = config.runtime_command || config.runtime_entrypoint;
    
    if (!steps) {
      console.error(chalk.red('❌ Error: Keelanfile.yml is giving us nothing for runtime config - very unhelpful bestie.'));
      process.exit(1);
    }
    
    console.log(chalk.cyan(`🚀 About to launch ship '${name}' into the digital ocean like we're setting sail bestie...`));
    
    // Resolve layers and mount overlay
    const lowerlayers = await resolveLayer(crateData[0].name);
    const upperdir_path = `${PATHS.ships}/${name}`;
    const workdir_path = upperdir_path + "_work";
    const merge_path = upperdir_path + "_merge";
    
    await createAndMountOverlay(upperdir_path, lowerlayers, workdir_path, merge_path);
    
    const command_w_chroot = `chroot ${PATHS.ships}/${name}_merge ${steps.join(' ')}`;
    
    // Ensure log directory exists
    const logDir = `${PATHS.logs}/${name}`;
    await fs.ensureDir(logDir);
    
    // Send start message to daemon
    try {
      const message = {
        type: 'start',
        shipName: name,
        command: command_w_chroot,
        logDir: logDir,
        imageId: shipData.imageId
      };
      
      const response = await sendMessageToDaemon(message);
      
      if (response.status === 'success') {
        console.log(chalk.green(`✅ Ship '${name}' launched successfully and it's giving smooth sailing vibes bestie! PID: ${response.pid}`));
      } else {
        console.error(chalk.red(`❌ Ship '${name}' refused to start and it's giving broken vibes bestie: ${response.message}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`❌ Daemon said "new phone who dis" and refused to communicate bestie: ${error}`));
      console.log(chalk.yellow('💡 Make sure the daemon is awake and running with: keelan daemon start bestie'));
      process.exit(1);
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`❌ Ship '${name}' had a moment and couldn't start bestie:`, errorMessage));
    process.exit(1);
  }
};

/**
 * Handles stopping a running Keelan ship (container).
 * 
 * This function orchestrates the ship shutdown process including:
 * - Validating the ship exists and is running
 * - Communicating with the daemon to stop the ship process
 * - Gracefully or forcefully terminating the container
 * 
 * @param {ShipOptions} options - Ship stop configuration options
 * @throws {Error} If ship doesn't exist or stop operation fails
 * @example
 * await stopShipHandler({
 *   name: 'my-app',
 *   force: true
 * });
 */
export const stopShipHandler = async (options: ShipOptions) => {
  const { name, force = false } = options;
  
  try {
    console.log(chalk.cyan(`🛑 Time to dock ship '${name}' and call it a day like we're closing shop bestie...`));
    
    // Send stop message to daemon
    try {
      const message = {
        type: 'stop',
        shipName: name,
        force: force
      };
      
      const response = await sendMessageToDaemon(message);
      
      if (response.status === 'success') {
        console.log(chalk.green(`✅ Ship '${name}' stopped successfully and it's giving peaceful vibes bestie`));
      } else {
        console.error(chalk.red(`❌ Ship '${name}' said "I'm not stopping" and refused to dock bestie: ${response.message}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`❌ Daemon ghosted us and won't respond bestie: ${error}`));
      console.log(chalk.yellow('💡 Check if the daemon is still alive with: keelan daemon start bestie'));
      process.exit(1);
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`❌ Ship '${name}' threw a tantrum and won't stop bestie:`, errorMessage));
    process.exit(1);
  }
};

/**
 * Handles restarting a Keelan ship (container).
 * 
 * This function performs a complete restart by stopping the ship first,
 * waiting briefly, then starting it again with the same configuration.
 * 
 * @param {StartShipOptions} options - Ship restart configuration options
 * @throws {Error} If restart operation fails during stop or start phase
 * @example
 * await restartShipHandler({
 *   name: 'my-app',
 *   env: 'production'
 * });
 */
export const restartShipHandler = async (options: StartShipOptions) => {
  const { name } = options;
  
  try {
    console.log(chalk.cyan(`🔄 Giving ship '${name}' a fresh start like it's getting that Monday morning energy bestie...`));
    
    // Stop the ship first
    await stopShipHandler({ name, force: true });
    
    // Wait a moment before starting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start the ship
    await startShipHandler(options);
    
    console.log(chalk.green(`✅ Ship '${name}' restarted and it's giving main character energy again bestie`));
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`❌ Ship '${name}' couldn't handle the restart and it's giving broken vibes bestie:`, errorMessage));
    process.exit(1);
  }
};

/**
 * Handles listing all Keelan ships with their current status and details.
 * 
 * This function retrieves and displays information about all ships including:
 * - Ship name and associated image
 * - Current status (running, stopped, failed)
 * - Process ID (if running)
 * - Start/stop timestamps
 * - Exit codes and log locations
 * 
 * @throws {Error} If database query fails
 * @example
 * await listShipsHandler();
 */
export const listShipsHandler = async () => {
  console.log(chalk.blue('🚢 Here are all our ships and they\'re serving fleet energy:'));
  const ships = await db.select({
    name: keelanShips.name,
    imageName: keelanFiles.name,
    status: keelanShips.status,
    processId: keelanShips.processId,
    startedAt: keelanShips.startedAt,
    stoppedAt: keelanShips.stoppedAt,
    exitCode: keelanShips.exitCode
  })
  .from(keelanShips)
  .leftJoin(keelanFiles, eq(keelanShips.imageId, keelanFiles.id));
  
  for (const ship of ships) {
    const statusColor = ship.status === 'running' ? chalk.green : 
                       ship.status === 'stopped' ? chalk.yellow : chalk.red;
    
    console.log(chalk.blue(`- ${ship.name} (bestie is serving ship vibes)`));
    console.log(chalk.gray(`  🔗 Image: ${ship.imageName || 'Unknown'}`));
    console.log(chalk.gray(`  ${statusColor('●')} Status: ${ship.status}`));
    if (ship.processId) {
      console.log(chalk.gray(`  🆔 PID: ${ship.processId}`));
    }
    console.log(chalk.gray(`  📅 Started: ${ship.startedAt}`));
    if (ship.stoppedAt) {
      console.log(chalk.gray(`  📅 Stopped: ${ship.stoppedAt}`));
    }
    if (ship.exitCode !== null) {
      console.log(chalk.gray(`  💀 Exit code: ${ship.exitCode}`));
    }
    console.log(chalk.gray(`  📁 Logs: ${PATHS.logs}/${ship.name}/`));
    console.log(); // Empty line for readability
  }
};