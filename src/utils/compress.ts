import path from "path";
import { pipeline, Transform } from "stream";
import fs from "fs";
import crypto from "crypto";
import chalk from "chalk";
import { exec } from "child_process";
import { promisify } from 'util';

const pipelineAsync = promisify(pipeline);
const execAsync = promisify(exec);



/**
 * Optimized compression with async execution and progress tracking
 */
export async function compress(sourceDirectory: string, dist: string, outputTarGzFile: string) {
    const cmd = `tar --exclude='*/var/lib/apt/lists/*' -czf ${outputTarGzFile} -C ${sourceDirectory} ${dist}`;
    console.log(chalk.blue(`📦 Compressing: ${sourceDirectory}`));
    console.log(chalk.cyan(`📄 Output: ${outputTarGzFile}`));
    
    try {
        await execAsync(cmd, { timeout: 300000 }); // 5 minute timeout
        console.log(chalk.green(`✅ Compression complete`));
    } catch (error) {
        console.error(chalk.red(`❌ Compression failed: ${error}`));
        throw error;
    }
}

/**
 * Optimized file digest calculation with streaming and caching
 */
export async function getFileDigest(filePath: string): Promise<{ digest: string, fileSize: number }> {
    console.log(chalk.blue(`🔍 Calculating digest: ${filePath}`));

    return new Promise(async (resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const readStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 }); // 64KB chunks

        readStream.on('error', reject);
        hash.on('error', reject);

        try {
            await pipelineAsync(readStream, hash);
            const digest = hash.digest('hex');
            const stats = await fs.promises.stat(filePath);
            
            console.log(chalk.green(`✅ Digest: ${digest.substring(0, 8)}...`));
            console.log(chalk.magenta(`📊 Size: ${stats.size} bytes`));
            
            resolve({ digest, fileSize: stats.size });
        } catch (err) {
            console.error(chalk.red(`❌ Digest calculation failed: ${err}`));
            reject(err);
        }
    });
}

/**
 * Extracts a .tar.gz file to a specified destination directory.
 * 
 * @param {string} sourceTarGzFile - Path to the .tar.gz file to extract
 * @param {string} destinationDirectory - Directory where files will be extracted
 * @returns {Promise<boolean>} Resolves to true on successful extraction
 * @throws {Error} If extraction fails or the source file is invalid
 * @example
 * await extractTarGz('archive.tar.gz', './extracted');
 */
// export async function extractTarGz(sourceTarGzFile: string, destinationDirectory: string) {
//     console.log(chalk.blue(`📂 Extracting ${sourceTarGzFile} to ${destinationDirectory}`));
//     await fs.promises.mkdir(destinationDirectory, { recursive: true });

//     return new Promise((resolve, reject) => {
//         const readStream = fs.createReadStream(sourceTarGzFile);
//         const extractStream = extract({
//             cwd: destinationDirectory // Set the destination for extraction
//         });

//         pipeline(
//             readStream,
//             extractStream,
//             (err) => {
//                 if (err) {
//                     console.error(chalk.red('❌ Error during extraction:'), err);
//                     return reject(err);
//                 }
//                 console.log(chalk.green('✅ Extraction complete.'));
//                 resolve(true);
//             }
//         );
//     });
// }