import { db } from "../database/db.js"; 
import { eq } from "drizzle-orm";
import { keelanCrate } from "../database/schema.js";
import chalk from "chalk";

/**
 * Resolves the complete layer hierarchy for a given container image.
 * 
 * This function recursively resolves all layers that make up a container image,
 * starting from the base image up to the specified image. It handles both
 * built-in images (like 'debian') and custom images stored in the database.
 * 
 * @param {string} name - The name of the image/layer to resolve
 * @returns {Promise<string[]>} An array of layer names in order from base to top
 * @throws {Error} If the specified layer cannot be found in the database
 * @example
 * const layers = await resolveLayer('my-app');
 * // Returns: ['debian', 'base-runtime', 'my-app']
 */
export async function resolveLayer(name: string): Promise<string[]> {
    console.log(chalk.blue(`🔍 Resolving layers like we're solving a puzzle for bestie: ${name}`));
    
    // Query the database for the layer
    if (name == "debian") {
        // Default image, return the name
        console.log(chalk.green(`✅ Found 1 layers for ${name} and they're giving organized vibes bestie`));
        return [name];
    }

    // Query the database for the layer
    const result = await db.select().from(keelanCrate).where(
        eq(keelanCrate.name, name)
    ).limit(1);
    
    if (!result || result.length === 0) {
        console.error(chalk.red(`❌ Layers for ${name} went missing - bestie, something went wrong:`), new Error(`Layer ${name} not found`));
        throw new Error(`Layer ${name} not found`);
    }
    
    // Recursively resolve the base layer
    const baseLayers = await resolveLayer(result[0].baseImage);
    
    // Check if the current layer is already in the base layers to prevent duplicates
    if (!baseLayers.includes(name)) {
        baseLayers.unshift(name);
    }
    
    console.log(chalk.green(`✅ Found ${baseLayers.length} layers for ${name} and they're giving organized vibes bestie`));
    return baseLayers;
}
