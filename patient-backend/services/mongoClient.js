// This service manages the connection to MongoDB
const { MongoClient } = require('mongodb');

// Assumes MongoDB is running on default localhost:2017
const mongoUrl = 'mongodb://localhost:27017';
const dbName = 'patient_db';

const client = new MongoClient(mongoUrl);
let db;

async function connectToMongo() {
  if (db) {
    return db;
  }
  try {
    await client.connect();
    console.log('[Mongo] Connected to MongoDB server');
    db = client.db(dbName);

    // Create collections with indexes
    await db.collection('patient_permissions').createIndex({ patientWallet: 1 }, { unique: true });
    
    // *** NEW: Index the collection for storing health records ***
    await db.collection('health_records').createIndex({ verifyIndex: 1 }, { unique: true });
    await db.collection('health_records').createIndex({ trapdoor: 1 });

    return db;
  } catch (err) {
    console.error('[Mongo] Failed to connect to MongoDB', err);
    process.exit(1);
  }
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call connectToMongo first.');
  }
  return db;
}

module.exports = { connectToMongo, getDb };