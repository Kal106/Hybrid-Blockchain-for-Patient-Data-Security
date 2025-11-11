// This service manages the connection to the etcd registry
const { Etcd3 } = require('etcd3');

// Assumes etcd is running on default localhost:2379
const etcdClient = new Etcd3();

/**
 * Registers a patient's wallet address and public key in etcd
 */
async function registerPatientInEtcd(walletAddress, publicKey) {
  try {
    // We use a key-value format: patient:walletAddress -> publicKey
    await etcdClient.put(`patient:${walletAddress}`).value(publicKey);
    console.log(`[ETCD] Registered patient: ${walletAddress}`);
  } catch (error) {
    console.error(`[ETCD] Failed to register patient ${walletAddress}:`, error);
  }
}

/**
 * Fetches a patient's public key from etcd
 */
async function getPatientFromEtcd(walletAddress) {
  try {
    const publicKey = await etcdClient.get(`patient:${walletAddress}`).string();
    return publicKey;
  } catch (error) {
    console.error(`[ETCD] Failed to get patient ${walletAddress}:`, error);
    return null;
  }
}

module.exports = { registerPatientInEtcd, getPatientFromEtcd, etcdClient };