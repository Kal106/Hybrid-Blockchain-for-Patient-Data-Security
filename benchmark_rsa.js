const forge = require('node-forge');
const fs = require('fs');
const { hrtime } = require('process');

const plaintexts = JSON.parse(fs.readFileSync('plaintexts.json', 'utf8')).map(p => p.toString());
const NUM_VALUES = plaintexts.length;
const KEY_SIZES = [512, 1024, 2048];   // or add 4096 if you want

async function runRsaBenchmark() {
  console.log('--- RSA Benchmark (Individual Decryption) ---');
  console.log(`Processing ${NUM_VALUES} records...\n`);

  const results = {};

  for (const keySize of KEY_SIZES) {
    console.log(`Running benchmark for ${keySize}-bit RSA key...`);

    // Use SHA-1 for 512-bit, SHA-256 otherwise
    const md = keySize <= 512 ? forge.md.sha1.create() : forge.md.sha256.create();

    const { publicKey, privateKey } = forge.pki.rsa.generateKeyPair({ bits: keySize, e: 0x10001 });

    const ciphertexts = plaintexts.map(p =>
      publicKey.encrypt(p, 'RSA-OAEP', { md })
    );

    const start = hrtime.bigint();
    let sum = 0;
    for (const c of ciphertexts) {
      const d = privateKey.decrypt(c, 'RSA-OAEP', { md });
      sum += parseInt(d, 10);
    }
    const average = sum / NUM_VALUES;
    const end = hrtime.bigint();
    const ms = Number(end - start) / 1_000_000;

    console.log(`  -> Avg: ${average.toFixed(2)} | Time: ${ms.toFixed(4)} ms\n`);
    results[keySize] = ms;
  }

  console.log('--- RSA Results (Key Size vs. Time in ms) ---');
  console.table(results);
}

runRsaBenchmark().catch(console.error);
