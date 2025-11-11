const express = require('express');
const forge = require('node-forge');
const crypto = require('crypto');
const router = express.Router();

/**
 * POST /api/permissions/grant
 * Called by the patient frontend when clicking "Grant"
 * NOW STORES BOTH of the hospital's public keys
 */
router.post('/grant', async (req, res) => {
  // *** NEW: Accepting both public keys ***
  const { patientWallet, hospitalWallet, rsaPublicKey, paillierPublicKey } = req.body;

  if (!patientWallet || !hospitalWallet || !rsaPublicKey || !paillierPublicKey) {
    return res.status(400).json({ message: 'Missing required keys or wallet addresses.' });
  }

  const { symmetricKeyMap, db } = req;
  const permissionsCollection = db.collection('patient_permissions');

  try {
    // 1. Generate a new, unique symmetric key (AES-256)
    const symmKey = forge.random.getBytesSync(32); // 32 bytes = 256 bits
    const symmKeyHex = forge.util.bytesToHex(symmKey);

    // 2. Encrypt the symmetric key with the Hospital's RSA public key
    const hospitalRsaPubKey = forge.pki.publicKeyFromPem(rsaPublicKey);
    const encryptedKey = hospitalRsaPubKey.encrypt(symmKey, 'RSA-OAEP', {
        md: forge.md.sha256.create()
    });
    const encryptedKeyBase64 = forge.util.encode64(encryptedKey);

    // 3. Store the *plaintext* symmetric key in the patient's global map
    const keyHash = crypto.createHash('sha256').update(patientWallet + hospitalWallet).digest('hex');
    symmetricKeyMap.set(keyHash, symmKeyHex);

    // 4. Update the patient's permission list in MongoDB
    // *** NEW: Storing both public keys ***
    await permissionsCollection.updateOne(
      { patientWallet: patientWallet },
      { $addToSet: { 
          grantedHospitals: { 
            wallet: hospitalWallet, 
            rsaPublicKey: rsaPublicKey,
            paillierPublicKey: paillierPublicKey 
          } 
        } 
      }
    );

    console.log(`[Grant] Generated and stored key for ${patientWallet} -> ${hospitalWallet}`);

    // 5. Return the encrypted key to the frontend
    res.status(200).json({
      encryptedSymKey: encryptedKeyBase64
    });

  } catch (error) {
    console.error('[Grant] Error granting permission:', error);
    res.status(500).json({ message: 'Server error during grant.' });
  }
});

// --- /revoke and /:walletAddress routes are UNCHANGED ---
// (Code omitted for brevity)
router.post('/revoke', async (req, res) => {
    const { patientWallet, hospitalWallet } = req.body;
    if (!patientWallet || !hospitalWallet) {
        return res.status(400).json({ message: 'Missing patientWallet or hospitalWallet.' });
    }
    const { symmetricKeyMap, db } = req;
    try {
        const keyHash = crypto.createHash('sha256').update(patientWallet + hospitalWallet).digest('hex');
        symmetricKeyMap.delete(keyHash);
        const permissionsCollection = db.collection('patient_permissions');
        await permissionsCollection.updateOne(
            { patientWallet: patientWallet },
            { $pull: { grantedHospitals: { wallet: hospitalWallet } } }
        );
        console.log(`[Revoke] Removed permission for ${patientWallet} -> ${hospitalWallet}`);
        res.status(200).json({ message: 'Permission revoked successfully.' });
    } catch (error) {
        console.error('[Revoke] Error revoking permission:', error);
        res.status(500).json({ message: 'Server error during revoke.' });
    }
});
router.get('/:walletAddress', async (req, res) => {
    const { walletAddress } = req.params;
    const { db } = req;
    try {
        const doc = await db.collection('patient_permissions').findOne({ patientWallet: walletAddress });
        if (!doc) {
            return res.status(404).json({ message: 'Patient not found.' });
        }
        const grantedWallets = doc.grantedHospitals.map(h => h.wallet);
        res.status(200).json(grantedWallets);
    } catch (error) {
        console.error('[Permissions] Error fetching granted list:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});
// ---

module.exports = router;