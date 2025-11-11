const express = require('express');
const cors = require('cors');
const { BloomFilter } = require('bloom-filters');
const authRoutes = require('./routes/auth');
const computeRoutes = require('./routes/compute'); // *** NEW: Import compute routes ***
const { startBlockchainListener } = require('./services/blockchainListener');
const { connectToMongo, getDb } = require('./services/mongoClient');

const app = express();
const PORT = process.env.HOSPITAL_PORT || 5002;

// --- Global Data Structures (In-Memory) ---
const hospitalWalletMap = new Map(); // map<string, string>: Wallet Address -> Public Key
const hospitalKeyMap = new Map();    // map<string, string>: Public Key -> Private Key
const symmetricKeyMap = new Map();   // Hash(patient_wallet + hospital_wallet) -> symmetric key
let permissionFilter; // The global Bloom filter
// --- ---

async function startServer() {
  const db = await connectToMongo();
  console.log('[Hospital Backend] Connected to MongoDB.');
  
  const stateCollection = db.collection('hospital_state');
  const filterDoc = await stateCollection.findOne({ _id: 'permission_filter' });

  if (filterDoc && filterDoc.filter) {
    console.log('[Hospital Backend] Loading existing Bloom filter from MongoDB...');
    permissionFilter = BloomFilter.fromJSON(filterDoc.filter);
  } else {
    console.log('[Hospital Backend] No filter found. Creating new Bloom filter...');
    permissionFilter = BloomFilter.create(1000, 0.01); 
    await stateCollection.updateOne(
        { _id: 'permission_filter' },
        { $set: { filter: permissionFilter.saveAsJSON() } },
        { upsert: true }
    );
  }
  console.log('[Hospital Backend] Bloom filter is ready.');
  
  // *** NEW: Load symmetric keys from DB into memory on startup ***
  const keysDoc = await stateCollection.findOne({ _id: 'symmetric_keys' });
  if (keysDoc) {
      console.log('[Hospital Backend] Loading symmetric keys into memory...');
      for (const [keyHash, symmKey] of Object.entries(keysDoc)) {
          if (keyHash !== '_id') {
              symmetricKeyMap.set(keyHash, symmKey);
          }
      }
      console.log(`[Hospital Backend] Loaded ${symmetricKeyMap.size} keys.`);
  }

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Make maps and filter available to routes
  app.use((req, res, next) => {
    req.hospitalWalletMap = hospitalWalletMap;
    req.hospitalKeyMap = hospitalKeyMap;
    req.symmetricKeyMap = symmetricKeyMap;
    req.permissionFilter = permissionFilter;
    req.db = db;
    next();
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/compute', computeRoutes); // *** NEW: Add compute routes ***

  app.listen(PORT, () => {
    console.log(`[Hospital Backend] Server running on port ${PORT}`);
    startBlockchainListener(
      hospitalWalletMap,
      hospitalKeyMap,
      symmetricKeyMap,
      permissionFilter
    );
  });
}

startServer().catch(console.error);