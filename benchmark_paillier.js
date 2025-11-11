const paillier = require('paillier-bigint');
const fs = require('fs');
const { hrtime } = require('process');

// Load the 200 hardcoded plaintexts
const plaintexts = JSON.parse(fs.readFileSync('plaintexts.json', 'utf8'));
const plaintextsBigInt = plaintexts.map(p => BigInt(p));
const NUM_VALUES = plaintexts.length;

// Key sizes to test (powers of 2)
const KEY_SIZES = [512, 1024, 2048];

/**
 * Runs the Paillier benchmark.
 * 1. Homomorphically adds all 200 ciphertexts (via multiplication).
 * 2. Performs ONE decryption on the aggregated ciphertext.
 * 3. Calculates the average.
 */
async function runPaillierBenchmark() {
  console.log('--- Paillier Benchmark (Homomorphic Addition) ---');
  console.log(`Processing ${NUM_VALUES} records...\n`);

  const results = {};

  for (const keySize of KEY_SIZES) {
    console.log(`Running benchmark for ${keySize}-bit Paillier key...`);

    // --- SETUP (Untimed) ---
    // 1. Generate keys
    const { publicKey, privateKey } = await paillier.generateRandomKeys(keySize);
    
    // 2. Encrypt all 200 plaintexts
    const ciphertexts = plaintextsBigInt.map(p => publicKey.encrypt(p));

    // --- BENCHMARK (Timed) ---
    const startTime = hrtime.bigint();

    // 1. Aggregate all ciphertexts (this is the homomorphic addition)
    const aggregatedCiphertext = publicKey.addition(...ciphertexts);

    // 2. Perform ONE single decryption to get the sum
    const sum = privateKey.decrypt(aggregatedCiphertext);

    // 3. Calculate the average
    const average = Number(sum) / NUM_VALUES;

    const endTime = hrtime.bigint();
    // --- END BENCHMARK ---

    const timeTaken_ms = Number(endTime - startTime) / 1_000_000;
    
    console.log(`  -> Avg: ${average.toFixed(2)} | Time: ${timeTaken_ms.toFixed(4)} ms\n`);
    results[keySize] = timeTaken_ms;
  }
  
  console.log("--- Paillier Results (Key Size vs. Time in ms) ---");
  console.table(results);
}

runPaillierBenchmark().catch(console.error);