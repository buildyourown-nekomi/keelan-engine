import { checkName, removeCrate, removeGzipCrate, removeShip } from '../core/core.js';
import chalk from 'chalk';
import { db } from '../database/db.js';
import { keelanCrate, keelanFiles, keelanShips } from '../database/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Configuration options for remove operations.
 * 
 * @property {boolean} force - Whether to force the removal operation
 * @property {boolean} recursive - Whether to recursively remove related resources
 */
interface RemoveOptions {
  force: boolean;
  recursive: boolean;
}

/**
 * Handles the removal of a Keelan crate (container image).
 * 
 * This function orchestrates the complete crate removal process including:
 * - Validating the crate exists
 * - Removing the crate filesystem and overlay
 * - Removing the compressed crate archive
 * - Cleaning up database entries
 * 
 * @param {RemoveOptions & { name: string }} options - Removal configuration with crate name
 * @throws {Error} If crate removal fails
 * @example
 * await removeCrateHandler({
 *   name: 'my-app',
 *   force: true,
 *   recursive: false
 * });
 */
export const removeCrateHandler = async (options: RemoveOptions & { name: string }) => {
  const { name, force } = options;
  try {
    if (!await checkName(name)) {
      console.log(chalk.yellow(`Crate ${name} does not exist bestie. Skipping removal.`));
      return;
    }
    await removeCrate(name, { force });
    await removeGzipCrate(name, { force });
      // remove the Gzip file

    await db.delete(keelanFiles)
      .where(eq(keelanFiles.name, name))
      .execute();

    await db.delete(keelanCrate)
      .where(eq(keelanCrate.name, name))
      .execute();

    console.log(chalk.green(`✅ Crate '${name}' successfully yeeted and it's giving clean slate vibes.`));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`❌ Crate '${name}' said "I'm not going anywhere" and refused to be deleted:`, errorMessage));
    process.exit(1);
  }
};

/**
 * Handles the removal of a Keelan ship (running container).
 * 
 * This function orchestrates the complete ship removal process including:
 * - Stopping the ship if it's running
 * - Removing the ship's filesystem and resources
 * - Cleaning up database entries
 * - Optionally removing related crates if recursive is enabled
 * 
 * @param {RemoveOptions & { name: string }} options - Removal configuration with ship name
 * @throws {Error} If ship removal fails
 * @example
 * await removeShipHandler({
 *   name: 'my-app',
 *   force: true,
 *   recursive: true
 * });
 */
export const removeShipHandler = async (options: RemoveOptions & { name: string }) => {
  const { name, force, recursive } = options;
  try {
    await removeShip(name, { force, recursive });
    await db.delete(keelanShips)
      .where(eq(keelanShips.name, name))
      .execute();
    console.log(chalk.green(`✅ Ship '${name}' successfully deleted and it's giving clean slate vibes - bon voyage bestie!`));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`❌ Ship '${name}' said "I'm not going anywhere" and refused to be deleted:`, errorMessage));
    process.exit(1);
  }
};