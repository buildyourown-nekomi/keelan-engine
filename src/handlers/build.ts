import fs from 'fs-extra';
import * as fs_original from 'fs';
import { execSync, spawn } from 'child_process';
import { parse } from 'yaml';
import { KeelanParser } from '../keelan-parser.js';
import { resolveLayer } from '../core/layer.js';
import { checkName, createDirectory, mountOverlayDirectory, removeShip, removeCrate, writeCrateFile, mountBindDrive, mountCrate, writeCrate, unmountCrate } from '../core/core.js';
import chalk from 'chalk';
import { TailLog } from '../utils/logging.js';
import sha256 from 'sha256';
import { compress, getFileDigest } from '../utils/compress.js';
import { removeCrateHandler } from './remove.js';
import path from 'path';
import { createAndMountOverlay } from '../utils/layer.js';
import { PATHS } from '../constants.js';

/**
 * Build configuration options for the build handler.
 * 
 * @property {boolean} watch - Whether to watch for file changes and rebuild
 * @property {boolean} production - Whether to build in production mode
 * @property {string} workingDirectory - The working directory for the build
 * @property {string} name - The name of the crate to build
 */
interface BuildOptions {
  watch: boolean;
  production: boolean;
  workingDirectory: string;
  name: string;
}

/**
 * Handles the build process for a Keelan crate.
 * 
 * This function orchestrates the entire build process including:
 * - Validating the build environment and configuration
 * - Setting up the build directory structure
 * - Mounting the overlay filesystem
 * - Executing build commands in the container environment
 * - Saving the built crate to the database
 * 
 * @param {BuildOptions} options - Build configuration options
 * @throws {Error} If any step in the build process fails
 * @example
 * await buildHandler({
 *   watch: false,
 *   production: true,
 *   workingDirectory: './myapp',
 *   name: 'myapp'
 * });
 */
export const buildHandler = async (options: BuildOptions) => {
  if (options.workingDirectory) {
    process.chdir(options.workingDirectory);
  }

  if (!options.name || options.name.length == 0) {
    console.error(chalk.red('❌ Error: Name not specified - bestie, we need a name to work with fr.'));
    process.exit(1);
  }

  if (await checkName(options.name)) {
    console.error(chalk.yellow('⚠️  Error: Name already exists - that name is already taken bestie, no cap.'));
    // Delete the crate if it exists
    await removeCrate(options.name);
    console.log(chalk.green('✅ Crate deleted successfully and it\'s giving fresh start energy, periodt.'));
  }

  if (!fs_original.existsSync('Keelanfile.yml')) {
    console.error(chalk.red('❌ Error: Keelanfile.yml not found - bestie, where\'s the config at?'));
    console.error(chalk.red('❌ Please run "Keelan init" to create a new Keelanfile.yml - we need that file to work our magic fr.'));
    process.exit(1);
  }

  const config = KeelanParser.parseFromFile('Keelanfile.yml');

  // So here we start to build the crate
  // Steps
  // 1. Propagate layer (aka resolve from) [v]
  // 2. Reserve OverlayFS (using name to create a directory) [v]
  // 3. Mount OverlayFS (using name to mount the directory) [v]
  // 4. Verify OverlayFS [v]
  // 5. Build the image (run command in the steps config) [-]
  // 6. Save the image to the database (save the upperdir (aka name) to the database)

  // 1. Propagate layer
  console.log(chalk.magenta('🚀 Starting build process for bestie:'), chalk.cyan(options.name));
  console.log(chalk.magenta('🐳 Base image:'), chalk.cyan(config.build_context.base_image));

  const image = config.build_context.base_image;
  console.log(chalk.yellow('🔍 Resolving base image layers like we\'re solving a puzzle...'));
  const lowerlayers = await resolveLayer(image);
  console.log(chalk.green('✅ Successfully resolved'), chalk.cyan(lowerlayers.length), chalk.green('layers and they\'re all accounted for bestie'));

  const upperdir = options.name;
  const upperdir_path = `${PATHS.crates}/${upperdir}`;

  const workdir_path = upperdir_path + "_work";
  const merge_path = upperdir_path + "_merge";

  await createAndMountOverlay(upperdir_path, lowerlayers, workdir_path, merge_path);

  // Update the database
  console.log(chalk.yellow('💾 Updating database like we\'re saving our progress bestie...'));
  // Write the image file to the database
  const content = fs.readFileSync("Keelanfile.yml", 'utf8');
  const keelanFile = await writeCrateFile(options.name, content);
  console.log(chalk.green('✅ Successfully updated database and it\'s giving organized vibes bestie.'));

  // Setup crate (later)
  console.log(chalk.yellow('📦 Setting up crate like we\'re preparing for the main event bestie...'));

  // await sleep(3000);
  try {
    for (let step of config.build_steps) {
      console.log(chalk.blue('🔨 About to build this crate like we\'re on a construction reality show bestie:'), chalk.yellow(step.action));
      // await sleep(1000);
      if (step.action == "execute_command") {
        if (!step.command || step.command.length == 0) {
          console.error(chalk.red('❌ Error: Command not specified - bestie, we need to know what to run fr.'));
          process.exit(1);
        }
        console.log(chalk.magenta('🏃 Running command bestie:'), chalk.cyan(step.description), chalk.magenta('with:'), chalk.cyan(step.command.join(" ")));
        await runCommandInCrate(step.command.join(" "), options.name);
      } else if (step.action == "copy_files") {
        if (!step.source || step.source.length == 0) {
          console.error(chalk.red('❌ Error: Source not specified - bestie, where are we copying from tho?'));
          process.exit(1);
        }
        if (!step.destination || step.destination.length == 0) {
          console.error(chalk.red('❌ Error: Destination not specified - fam, where should this go bestie?'));
          process.exit(1);
        }


        console.log(chalk.magenta('📋 Copying files bestie:'), chalk.cyan(step.source), chalk.magenta('to:'), chalk.cyan(step.destination));

        // Destination directory
        const destination_dir = merge_path + step.destination;
        if (!fs_original.existsSync(destination_dir)) {
          console.log(chalk.yellow('📁 Destination directory does not exist. Creating it like we\'re building from scratch bestie...'));
          fs_original.mkdirSync(destination_dir, { recursive: true });
        }

        fs.copySync(step.source, destination_dir);
        console.log(chalk.green('✅ Files copied successfully and they\'re in their new home bestie.'));
      }
    }
  } catch (error: any) {
    console.log(error)
    console.log(chalk.red("❌ Crate build failed and it's giving broken dreams energy bestie. Please check the logs for more tea."));
    // Clean up the crate
    console.log(chalk.yellow('🧹 Cleaning up crate like we\'re Marie Kondo-ing this space bestie...'));
    // await sleep(1000);
    await removeCrateHandler({ name: options.name, force: true, recursive: true });
    process.exit(1);
  }

  // Gzip the crate (upperdir)
  console.log(chalk.yellow('📦 Compressing crate like we\'re packing for a trip bestie...'));

  const archivePath = `${PATHS.crates}/${options.name}.tar.gz`;

  await compress(path.dirname(upperdir_path), path.basename(upperdir_path), archivePath);

  const { digest, fileSize } = await getFileDigest(archivePath);

  console.log(chalk.green('✅ Crate compressed successfully and it\'s giving compact vibes bestie. Archive path:'), chalk.cyan(archivePath));
  console.log(chalk.yellow('🔑 SHA256 Digest:'), chalk.cyan(digest));
  console.log(chalk.magenta('📊 File Size:'), chalk.cyan(fileSize));

  // console.log(keelanFile)

  console.log(chalk.yellow('💾 Writing crate to database like we\'re saving our masterpiece bestie...'));
  // Create database for crate
  await writeCrate(
    options.name,
    config.build_context.base_image,
    merge_path,
    fileSize,
    digest,
    keelanFile[0].id);
  console.log(chalk.green('✅ Crate written to database and it\'s officially documented bestie.'));

  // Unmount the crate
  console.log(chalk.yellow('🧹 Unmounting crate like we\'re cleaning up after the party bestie...'));
  unmountCrate(merge_path);
  console.log(chalk.green('✅ Crate unmounted successfully and everything\'s back to normal bestie.'));

  console.log(chalk.green('✅ Crate built successfully and it\'s absolutely serving functionality bestie.'));
};

/**
 * Executes a shell command within the context of a crate's filesystem.
 * 
 * @param {string} command - The command to execute
 * @param {string} crate - The name of the crate to run the command in
 * @returns {Promise<{stdout: string, stderr: string, code: number}>} Command execution result
 * @private
 */
async function runCommandInCrate(command: string, crate: string) {
  // Run the command in the crate
  const crate_path = `${PATHS.crates}/${crate}_merge`;
  console.log(chalk.magenta('🏃 Running command in crate bestie:'), chalk.cyan(crate_path));
  console.log(chalk.blue('🔧 Command:'), chalk.yellow(command));

  const command_w_proot = `chroot ${crate_path} ${command}`;

  // Execute the command
  try {
    await executeCommandRealtime(command_w_proot);
    console.log(chalk.green('✅ Command executed successfully and it\'s giving success vibes bestie.'));
  } catch (error: any) {
    console.error(chalk.red('❌ Error executing command - bestie, something went wrong fr:'), chalk.yellow(command));
    console.error(chalk.red('❌ Error bestie:'), chalk.yellow(error.toString()));
    throw error;
  }
}

/**
 * Executes a command and streams output in real-time.
 * 
 * @param {string} commandString - The command to execute
 * @returns {Promise<number>} The exit code of the command
 * @private
 */
async function executeCommandRealtime(commandString: string) {

  const parts = commandString.split(' ');
  const command = parts[0];
  const args = parts.slice(1);

  console.log(chalk.magenta('🚀 Running command realtime like we\'re watching it happen bestie:'), chalk.cyan(command), chalk.magenta('with args:'), chalk.cyan(args.toString()));

  return new Promise((resolve, reject) => {
    // Spawn the child process
    const child = spawn(command, args);

    const logg = new TailLog();

    // Listen for data on standard output (stdout)
    child.stdout.on('data', (data: any) => {
      // console.log(`[stdout]: ${data.toString().trim()}`);
      logg.log(chalk.gray(data.toString().trim()));
    });

    // Listen for data on standard error (stderr)
    child.stderr.on('data', (data: any) => {
      // console.error(`[stderr]: ${data.toString().trim()}`);
      logg.log(chalk.red(data.toString().trim()));
    });

    // Listen for the child process to close
    child.on('close', (code: number) => {
      if (code === 0) {
        // console.log(`3. Child process exited successfully with code ${code}.`);
        resolve(code);
      } else {
        // console.error(`3. Child process exited with non-zero code ${code}.`);
        // We don't reject here because stderr would have already captured the error details.
        // The promise resolves with the non-zero code, indicating a command-level error.
        reject(code);
      }
    });

    // Listen for errors (e.g., command not found, permission issues)
    child.on('error', (err: any) => {
      logg.log(`4. Failed to spawn child process or an internal error occurred: ${err.message}`);
      reject(err); // Reject the promise on spawn errors
    });
  });
}

/**
 * Pauses execution for a specified number of milliseconds.
 * 
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>} Resolves after the specified delay
 * @private
 */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}