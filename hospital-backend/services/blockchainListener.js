const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const forge = require("node-forge"); // *** CORRECTED: Was a string "" ***
const crypto = require("crypto"); // *** CORRECTED: Was a string "" ***
const axios = require("axios");
const { BloomFilter } = require("bloom-filters");
const { getDb, saveFilterToMongo } = require("./mongoClient");

// Global map references
let g_hospitalWalletMap;
let g_hospitalKeyMap;
let g_symmetricKeyMap;
let g_permissionFilter;

const PATIENT_BACKEND_URL = 'http://localhost:5001';

// Helper function to create hashes
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Decrypts a message with the hospital's private key.
 */
function decryptWithPrivateKey(hospitalWallet, encryptedDataBase64) {
  try {
    const publicKeys = g_hospitalWalletMap.get(hospitalWallet);
    if (!publicKeys) {
        console.error(`[Listener] decrypt: No public keys found for ${hospitalWallet}`);
        return null;
    }
    
    // Get the RSA private key
    const allPrivateKeys = g_hospitalKeyMap.get(publicKeys.rsaPublicKey);
    if (!allPrivateKeys || !allPrivateKeys.rsaPrivateKey) {
        console.error(`[Listener] decrypt: No private keys found for ${hospitalWallet}`);
        return null;
    }

    const privateKey = forge.pki.privateKeyFromPem(allPrivateKeys.rsaPrivateKey);
    const encryptedData = forge.util.decode64(encryptedDataBase64);
    
    const decryptedData = privateKey.decrypt(encryptedData, 'RSA-OAEP', {
        md: forge.md.sha256.create()
    });
    return decryptedData; // Returns plaintext bytes
  } catch (error) {
    console.error(`[Listener] Decryption failed: ${error.message}`);
    return null; // Decryption failed
  }
}

/**
 * Rebuilds the entire Bloom filter from the persistent patient list.
 */
async function rebuildBloomFilter() {
    console.log('[Listener] Rebuilding Bloom filter...');
    const db = getDb();
    
    const listDoc = await db.collection('hospital_state').findOne({ _id: 'patient_list' });
    const allPatients = listDoc ? listDoc.patients : []; // This list is already lowercase

    const newFilter = BloomFilter.create(1000, 0.01);
    for (const patient of allPatients) {
        newFilter.add(patient); // Add lowercase address
    }
    
    g_permissionFilter = newFilter;
    await saveFilterToMongo(newFilter);
    console.log(`[Listener] Bloom filter rebuilt. Total patients: ${allPatients.length}`);
}


/**
 * Starts the listener to subscribe to smart contract events.
 */
function startBlockchainListener(hospitalWalletMap, hospitalKeyMap, symmetricKeyMap, permissionFilter) {
  
  g_hospitalWalletMap = hospitalWalletMap;
  g_hospitalKeyMap = hospitalKeyMap;
  g_symmetricKeyMap = symmetricKeyMap;
  g_permissionFilter = permissionFilter;

  console.log('[Listener] Initializing...');

  try {
    const artifactPath = path.join(__dirname, '..', 'contractArtifact.json');
    if (!fs.existsSync(artifactPath)) {
        console.error('[Listener] contractArtifact.json not found. Deploy contract first.');
        return;
    }
    const { address, abi } = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    const contract = new ethers.Contract(address, abi, provider);

    console.log(`[Listener] Connecting to contract at ${address}`);

    // Subscribe to 'KeyGranted' event
    contract.on("KeyGranted", async (patient, hospital, encryptedSymKey) => {
        console.log(`[Listener] === KeyGranted Event Received ===`);
        
        // Normalize patient address to lowercase
        const patientAddress = patient.toLowerCase();
        
        if (g_hospitalWalletMap.has(hospital)) {
            console.log(`[Listener] Event is for this backend. Processing...`);
            const symmKeyBytes = decryptWithPrivateKey(hospital, encryptedSymKey);

            if (symmKeyBytes) {
                const symmKeyHex = forge.util.bytesToHex(symmKeyBytes);
                const db = getDb();
                const keyHash = sha256(patientAddress + hospital); // Use lowercase
                g_symmetricKeyMap.set(keyHash, symmKeyHex);
                await db.collection('hospital_state').updateOne(
                    { _id: 'symmetric_keys' }, { $set: { [keyHash]: symmKeyHex } }, { upsert: true }
                );
                
                // Store lowercase address in persistent list
                await db.collection('hospital_state').updateOne(
                    { _id: 'patient_list' }, { $addToSet: { patients: patientAddress } }, { upsert: true }
                );
                
                // Add lowercase address to filter
                if (!g_permissionFilter.has(patientAddress)) {
                    g_permissionFilter.add(patientAddress);
                    await saveFilterToMongo(g_permissionFilter);
                    console.log(`[Listener] Added patient ${patientAddress} to Bloom filter.`);
                }
            } else {
                console.error(`[Listener] Failed to decrypt symmetric key for ${hospital}. (Key mismatch?)`);
            }
        }
    });

    // Subscribe to 'DataCommitted' event
    contract.on("DataCommitted", async (patient, verifyIndex, encNonce) => {
        console.log(`[Listener] === DataCommitted Event Received ===`);
        
        // Normalize patient address to lowercase
        const patientAddress = patient.toLowerCase();
        
        // 1. Check permission filter
        if (g_permissionFilter.has(patientAddress)) {
            console.log(`[Listener] Data from known patient ${patientAddress}. Attempting to process...`);
            
            let decryptedNonce = null;
            let hospitalWallet = null;

            for (const wallet of g_hospitalWalletMap.keys()) {
                decryptedNonce = decryptWithPrivateKey(wallet, encNonce);
                if (decryptedNonce) {
                    hospitalWallet = wallet; 
                    break;
                }
            }

            // 2. Decrypt encNonce
            if (decryptedNonce) {
                const nonceHex = forge.util.bytesToHex(decryptedNonce);
                console.log(`[Listener] Successfully decrypted nonce for ${hospitalWallet}: ${nonceHex}`);
                
                try {
                    // 3. Off-Chain Fetch
                    const res = await axios.get(`${PATIENT_BACKEND_URL}/api/data/records-by-nonce/${nonceHex}`);
                    const records = res.data;
                    console.log(`[Listener] Fetched ${records.length} records from patient backend.`);

                    let verifiedRecords = [];
                    let aggregatedVerifyIndex = "";

                    // 4. Integrity Check
                    for (const record of records) {
                        const computedHash = sha256(record.ciphertext + record.nonce + record.timestamp);
                        if (computedHash === record.verifyIndex) {
                            console.log(`[Listener] Integrity check PASSED for verifyIndex: ${record.verifyIndex}`);
                            verifiedRecords.push(record);
                            aggregatedVerifyIndex += record.verifyIndex;
                        } else {
                            console.error(`[Listener] !!! INTEGRITY CHECK FAILED !!!`);
                        }
                    }

                    // 5. Final check
                    if (sha256(aggregatedVerifyIndex) === verifyIndex) {
                        console.log(`[Listener] Aggregated verifyIndex check PASSED.`);
                        // 6. Local Storage
                        const db = getDb();
                        await db.collection('local_ledger').insertMany(verifiedRecords);
                        console.log(`[Listener] Saved ${verifiedRecords.length} verified records to local_ledger.`);
                    } else {
                         console.error(`[Listener] !!! AGGREGATED INTEGRITY CHECK FAILED !!!`);
                    }

                } catch (error) {
                    console.error(`[Listener] Failed to fetch data from patient backend:`, error.message);
                }
            } else {
                console.log(`[Listener] Ignoring data from ${patientAddress}, not intended for this hospital.`);
            }
        } else {
             console.log(`[Listener] Ignoring data from unknown patient ${patientAddress}.`);
        }
    });

    // Subscribe to 'AccessRevoked' event
    contract.on("AccessRevoked", async (patient, hospital) => {
        console.log(`[Listener] === AccessRevoked Event Received ===`);
        
        // Normalize patient address to lowercase
        const patientAddress = patient.toLowerCase();
        
        if (g_hospitalWalletMap.has(hospital)) {
            console.log(`[Listener] Event is for this backend. Revoking...`);
            const db = getDb();
            
            const keyHash = sha256(patientAddress + hospital); // Use lowercase
            g_symmetricKeyMap.delete(keyHash);
            await db.collection('hospital_state').updateOne(
                { _id: 'symmetric_keys' }, { $unset: { [keyHash]: "" } } 
            );

            await db.collection('hospital_state').updateOne(
                { _id: 'patient_list' }, { $pull: { patients: patientAddress } } // Use lowercase
            );

            await rebuildBloomFilter();
        }
    });

    console.log('[Listener] Actively listening for contract events.');

  } catch (error) {
    console.error('[Listener] Error starting listener:', error.message);
  }
}

module.exports = { startBlockchainListener };