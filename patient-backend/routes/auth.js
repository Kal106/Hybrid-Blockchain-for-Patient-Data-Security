const express = require('express');
const forge = require('node-forge');
const { registerPatientInEtcd, getPatientFromEtcd } = require('../services/etcdClient');
const router = express.Router();

/**
 * POST /api/auth/onboard
 * Handles patient login and registration.
 */
router.post('/onboard', async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress) {
    return res.status(400).json({ message: 'Wallet address is required.' });
  }

  const { patientWalletMap, patientKeyMap, db } = req;
  const permissionsCollection = db.collection('patient_permissions');

  try {
    // 1. Check if patient is already in the global map (prevents re-gen on relogin)
    if (patientWalletMap.has(walletAddress)) {
      console.log(`[Auth] Returning user: ${walletAddress}`);
      return res.status(200).json({ 
        message: 'Welcome back', 
        publicKey: patientWalletMap.get(walletAddress) 
      });
    }

    // 2. If not in map, check etcd (persistent store)
    const existingPublicKey = await getPatientFromEtcd(walletAddress);
    if (existingPublicKey) {
      console.warn(`[Auth] User ${walletAddress} found in etcd but not in memory map. Server restart likely.`);
      // In a real system, we'd fetch the private key from a secure vault.
      // For this simulation, we will re-generate keys.
    }

    // 3. New User: Generate Public/Private Key Pair
    console.log(`[Auth] New user: ${walletAddress}. Generating keys...`);
    const rsa = forge.pki.rsa;
    const keypair = rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
    
    const publicKey = forge.pki.publicKeyToPem(keypair.publicKey);
    const privateKey = forge.pki.privateKeyToPem(keypair.privateKey);

    // 4. Store in global maps
    patientWalletMap.set(walletAddress, publicKey);
    patientKeyMap.set(publicKey, privateKey);

    // 5. Register in etcd
    await registerPatientInEtcd(walletAddress, publicKey);

    // 6. Create their permission document in MongoDB
    // This doc will store the list of hospitals they grant access to.
    await permissionsCollection.insertOne({
      patientWallet: walletAddress,
      grantedHospitals: [] // Starts as an empty list
    });

    console.log(`[Auth] Successfully onboarded and registered ${walletAddress}`);
    res.status(201).json({
      message: 'User successfully registered.',
      publicKey: publicKey
    });

  } catch (error) {
    if (error.code === 11000) { // Mongo duplicate key error
      console.warn(`[Auth] User ${walletAddress} already exists in MongoDB. Skipping DB creation.`);
      return res.status(200).json({ message: 'Welcome back.', publicKey: patientWalletMap.get(walletAddress) });
    }
    console.error('[Auth] Onboarding error:', error);
    res.status(500).json({ message: 'Server error during onboarding.' });
  }
});

module.exports = router;