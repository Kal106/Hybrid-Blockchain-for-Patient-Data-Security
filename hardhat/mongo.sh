#!/bin/bash

# This script must be run from the `hardhat/` directory.
# 1. It launches the MongoDB Compass GUI application.
# 2. It then waits for you to press Ctrl+C in this terminal.
# 3. When you press Ctrl+C, it cleans the databases and Registered.json.

# 1. Define the path to Registered.json
# (Relative to this script in the hardhat/ folder)
REGISTERED_JSON_FILE="../hospital-backend/Registered.json"

# 2. Define the cleanup function
# This function is triggered by the 'trap' command below.
cleanup() {
    echo -e "\n\n[CLEANUP] Ctrl+C detected. Cleaning project state..."
    
    # --- Drop MongoDB Databases ---
    
    echo "[CLEANUP] Dropping 'patient_db'..."
    mongosh --eval "db.getSiblingDB('patient_db').dropDatabase()"
    
    echo "[CLEANUP] Dropping 'hospital_db'..."
    mongosh --eval "db.getSiblingDB('hospital_db').dropDatabase()"
    
    # --- Clear Registered.json ---
    
    if [ -f "$REGISTERED_JSON_FILE" ]; then
        echo "[CLEANUP] Clearing '$REGISTERED_JSON_FILE'..."
        # Overwrite the file with an empty JSON object
        echo "{}" > "$REGISTERED_JSON_FILE"
    else
        echo "[CLEANUP] Warning: '$REGISTERED_JSON_FILE' not found. Skipping."
    fi
    
    echo "[CLEANUP] All project state has been reset."
    exit 0
}

# 3. Set the Trap
# This line tells bash: "When you receive a SIGINT (Ctrl+C),
# stop what you are doing and run the 'cleanup' function."
trap cleanup INT

# 4. Run the Main Program
echo "================================================================"
echo ">>> LAUNCHING MONGODB COMPASS (GUI)..."
echo ">>>"
echo ">>> This terminal is now a 'Big Red Button'."
echo ">>> Press [Ctrl+C] (here in this terminal) to wipe all databases"
echo ">>> and reset 'Registered.json'."
echo "================================================================"
echo ""

# 5. Launch MongoDB Compass in the background
# Replace 'mongodb-compass' if your command is different
mongodb-compass &

# 6. Wait indefinitely
# This keeps the script alive so the trap can catch Ctrl+C.
echo "MongoDB Compass is running. Waiting for cleanup command..."
sleep infinity