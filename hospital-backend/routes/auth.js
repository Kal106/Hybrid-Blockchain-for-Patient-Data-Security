// routes/auth.js

const express = require('express');
const forge = require('node-forge');
const paillierBigint = require('paillier-bigint'); // ✅ Correct import
const { readRegistry, registerHospitalInJson } = require('../services/jsonRegistry');

const router = express.Router();

/**
 * POST /api/auth/onboard
 * Handles hospital login and registration.
 * Generates BOTH RSA and PAILLIER key pairs.
 */
router.post('/onboard', async (req, res) => {
  const { walletAddress, hospitalName } = req.body;

  if (!walletAddress || !hospitalName) {
    return res.status(400).json({
      message: 'Wallet address and hospital name are required.'
    });
  }

  // Ensure global maps exist
  const { hospitalWalletMap, hospitalKeyMap } = req;

  try {
    // 1️⃣ Check if hospital already onboarded
    if (hospitalWalletMap.has(walletAddress)) {
      console.log(`[Auth] Returning hospital: ${hospitalName} (${walletAddress})`);
      return res.status(200).json({
        message: 'Welcome back',
        ...hospitalWalletMap.get(walletAddress) // Return public keys
      });
    }

    // 2️⃣ Check JSON registry
    const registry = await readRegistry();
    if (registry[walletAddress]) {
      console.warn(`[Auth] Hospital ${walletAddress} found in JSON but not in memory map.`);
    }

    // 3️⃣ New Hospital: Generate Keys
    console.log(`[Auth] New hospital: ${hospitalName}. Generating keys...`);

    // --- RSA Key Pair (for signatures and nonces) ---
    const rsaKeypair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
    const rsaPublicKeyPem = forge.pki.publicKeyToPem(rsaKeypair.publicKey);
    const rsaPrivateKeyPem = forge.pki.privateKeyToPem(rsaKeypair.privateKey);

    // --- Paillier Key Pair (for encrypted data) ---
    const { publicKey, privateKey } = await paillierBigint.generateRandomKeys(2048);

    // Defensive checks
    if (!publicKey || !privateKey || !publicKey.n || !publicKey.g) {
      throw new Error('Paillier key generation failed: missing key components.');
    }

    // Store Paillier keys as HEX strings
    const paillierPublicKey = {
      n: publicKey.n.toString(16),
      g: publicKey.g.toString(16)
    };

    const paillierPrivateKey = {
      lambda: privateKey.lambda?.toString(16),
      mu: privateKey.mu?.toString(16),
      p: privateKey.p?.toString(16) || null,
      q: privateKey.q?.toString(16) || null,
      publicKey: paillierPublicKey
    };

    // 4️⃣ Store in global maps
    const publicKeys = {
      rsaPublicKey: rsaPublicKeyPem,
      paillierPublicKey
    };

    const privateKeys = {
      rsaPrivateKey: rsaPrivateKeyPem,
      paillierPrivateKey
    };

    // Map wallet → public keys
    hospitalWalletMap.set(walletAddress, publicKeys);
    // Map RSA public key → private keys
    hospitalKeyMap.set(rsaPublicKeyPem, privateKeys);

    // 5️⃣ Register hospital in JSON registry
    await registerHospitalInJson(hospitalName, walletAddress, rsaPublicKeyPem, paillierPublicKey);

    console.log(`[Auth] Successfully onboarded and registered ${hospitalName}.`);
    res.status(201).json({
      message: 'Hospital successfully registered.',
      ...publicKeys
    });

  } catch (error) {
    console.error('[Auth] Onboarding error:', error);
    res.status(500).json({
      message: 'Server error during onboarding.',
      error: error.message
    });
  }
});

/**
 * GET /api/auth/hospitals
 * Fetches list of all registered hospitals.
 */
router.get('/hospitals', async (req, res) => {
  try {
    const registry = await readRegistry();

    const hospitalList = Object.entries(registry).map(([walletAddress, data]) => ({
      walletAddress,
      name: data.name,
      rsaPublicKey: data.rsaPublicKey,
      paillierPublicKey: data.paillierPublicKey
    }));

    res.status(200).json(hospitalList);
  } catch (error) {
    console.error('[Auth] Error fetching hospital list:', error);
    res.status(500).json({
      message: 'Could not fetch hospital list.'
    });
  }
});

module.exports = router;
