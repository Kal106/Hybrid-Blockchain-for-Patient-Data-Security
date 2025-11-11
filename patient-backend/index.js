const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const permissionRoutes = require('./routes/permissions');
const dataRoutes = require('./routes/data'); // *** NEW: Import data routes ***
const { etcdClient } = require('./services/etcdClient');
const { connectToMongo } = require('./services/mongoClient');

const app = express();
const PORT = process.env.PATIENT_PORT || 5001;

// --- Global Data Structures (In-Memory) ---
const patientWalletMap = new Map(); // map<string, string>: Wallet Address -> Public Key
const patientKeyMap = new Map();    // map<string, string>: Public Key -> Private Key
const symmetricKeyMap = new Map();  // Hash(patient_wallet + hospital_wallet) -> symmetric key
// --- ---

async function startServer() {
  // Connect to MongoDB
  const db = await connectToMongo();
  console.log('[Patient Backend] Connected to MongoDB.');

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Make maps and DB available to routes
  app.use((req, res, next) => {
    req.patientWalletMap = patientWalletMap;
    req.patientKeyMap = patientKeyMap;
    req.symmetricKeyMap = symmetricKeyMap;
    req.db = db;
    next();
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/permissions', permissionRoutes);
  app.use('/api/data', dataRoutes); // *** NEW: Add data routes ***

  // Start Server
  app.listen(PORT, () => {
    console.log(`[Patient Backend] Server running on port ${PORT}`);
    
    etcdClient.get('test_key')
      .then(() => console.log('[Patient Backend] etcd connection successful.'))
      .catch(err => console.error('[Patient Backend] Failed to connect to etcd.', err.message));
  });
}

startServer().catch(console.error);