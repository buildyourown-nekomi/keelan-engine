import chalk from "chalk";
import { createDirectory, mountCrate } from "../core/core.js";
import { PATHS } from "../constants.js";

/**
 * Creates and mounts an OverlayFS filesystem for container layering.
 * 
 * This function sets up a layered filesystem using OverlayFS, which allows
 * multiple directories to be combined into a single unified view. This is
 * essential for container functionality where base images are combined with
 * application-specific changes.
 * 
 * @param {string} upperdir_path - Path to the upper directory (writable layer)
 * @param {string[]} lowerlayers - Array of lower layer directory names (read-only base layers)
 * @param {string} workdir_path - Path to the work directory (used by OverlayFS for metadata)
 * @param {string} merge_path - Path where the merged filesystem will be mounted
 * @returns {Promise<string>} The constructed lowerdir string used for mounting
 * @throws {Error} If directory creation or mounting fails
 * @example
 * const lowerdir = await createAndMountOverlay(
 *   '/var/lib/keelan/upper/myapp',
 *   ['debian', 'nodejs'],
 *   '/var/lib/keelan/work/myapp',
 *   '/var/lib/keelan/merge/myapp'
 * );
 */
export async function createAndMountOverlay(
    upperdir_path: string, 
    lowerlayers: string[],
    workdir_path: string,
    merge_path: string
) {
    createDirectory(upperdir_path);
    createDirectory(workdir_path);
    createDirectory(merge_path);

    let lowerdir = ""

    console.log(chalk.blue(`🔧 About to create and mount overlay like we're building a digital sandwich:`));
    console.log(chalk.yellow('🔧 Processing lower layers...'));
    for (let dir of lowerlayers) {
        console.log(chalk.cyan('📦 Processing layer:'), chalk.yellow(dir));
        const dir_path = `${PATHS.crates}/${dir}`;
        console.log(chalk.green('📁 Resolved layer path:'), chalk.cyan(dir_path));
        lowerdir += dir_path + ":";
    }

    lowerdir = lowerdir.slice(0, -1); // Remove the last colon
    console.log(chalk.magenta('⚙️  Layer configuration:'));
    console.log(chalk.cyan('🔽 Lower layers (the foundation):'), chalk.yellow(lowerdir));
    console.log(chalk.cyan('🔼 Upper directory (the fresh stuff):'), chalk.yellow(upperdir_path));
    console.log(chalk.cyan('🔧 Work directory (where the magic happens):'), chalk.yellow(workdir_path));
    console.log(chalk.cyan('📂 Merge directory (the final result):'), chalk.yellow(merge_path));

    // Mounting the directory
    mountCrate(lowerdir, upperdir_path, workdir_path, merge_path);

    return lowerdir

}