const fs = require('fs');

const NUM_VALUES = 200;
const MAX_VALUE = 200; // Max value for heartbeat/sugar/steps

const plaintexts = [];

console.log(`Generating ${NUM_VALUES} random plaintext numbers...`);

for (let i = 0; i < NUM_VALUES; i++) {
  // Generate a random integer between 1 and MAX_VALUE
  const val = Math.floor(Math.random() * MAX_VALUE) + 1;
  plaintexts.push(val);
}

fs.writeFileSync('plaintexts.json', JSON.stringify(plaintexts, null, 2));

console.log(`Successfully saved 200 plaintexts to 'plaintexts.json'.`);