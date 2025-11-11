const fs = require('fs').promises;
const path = require('path');

const registryFilePath = path.join(__dirname, '..', 'Registered.json');

/**
 * Reads the Registered.json file.
 */
async function readRegistry() {
  try {
    await fs.access(registryFilePath); 
    const data = await fs.readFile(registryFilePath, 'utf-8');
    if (data === "") {
        return {}; 
    }
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await writeRegistry({}); // Create the file
      return {}; 
    }
    console.error('[JSON Registry] Error reading file:', error);
    throw error;
  }
}

/**
 * Writes to the Registered.json file.
 */
async function writeRegistry(registryData) {
  try {
    const data = JSON.stringify(registryData, null, 2);
    await fs.writeFile(registryFilePath, data, 'utf-8');
  } catch (error) {
    console.error('[JSON Registry] Error writing file:', error);
    throw error;
  }
}

/**
 * Registers a new hospital in the JSON file.
 * NOW INCLUDES PAILLIER PUBLIC KEY
 */
async function registerHospitalInJson(hospitalName, walletAddress, rsaPublicKey, paillierPublicKey) {
  const registry = await readRegistry();
  
  registry[walletAddress] = {
    name: hospitalName,
    rsaPublicKey: rsaPublicKey,
    paillierPublicKey: paillierPublicKey // *** NEW: Store Paillier key ***
  };
  
  await writeRegistry(registry);
  console.log(`[JSON Registry] Registered hospital: ${hospitalName} (${walletAddress})`);
}

module.exports = { readRegistry, registerHospitalInJson };