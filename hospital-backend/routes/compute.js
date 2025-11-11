const express = require('express');
const forge = require('node-forge');
const paillierBigint = require('paillier-bigint');
const crypto = require('crypto');
const router = express.Router();

// Helper: SHA256 hash
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Safely reconstructs Paillier key objects from stored hex strings.
 */
function getPaillierKeys(privateKeyData) {
  if (!privateKeyData) throw new Error('Missing Paillier private key data.');
  const { publicKey, lambda, mu, p, q } = privateKeyData;
  if (!publicKey?.n || !publicKey?.g) throw new Error('Invalid Paillier public key.');

  try {
    const n = BigInt('0x' + publicKey.n);
    const g = BigInt('0x' + publicKey.g);
    const pubKey = new paillierBigint.PublicKey(n, g);

    const lambdaVal = lambda && lambda !== 'null' ? BigInt('0x' + lambda) : null;
    const muVal = mu && mu !== 'null' ? BigInt('0x' + mu) : null;
    const pVal = p && p !== 'null' ? BigInt('0x' + p) : undefined;
    const qVal = q && q !== 'null' ? BigInt('0x' + q) : undefined;

    if (!lambdaVal || !muVal) {
      console.warn('[Compute] Warning: Paillier key missing lambda or mu. Using fallback key.');
      return { privKey: new paillierBigint.PrivateKey(1n, 1n, pubKey), pubKey };
    }

    const privKey = new paillierBigint.PrivateKey(lambdaVal, muVal, pubKey, pVal, qVal);
    return { privKey, pubKey };
  } catch (err) {
    console.error('[Compute] Error reconstructing Paillier keys:', err);
    throw new Error('Failed to reconstruct Paillier keys.');
  }
}

// Helper: Compute average
function calculateAverage(sum, count) {
  if (count === 0) return 'N/A';
  try {
    return (sum / BigInt(count)).toString();
  } catch {
    return 'Error';
  }
}

/**
 * GET /api/compute/all-patient-averages
 * Performs homomorphic addition and decryption to compute averages for all patients.
 */
router.get('/all-patient-averages', async (req, res) => {
  const { db, hospitalWalletMap, hospitalKeyMap, symmetricKeyMap } = req;

  try {
    console.log('==============================================');
    console.log('[Compute] Starting computation for all patient averages...');
    console.log('==============================================');

    const patientListDoc = await db.collection('hospital_state').findOne({ _id: 'patient_list' });
    if (!patientListDoc?.patients?.length) {
      console.log('[Compute] No patients have granted permission to this hospital.');
      return res.status(200).json({ message: 'No patients with permission.' });
    }

    const allRecords = await db.collection('local_ledger').find().toArray();
    if (!allRecords.length) {
      console.log('[Compute] Found permitted patients but no synced data.');
      return res.status(200).json({ message: 'No synced data yet.' });
    }

    const patientWallets = [...new Set(allRecords.map(r => r.patientWallet))];
    console.log(`[Compute] Found ${patientWallets.length} unique patients with data.`);

    const results = [];

    for (const [hospitalWallet, hospitalPublicKeys] of hospitalWalletMap.entries()) {
      const allPrivateKeys = hospitalKeyMap.get(hospitalPublicKeys.rsaPublicKey);

      if (!allPrivateKeys?.paillierPrivateKey) {
        console.warn(`[Compute] Missing Paillier private key for ${hospitalWallet}. Skipping.`);
        continue;
      }

      let paillierPrivateKey;
      try {
        const { privKey } = getPaillierKeys(allPrivateKeys.paillierPrivateKey);
        paillierPrivateKey = privKey;
      } catch (err) {
        console.warn(`[Compute] Skipping ${hospitalWallet}: Invalid Paillier key (${err.message})`);
        continue;
      }

      for (const patientWallet of patientWallets) {
        const patientRecords = allRecords.filter(
          r => r.patientWallet === patientWallet && r.hospitalWallet === hospitalWallet
        );
        if (!patientRecords.length) continue;

        console.log('----------------------------------------------');
        console.log(`[Compute] Processing patient ${patientWallet} for hospital ${hospitalWallet}`);

        const patientWalletLower = patientWallet.toLowerCase();
        const keyHash = sha256(patientWalletLower + hospitalWallet);
        const symmKeyHex = symmetricKeyMap.get(keyHash);
        if (!symmKeyHex) {
          console.warn(`[Compute] No symmetric key found for ${patientWallet}. Skipping.`);
          continue;
        }

        const dataValues = { heartbeat: [], steps: [], sugarLevel: [] };

        // Sort records by type using trapdoor
        for (const record of patientRecords) {
          const trapdoor_hb = sha256('heartbeat' + symmKeyHex + record.nonce + record.timestamp);
          const trapdoor_st = sha256('steps' + symmKeyHex + record.nonce + record.timestamp);
          const trapdoor_sl = sha256('sugarLevel' + symmKeyHex + record.nonce + record.timestamp);

          try {
            const ciphertext = BigInt('0x' + record.ciphertext);
            if (record.trapdoor === trapdoor_hb) dataValues.heartbeat.push(ciphertext);
            else if (record.trapdoor === trapdoor_st) dataValues.steps.push(ciphertext);
            else if (record.trapdoor === trapdoor_sl) dataValues.sugarLevel.push(ciphertext);
          } catch {
            console.warn(`[Compute] Skipping malformed ciphertext: ${record.ciphertext}`);
          }
        }

        const nSquared = paillierPrivateKey.publicKey.n ** 2n;

        console.log(`[Compute] Cipher summary:`);
        console.log(`  Heartbeat: ${dataValues.heartbeat.length} ciphers`);
        console.log(`  Steps: ${dataValues.steps.length} ciphers`);
        console.log(`  SugarLevel: ${dataValues.sugarLevel.length} ciphers`);

        let hb_sum = 0n, st_sum = 0n, sl_sum = 0n;

        try {
          if (dataValues.heartbeat.length > 0) {
            const hb_cipher = dataValues.heartbeat.reduce((acc, c) => (acc * c) % nSquared, 1n);
            console.log(`[Compute] Aggregated heartbeat ciphertext (mod n²): ${hb_cipher.toString(16).slice(0, 64)}...`);
            hb_sum = paillierPrivateKey.decrypt(hb_cipher);
            console.log(`[Compute] Decrypted heartbeat sum: ${hb_sum}`);
          }

          if (dataValues.steps.length > 0) {
            const st_cipher = dataValues.steps.reduce((acc, c) => (acc * c) % nSquared, 1n);
            console.log(`[Compute] Aggregated steps ciphertext (mod n²): ${st_cipher.toString(16).slice(0, 64)}...`);
            st_sum = paillierPrivateKey.decrypt(st_cipher);
            console.log(`[Compute] Decrypted steps sum: ${st_sum}`);
          }

          if (dataValues.sugarLevel.length > 0) {
            const sl_cipher = dataValues.sugarLevel.reduce((acc, c) => (acc * c) % nSquared, 1n);
            console.log(`[Compute] Aggregated sugar ciphertext (mod n²): ${sl_cipher.toString(16).slice(0, 64)}...`);
            sl_sum = paillierPrivateKey.decrypt(sl_cipher);
            console.log(`[Compute] Decrypted sugar sum: ${sl_sum}`);
          }
        } catch (err) {
          console.error(`[Compute] Error decrypting data for ${patientWallet}: ${err.message}`);
          continue;
        }

        const averages = {
          patientWallet,
          avgHeartbeat: calculateAverage(hb_sum, dataValues.heartbeat.length),
          avgSteps: calculateAverage(st_sum, dataValues.steps.length),
          avgSugarLevel: calculateAverage(sl_sum, dataValues.sugarLevel.length)
        };

        console.log(`[Compute] Final averages for ${patientWallet}:`, averages);
        results.push(averages);
      }
    }

    console.log('==============================================');
    console.log(`[Compute] Computation completed. ${results.length} patient averages computed.`);
    console.log('==============================================');

    res.status(200).json(results);
  } catch (error) {
    console.error('[Compute] Fatal error during computation:', error);
    res.status(500).json({ message: 'Server error during computation.', error: error.message });
  }
});

module.exports = router;
