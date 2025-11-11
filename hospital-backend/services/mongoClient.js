// This service manages the connection to MongoDB
const { MongoClient } = require('mongodb');

// Assumes MongoDB is running on default localhost:2017
const mongoUrl = 'mongodb://localhost:27017';
const dbName = 'hospital_db';

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

    // This collection will store the Bloom filter and symmetric keys
    await db.collection('hospital_state').createIndex({ _id: 1 });
    
    // *** NEW: Index the collection for storing synced patient data ***
    await db.collection('local_ledger').createIndex({ verifyIndex: 1 }, { unique: true });
    await db.collection('local_ledger').createIndex({ trapdoor: 1 });


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

/**
 * Saves the state of the Bloom filter to MongoDB
 */
async function saveFilterToMongo(filter) {
    try {
        const db = getDb();
        const stateCollection = db.collection('hospital_state');
        await stateCollection.updateOne(
            { _id: 'permission_filter' },
            { $set: { filter: filter.saveAsJSON() } },
            { upsert: true }
        );
        console.log('[Mongo] Saved Bloom filter to MongoDB.');
    } catch (error) {
        console.error('[Mongo] Error saving Bloom filter:', error);
    }
}

module.exports = { connectToMongo, getDb, saveFilterToMongo };