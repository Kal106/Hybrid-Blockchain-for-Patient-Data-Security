# Secure Health Share - Installation & Run Guide

This guide provides all the steps necessary to set up and run the complete Secure Health Share project on a new machine. The system consists of 7–8 components that must all run at the same time.

## 1. Prerequisites (Install These First)

Before you begin, you must have the following software installed on your computer:

- **Node.js** (Version 18.x or higher): To run npm and the backend/frontend servers.
- **MongoDB**: The database service. You must install both the database server (`mongod`) and the command-line shell (`mongosh`).
- **MongoDB Compass (Optional)**: The GUI application for viewing the database.
- **etcd**: The service discovery key-value store.
  1. Go to the [etcd GitHub Releases page](https://github.com/etcd-io/etcd/releases).
  2. Download the binary for your operating system (e.g., `etcd-v3.5.14-linux-amd64.tar.gz`).
  3. Extract the archive and run the `etcd` file from inside the extracted folder.
- **MetaMask**: The browser extension for managing Ethereum wallets.

---

## 2. Project Installation

Follow these steps to install all project-specific dependencies.

### Step 1: Get the Project

Download or clone the `secure-health-share` project folder onto your computer and open a terminal inside it:

```bash
cd secure-health-share
```

### Step 2: Install All NPM Dependencies

You must run `npm install` in all five sub-directories. This command reads the `package.json` in each folder and automatically installs all required packages (like `ethers`, `express`, `axios`, `paillier-bigint`, `bloom-filters`, `react`, etc.).

```bash
# 1. Hardhat (Blockchain)
cd hardhat
npm install
cd ..

# 2. Patient Backend
cd patient-backend
npm install
cd ..

# 3. Hospital Backend
cd hospital-backend
npm install
cd ..

# 4. Patient Frontend
cd patient-frontend
npm install
cd ..

# 5. Hospital Frontend
cd hospital-frontend
npm install
cd ..
```

---

## 3. Running the Full Application (8 Terminals)

To run the full system, you must have **8 separate terminal windows** open. The order is important.

### Terminal 1: Start MongoDB

Start the MongoDB database service.

```bash
# On most Linux systems (if installed as a service)
sudo systemctl start mongod

# Or, if you run it manually:
mongod
```

_(Leave this running)_

---

### Terminal 2: Start etcd

Navigate to the folder where you extracted `etcd` and run the executable.

```bash
./etcd
```

_(Leave this running)_

---

### Terminal 3: Start the Blockchain Node

This starts your local Ethereum network and generates the 20 test accounts.

```bash
cd hardhat
npm run node
```

_(Leave this running. Copy two Private Keys from this output to import into MetaMask.)_

---

### Terminal 4: Deploy the Smart Contract

In a new terminal, deploy the `HealthShare.sol` contract to your local node.

```bash
cd hardhat
npm run deploy
```

_(You can close this terminal after it shows "Contract address and ABI saved...")_

---

### Terminal 5: Start the Hospital Backend

This starts the hospital server and the crucial blockchain listener.

```bash
cd hospital-backend
npm start
```

_(Leave this running. Wait for it to show "Actively listening for contract events.")_

---

### Terminal 6: Start the Patient Backend

This starts the patient server.

```bash
cd patient-backend
npm start
```

_(Leave this running. Wait for it to show "Server running on port 5001".)_

---

### Terminal 7: Start the Patient Frontend

This will automatically open `http://localhost:3000` in your browser.

```bash
cd patient-frontend
npm start
```

_(Leave this running)_

---

### Terminal 8: Start the Hospital Frontend

This will automatically open `http://localhost:3001` (or another port) in your browser.

```bash
cd hospital-frontend
npm start
```

_(Leave this running)_

---

## Summary of Setup

1. **Prerequisites**
2. **Project Installation**
   - Step 1: Get the Project
   - Step 2: Install Dependencies
3. **Running the Application**
   - MongoDB
   - etcd
   - Blockchain Node
   - Smart Contract Deployment
   - Hospital Backend
   - Patient Backend
   - Patient Frontend
   - Hospital Frontend
