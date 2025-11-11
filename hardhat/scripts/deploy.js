// This script deploys the HealthShare.sol contract
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contract with the account:", deployer.address);

  const contractFactory = await ethers.getContractFactory("HealthShare");
  const contract = await contractFactory.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("HealthShare contract deployed to:", contractAddress);

  // --- Save Artifacts ---
  const artifacts = {
    address: contractAddress,
    abi: JSON.parse(contract.interface.formatJson()),
  };

  const artifactsDir = path.join(__dirname, "../../");
  const hospitalBackendPath = path.join(artifactsDir, "hospital-backend", "contractArtifact.json");
  const patientFrontendPath = path.join(artifactsDir, "patient-frontend", "src", "contractArtifact.json");
  const hospitalFrontendPath = path.join(artifactsDir, "hospital-frontend", "src", "contractArtifact.json");

  // Save to backends and frontends
  fs.writeFileSync(hospitalBackendPath, JSON.stringify(artifacts, null, 2));
  fs.writeFileSync(patientFrontendPath, JSON.stringify(artifacts, null, 2));
  fs.writeFileSync(hospitalFrontendPath, JSON.stringify(artifacts, null, 2));

  console.log(`Contract artifacts saved to:
    - ${hospitalBackendPath}
    - ${patientFrontendPath}
    - ${hospitalFrontendPath}
  `);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });