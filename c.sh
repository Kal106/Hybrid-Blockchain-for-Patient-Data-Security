#!/bin/bash
#
# This script creates a zip file of the 'secure-health-share' project.
# It excludes all 'node_modules', 'build', and 'cache' folders.
# Run this from the PARENT directory (the one containing 'secure-health-share').
#

# Define the source directory and the output zip file name
SOURCE_DIR="secure-health-share"
OUTPUT_FILE="secure-health-share_$(date +%Y-%m-%d).zip"

echo "Zipping '$SOURCE_DIR' into '$OUTPUT_FILE'..."
echo "Excluding all 'node_modules', 'build', and 'cache' directories..."

zip -r "$OUTPUT_FILE" "$SOURCE_DIR" \
    -x "$SOURCE_DIR/*/node_modules/*" \
    -x "$SOURCE_DIR/*/build/*" \
    -x "$SOURCE_DIR/hardhat/artifacts/*" \
    -x "$SOURCE_DIR/hardhat/cache/*" \
    -x "$SOURCE_DIR/*/.git*" \
    -x "$SOURCE_DIR/blockchain_log.json" \
    -x "$SOURCE_DIR/hospital-backend/contractArtifact.json" \
    -x "$SOURCE_DIR/patient-frontend/src/contractArtifact.json" \
    -x "$SOURCE_DIR/hospital-frontend/src/contractArtifact.json"

echo ""
echo "Successfully created '$OUTPUT_FILE'."