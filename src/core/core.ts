/**
 * Core logic for Keelan container management
 *
 * This module provides the main low-level operations for working with crates (container images)
 * and ships (running containers) in the Keelan system. It includes functions for mounting
 * and unmounting overlay filesystems, managing system directories, interacting with the database,
 * and performing file operations. Most functions are used by higher-level handlers to implement
 * CLI commands.
 *
 * Responsibilities:
 * - Create and remove directories for containers and images
 * - Mount and unmount OverlayFS and system directories (e.g., /proc, /dev)
 * - Bind system drives into container namespaces
 * - Check mountpoints for status
 * - Write crate metadata and files to the database
 * - Remove crates, gzip archives, and ships
 *
 * Note: Many operations require elevated privileges (sudo) and are Linux-specific.
 */

import { execSync } from "child_process";
import { db } from "../database/db.js";
import { keelanCrate, keelanFiles } from "../database/schema.js";
import sha256 from "sha256";
import { eq } from "drizzle-orm";
import load_env from "dotenv";
import chalk from "chalk";
import { PATHS } from "../constants.js";
load_env.config({ quiet: true });

/**
 * Creates a directory at the specified path with parent directories if they don't exist.
 * Uses sudo to ensure proper permissions.
 * 
 * @param {string} path - The directory path to create
 * @throws {Error} If directory creation fails
 * @example
 * createDirectory('/var/lib/keelan/crates/myapp');
 */
export function createDirectory(path: string): void {
    console.log(chalk.blue(`📁 Bout to create this directory like it's my main character era: ${path}`));
    execSync(`sudo mkdir -p ${path}`);
    console.log(chalk.green(`✅ Directory created and it's giving main character vibes bestie: ${path}`));
}

/**
 * Mounts an OverlayFS filesystem at the specified merge path.
 * 
 * @param {string} lowerdir - Path to the lower directory (read-only base layer)
 * @param {string} upperdir - Path to the upper directory (writable layer)
 * @param {string} workdir - Work directory required by OverlayFS
 * @param {string} merge_path - Path where the overlay will be mounted
 * @throws {Error} If mount operation fails
 * @requires sudo - Requires root privileges to execute mount command
 */
export function mountOverlayDirectory(lowerdir: string, upperdir: string, workdir: string, merge_path: string): void {
    console.log(chalk.blue(`🔧 Time to mount this overlay like we're building the ultimate tech stack:
    Lower: ${lowerdir}
    Upper: ${upperdir}
    Work: ${workdir}
    Merge: ${merge_path}`));
    execSync(`sudo mount -t overlay overlay -o lowerdir=${lowerdir},upperdir=${upperdir},workdir=${workdir} ${merge_path}`);
    console.log(chalk.green(`✅ Overlay mounted and it's absolutely sending me bestie: ${merge_path}`));
}

/**
 * Binds a directory to another mount point using mount --bind.
 * Typically used to make system directories available in container namespaces.
 * 
 * @param {string} path - Source directory path to bind
 * @param {string} mountpoint - Target mount point
 * @throws {Error} If bind mount operation fails
 * @requires sudo - Requires root privileges
 */
export function mountBindDrive(path: string, mountpoint: string): void {
    console.log(chalk.blue(`🔗 Binding this drive like we're creating the ultimate connection: ${path} to ${mountpoint}`));
    execSync(`sudo mount --bind ${path} ${mountpoint}`);
    console.log(chalk.green(`✅ Bind drive mounted successfully bestie: ${mountpoint}`));
}

/**
 * Checks if a directory is currently mounted.
 * 
 * @param {string} mountpoint - Path to check
 * @returns {boolean} True if the path is a mountpoint, false otherwise
 */
export function checkMountpoint(mountpoint: string): boolean {
    console.log(chalk.blue(`🔍 Checking if this mountpoint is giving what it's supposed to give: ${mountpoint}`));
    try {
        execSync(`mountpoint -q ${mountpoint}`);
        console.log(chalk.yellow(`⚠️  Mountpoint ${mountpoint} said "I'm already here bestie" - no cap detected`));
        return true;
    } catch (err: any) {
        console.log(chalk.green(`✅ Mountpoint ${mountpoint} is available bestie`));
        return false;
    }
}

/**
 * Mounts a container crate with proper overlay filesystem setup.
 * Also mounts essential system directories (/proc, /dev, /sys) into the container.
 * 
 * @param {string} lowerdir - Base layer directory (read-only)
 * @param {string} upperdir - Upper layer directory (writable changes)
 * @param {string} workdir - Work directory for OverlayFS
 * @param {string} merge_path - Path where the container filesystem will be mounted
 * @throws {Error} If any mount operation fails
 */
export function mountCrate(lowerdir: string, upperdir: string, workdir: string, merge_path: string): void {

    if(checkMountpoint(merge_path)) {
        console.log(chalk.yellow('⚠️  Mountpoint said "I already exist bestie" - skipping this whole situation'));
        return;
    }

    // Mount the directory
    console.log(chalk.yellow('🔧 Mounting OverlayFS...'));
    mountOverlayDirectory(lowerdir, upperdir, workdir, merge_path);
    console.log(chalk.green('✅ OverlayFS mounted successfully:'), chalk.cyan(merge_path));


    // Mounting other system directories
    console.log(chalk.yellow('🔧 Mounting system directories...'));

    mountBindDrive("/proc", merge_path + "/proc");
    mountBindDrive("/dev", merge_path + "/dev");
    mountBindDrive("/sys", merge_path + "/sys");

    // Mount DevPTS
    execSync(`mount -t devpts devpts ${merge_path}/dev/pts`);


    console.log(chalk.green('✅ System directories mounted and they\'re serving functionality realness'));
}

/**
 * Unmounts a container crate and cleans up mounted directories.
 * Safely handles cases where some mounts might not exist.
 * 
 * @param {string} merge_path - Path where the container is mounted
 */
export function unmountCrate(merge_path: string): void {
    
    if (!checkMountpoint(merge_path)) {
        console.log(chalk.yellow('⚠️  Mountpoint said "I don\'t exist" - can\'t unmount what\'s not there bestie'));
        return;
    }

    // Unmounting other system directories
    console.log(chalk.yellow('🧹 Time to unmount these system directories - cleanup era activated...'));
    try {
        execSync(`sudo umount ${merge_path}/dev/pts`);
        execSync(`sudo umount ${merge_path}/proc`);
        execSync(`sudo umount ${merge_path}/dev`);
        execSync(`sudo umount ${merge_path}/sys`);
    } catch (err: any) {
        console.log(chalk.yellow(`❌ System directories said "nah fam" and refused to unmount: ${err.message}`));
    }


    // Unmount the directory
    console.log(chalk.yellow('🧹 Unmounting OverlayFS - time to clean up this tech sandwich...'));
    try {
        execSync(`sudo umount ${merge_path}`);
        console.log(chalk.green('✅ OverlayFS unmounted and we\'re back to a clean slate - very demure, very mindful'));
    } catch (err: any) {
        console.log(chalk.yellow(`❌ OverlayFS said "I'm not going anywhere" and refused to unmount: ${err.message}`));
    }

    console.log(chalk.green('✅ System directories unmounted - cleanup complete and we\'re feeling fresh'));
}

/**
 * Writes crate file content to the database with a checksum.
 * 
 * @param {string} name - Name of the crate file
 * @param {string} content - File content to store
 * @returns {Promise<Array>} Database query result
 */
export async function writeCrateFile(name: string, content: string) {
    return db.
        insert(keelanFiles)
        .values({
            name: name,
            content: content,
            checksum: sha256(content)
        }).returning();
}

/**
 * Creates a new crate entry in the database.
 * 
 * @param {string} name - Name of the crate
 * @param {string} image - Base image name
 * @param {string} layer - Layer identifier
 * @param {number} sizeBytes - Size of the crate in bytes
 * @param {string} digest - Content-addressable digest of the crate
 * @param {number} keelanFileId - Reference to the Keelan file in the database
 * @returns {Promise<any>} Database query result
 */
export async function writeCrate(name: string, image: string, layer: string, sizeBytes: number, digest: string, keelanFileId: number): Promise<any> {
    return db
    .insert(keelanCrate)
    .values({
        name: name,
        tag: "latest",
        keelanFileId: keelanFileId,
        baseImage: image,
        layer: layer,
        sizeBytes: sizeBytes,
        digest: digest,
    })
}


/**
 * Checks if a crate with the given name already exists.
 * 
 * @param {string} name - Crate name to check
 * @returns {Promise<boolean>} True if a crate with the name exists, false otherwise
 */
export async function checkName(name: string): Promise<boolean> {
    const result = await db.select().from(keelanFiles).where(
        eq(keelanFiles.name, name)
    ).limit(1);
    return result.length > 0;
}

/**
 * Removes a crate and its associated directories.
 * 
 * @param {string} name - Name of the crate to remove
 * @param {Object} [options] - Removal options
 * @param {boolean} [options.force=false] - If true, ignores errors during removal
 * @throws {Error} If removal fails and force is false
 */
export async function removeCrate(name: string, options: { force?: boolean } = {}): Promise<void> {
    try {

        // Check if the crate is existing

        // Remove the directory of the image
        const cratePath = `${PATHS.crates}/${name}`;
        const workcratePath = `${cratePath}_work`;
        const mergecratePath = `${cratePath}_merge`;
        // execSync(`sudo umount ${mergecratePath} || ${options.force ? 'true' : 'false'}`);

        unmountCrate(mergecratePath);
        
        console.log(chalk.yellow(`🧹 About to yeet this crate into the void: ${cratePath}`));
        const rmCommand = `sudo rm -rf ${cratePath}`
        execSync(rmCommand);
        const rmWorkCommand = `sudo rm -rf ${workcratePath}`
        execSync(rmWorkCommand);
        const rmMergeCommand = `sudo rm -rf ${mergecratePath}`
        execSync(rmMergeCommand);
        console.log(chalk.green(`✅ Crate successfully yeeted - it\'s giving clean slate energy: ${cratePath}`));
        
    } catch (err: any) {
        if (options.force) {
            console.warn(`⚠️  Force removing image ${name} even though it\'s being dramatic:`, err.message);
        } else {
            throw new Error(`❌ Failed to remove image ${name}: ${err.message}`);
        }
    }
}

/**
 * Removes a gzipped crate archive.
 * 
 * @param {string} name - Name of the gzipped crate to remove
 * @param {Object} [options] - Removal options
 * @param {boolean} [options.force=false] - If true, ignores errors during removal
 * @throws {Error} If removal fails and force is false
 */
export async function removeGzipCrate(name: string, options: { force?: boolean } = {}): Promise<void> {
    try {

        // Check if the crate is existing
        if (!await checkName(name)) {
            console.log(chalk.yellow(`⚠️  Crate ${name} said "I don\'t exist bestie" - can\'t delete what\'s not there`));
            return;
        }

        const gzipCratePath = `${PATHS.crates}/${name}.tar.gz`;
        
        console.log(chalk.yellow(`🧹 Time to delete this gzip crate like it never happened: ${gzipCratePath}`));
        const rmCommand = `sudo rm -rf ${gzipCratePath}`
        execSync(rmCommand);
        console.log(chalk.green(`✅ Gzip crate deleted and it\'s giving fresh start vibes: ${gzipCratePath}`));

    } catch (err: any) {
        if (options.force) {
            console.warn(`⚠️  Force removing image ${name} even though it's throwing a tantrum:`, err.message);
        } else {
            throw new Error(`❌ Failed to remove image ${name}: ${err.message}`);
        }
    }
}

/**
 * Removes a ship (running container) and cleans up its resources.
 * 
 * @param {string} shipID - ID of the ship to remove
 * @param {Object} [options] - Removal options
 * @param {boolean} [options.force=false] - If true, ignores errors during removal
 * @param {boolean} [options.recursive=false] - If true, recursively removes dependent resources
 * @throws {Error} If removal fails and force is false
 */
export async function removeShip(shipID: string, options: { force?: boolean; recursive?: boolean } = {}): Promise<void> {
    try {
        // Remove the directory of the image
        const cratePath = `${PATHS.ships}/${shipID}`;
        const workcratePath = `${cratePath}_work`;
        const mergecratePath = `${cratePath}_merge`;
        unmountCrate(mergecratePath);
        
        console.log(chalk.yellow(`🧹 About to delete this ship like it sailed away: ${cratePath}`));
        const rmCommand = `sudo rm -rf ${cratePath}`
        execSync(rmCommand);
        const rmWorkCommand = `sudo rm -rf ${workcratePath}`
        execSync(rmWorkCommand);
        const rmMergeCommand = `sudo rm -rf ${mergecratePath}`
        execSync(rmMergeCommand);
        console.log(chalk.green(`✅ Ship successfully deleted - bon voyage bestie: ${cratePath}`));
    } catch (err: any) {
        if (!options.force) {
            throw new Error(`❌ Failed to remove crate ${shipID}: ${err instanceof Error ? err.message : String(err)}`);
        }
        console.warn(`⚠️  Force removing crate ${shipID} even though it's being extra dramatic:`, err instanceof Error ? err.message : String(err));
    }
}