const express = require('express');
const forge = require('node-forge');
const paillierBigint = require('paillier-bigint'); // ✅ Correct import
const crypto = require('crypto');

const router = express.Router();

// Helper: Create SHA-256 hash
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * ✅ Safely reconstruct a Paillier Public Key from stored hex strings.
 */
function getPaillierPublicKey(keyData) {
  if (!keyData || !keyData.n || !keyData.g) {
    throw new Error('Invalid or missing Paillier public key data.');
  }

  try {
    const n = BigInt('0x' + keyData.n);
    const g = BigInt('0x' + keyData.g);
    return new paillierBigint.PublicKey(n, g);
  } catch (err) {
    console.error('[Paillier] Error reconstructing public key:', err);
    throw new Error('Failed to reconstruct Paillier public key.');
  }
}

/**
 * POST /api/data/upload
 * Handles patient data uploads (encrypts with Paillier)
 */
router.post('/upload', async (req, res) => {
  // *** UPDATED: Changed 'bp' to 'steps' ***
  const { patientWallet, heartbeat, steps, sugarLevel } = req.body;

  // Validate input
  if (!patientWallet || heartbeat == null || steps == null || sugarLevel == null) {
    return res.status(400).json({
      message: 'Missing patientWallet or required health data (heartbeat, steps, sugarLevel).'
    });
  }

  // *** UPDATED: Convert all 3 data points to BigInt for Paillier ***
  const dataPoints = {
    heartbeat: BigInt(heartbeat),
    steps: BigInt(steps),
    sugarLevel: BigInt(sugarLevel)
  };

  const { symmetricKeyMap, db } = req;
  const permissionsCollection = db.collection('patient_permissions');
  const recordsCollection = db.collection('health_records');

  try {
    // 1️⃣ Get hospitals granted permission
    const permissionDoc = await permissionsCollection.findOne({ patientWallet });
    if (!permissionDoc?.grantedHospitals?.length) {
      return res.status(400).json({
        message: 'You have not granted permission to any hospitals.'
      });
    }

    const transactionsToSend = [];
    const dbRecords = [];

    // 2️⃣ Loop through each granted hospital
    for (const hospital of permissionDoc.grantedHospitals) {
      console.log(`[Upload] Processing data for hospital: ${hospital.wallet}`);

      // Defensive check
      if (!hospital.paillierPublicKey) {
        console.warn(`[Upload] No Paillier public key found for hospital ${hospital.wallet}. Skipping.`);
        continue;
      }

      // ✅ Get Paillier Public Key safely
      let paillierPublicKey;
      try {
        paillierPublicKey = getPaillierPublicKey(hospital.paillierPublicKey);
      } catch (err) {
        console.warn(`[Upload] Skipping hospital ${hospital.wallet}: Invalid Paillier key.`);
        continue;
      }

      // ✅ RSA Public Key (for nonce encryption)
      if (!hospital.rsaPublicKey) {
        console.warn(`[Upload] No RSA key found for ${hospital.wallet}. Skipping.`);
        continue;
      }
      const rsaPublicKey = forge.pki.publicKeyFromPem(hospital.rsaPublicKey);

      // ✅ Get symmetric key
      const keyHash = sha256(patientWallet + hospital.wallet);
      const symmKeyHex = symmetricKeyMap.get(keyHash);
      if (!symmKeyHex) {
        console.warn(`[Upload] No symmetric key found for ${hospital.wallet}. Skipping.`);
        continue;
      }

      // Random nonce
      const nonce = forge.random.getBytesSync(16);
      const nonceHex = forge.util.bytesToHex(nonce);
      let aggregatedVerifyIndex = '';

      // 3️⃣ Encrypt each data point
      // *** This loop now automatically handles all 3 data points ***
      for (const [type, value] of Object.entries(dataPoints)) {
        const timestamp = new Date().toISOString();

        // Encrypt using Paillier
        const ciphertext = paillierPublicKey.encrypt(value);
        const ciphertextHex = ciphertext.toString(16);

        // Compute trapdoor + verifyIndex
        const trapdoor = sha256(type + symmKeyHex + nonceHex + timestamp);
        const verifyIndex = sha256(ciphertextHex + nonceHex + timestamp);
        aggregatedVerifyIndex += verifyIndex;

        dbRecords.push({
          patientWallet,
          hospitalWallet: hospital.wallet,
          trapdoor,
          ciphertext: ciphertextHex,
          nonce: nonceHex,
          timestamp,
          verifyIndex
        });
      }

      // 4️⃣ Encrypt nonce with hospital RSA public key
      const encNonce = rsaPublicKey.encrypt(nonce, 'RSA-OAEP', {
        md: forge.md.sha256.create()
      });

      const finalVerifyIndex = sha256(aggregatedVerifyIndex);
      transactionsToSend.push({
        hospitalWallet: hospital.wallet,
        verifyIndex: finalVerifyIndex,
        encNonce: forge.util.encode64(encNonce)
      });
    }

    // 5️⃣ Save to DB
    if (dbRecords.length > 0) {
      await recordsCollection.insertMany(dbRecords);
      // *** UPDATED: Log will now show 3 records per hospital ***
      console.log(`[Upload] Inserted ${dbRecords.length} new health records.`);
    }

    res.status(200).json({
      message: `Data prepared for ${transactionsToSend.length} hospitals.`,
      transactions: transactionsToSend
    });

  } catch (error) {
    console.error('[Upload] Error processing data upload:', error);
    res.status(500).json({
      message: 'Server error during upload.',
      error: error.message
    });
  }
});

/**
 * GET /api/data/records-by-nonce/:nonceHex
 * (This route is unchanged)
 */
router.get('/records-by-nonce/:nonceHex', async (req, res) => {
  const { nonceHex } = req.params;
  const { db } = req;

  try {
    const records = await db.collection('health_records').find({ nonce: nonceHex }).toArray();
    if (!records || records.length === 0) {
      console.warn(`[Data] No records found for nonce: ${nonceHex}`);
      return res.status(404).json({ message: 'No records found for this nonce.' });
    }
    res.status(200).json(records);
  } catch (error) {
    console.error('[Data] Error fetching records by nonce:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;