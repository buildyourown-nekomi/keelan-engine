/**
 * Generates a random alphanumeric string of specified length.
 * 
 * This function creates a random string using uppercase letters, lowercase letters,
 * and digits. Useful for generating unique identifiers, temporary names, or tokens.
 * 
 * @param {number} length - The desired length of the generated string
 * @returns {string} A random alphanumeric string of the specified length
 * @example
 * const randomId = makeid(8); // Returns something like "aB3xY9mK"
 * const shortId = makeid(4);  // Returns something like "X7nP"
 */
export function makeid(length: number) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}
