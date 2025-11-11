const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Define the output file
const outputFile = path.join(__dirname, "blockchain_temp_log.json");

// This array will hold the blocks in memory
let allBlocks = [];

/**
 * This script connects to the Hardhat node, listens for new blocks,
 * and saves their full data to a temporary JSON file.
 * The file is deleted when the script is stopped.
 */
async function main() {
  console.log("Connecting to Hardhat node...");
  
  // Create an empty file to start
  fs.writeFileSync(outputFile, "[]", "utf8");
  console.log(`Created temporary log file at: ${outputFile}`);

  // Get the provider
  const provider = ethers.provider;

  console.log("Watching for new blocks... (Press Ctrl+C to stop)");

  // Set up the block listener
  provider.on("block", async (blockNumber) => {
    try {
      // 1. Fetch the full block data
      const block = await provider.getBlock(blockNumber);
      
      console.log(`[New Block Mined] Block Number: ${blockNumber}, Transactions: ${block.transactions.length}`);

      // 2. Add the block to our in-memory array
      allBlocks.push(block);

      // 3. Overwrite the JSON file with the new data
      // (Using stringify with null, 2 for pretty-printing)
      fs.writeFileSync(outputFile, JSON.stringify(allBlocks, null, 2), "utf8");

    } catch (error) {
      console.error(`Error fetching block ${blockNumber}:`, error.message);
    }
  });

  // Keep the script alive
  await new Promise(() => {});
}

/**
 * Handles the cleanup when the process is interrupted (Ctrl+C).
 */
function handleExit() {
  console.log("\nCaught interrupt signal (Ctrl+C).");
  try {
    // 4. Delete the JSON file
    if (fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
      console.log(`Deleted temporary log file: ${outputFile}`);
    }
  } catch (error) {
    console.error("Error deleting log file:", error.message);
  }
  process.exit(0);
}

// Listen for the 'SIGINT' signal (e.g., Ctrl+C)
process.on("SIGINT", handleExit);

// Start the main function
main().catch((error) => {
  console.error(error);
  process.exit(1);
});