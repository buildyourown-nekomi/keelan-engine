import chalk from 'chalk';
import { db } from '../database/db.js';
import { keelanCrate, keelanShips } from '../database/schema.js';
import { eq } from 'drizzle-orm';
import { PATHS } from '../constants.js';
/**
 * Options for the list handler.
 * 
 * @property {'crate' | 'ships'} type - The type of items to list
 * @property {boolean} all - Whether to list all types of items
 */
interface ListOptions {
  type: 'crate' | 'ships';
  all: boolean;
}

/**
 * Lists all available Keelan crates (container images).
 * 
 * This function retrieves and displays all crates from the database,
 * showing their names and base images in a formatted output.
 * 
 * @throws {Error} If database query fails
 */
async function listCrates() {
  console.log(chalk.blue('📦 Here are all our crates and they\'re absolutely iconic:'));
  const crates = await db.select().from(keelanCrate);
  for (const crate of crates) {
    console.log(chalk.blue(`- ${crate.name} (bestie is serving container energy)`));
    console.log(chalk.gray(`  🔗 Image: ${crate.baseImage}`));
  }
}

/**
 * Lists all Keelan ships (running/stopped containers).
 * 
 * This function retrieves and displays detailed information about all ships,
 * including their status, associated images, start/stop times, exit codes,
 * and log file locations.
 * 
 * @throws {Error} If database query fails
 */
async function listShips() {
  console.log(chalk.blue('🚢 Ships are about to serve status updates:'));
  const ships = await db.select({
    name: keelanShips.name,
    imageName: keelanCrate.name,
    status: keelanShips.status,
    startedAt: keelanShips.startedAt,
    stoppedAt: keelanShips.stoppedAt,
    exitCode: keelanShips.exitCode
  })
  .from(keelanShips)
  .leftJoin(keelanCrate, eq(keelanShips.imageId, keelanCrate.id));
  
  for (const ship of ships) {
    console.log(chalk.blue(`- ${ship.name} (bestie is serving ship energy)`));
    console.log(chalk.gray(`  🔗 Image: ${ship.imageName || 'Unknown'}`));
    console.log(chalk.gray(`  🟢 Status: ${ship.status}`));
    console.log(chalk.gray(`  📅 Started: ${ship.startedAt}`));
    console.log(chalk.gray(`  📅 Stopped: ${ship.stoppedAt}`));
    console.log(chalk.gray(`  💀 Exit code: ${ship.exitCode}`));
    console.log(chalk.gray(`  📁 Logs: ${PATHS.logs}/${ship.name}/`));
  }
}

/**
 * Handles listing operations for Keelan crates and ships.
 * 
 * This function provides a unified interface for listing different types
 * of Keelan resources. Can list crates, ships, or both depending on options.
 * 
 * @param {ListOptions} options - Listing options specifying what to display
 * @throws {Error} If listing operation fails
 * @example
 * // List only crates
 * await listHandler({ type: 'crate', all: false });
 * 
 * // List only ships
 * await listHandler({ type: 'ships', all: false });
 * 
 * // List everything
 * await listHandler({ type: 'crate', all: true });
 */
export const listHandler = async (options: ListOptions) => {
  console.log(chalk.cyan(`📕 About to list ${options.type} and it\'s giving organized vibes...`));
  if (options.all) {
    console.log(chalk.yellow(' ⚠️  Listing all items - we\'re going full send'));
    await listCrates();
    await listShips();
  } else {
    console.log(chalk.green(`Items of type ${options.type} are about to serve looks here`));
    if (options.type === 'crate') {
      await listCrates();
    } else if (options.type === 'ships') {
      await listShips();
    }
  }
}