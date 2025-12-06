const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Configuring ShipmentRegistry + LogiToken on Sepolia...\n");

  if (hre.network.name !== "sepolia") {
    console.error(`This script is intended for sepolia, current: ${hre.network.name}`);
    process.exit(1);
  }

  const deploymentFile = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  if (!fs.existsSync(deploymentFile)) {
    console.error("Deployment file not found. Please run deploy.js first.");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const { LogiToken, ShipmentRegistry, EscrowMilestone } = deployment.contracts;

  console.log("Addresses:");
  console.log("  LogiToken        ", LogiToken);
  console.log("  ShipmentRegistry ", ShipmentRegistry);
  console.log("  EscrowMilestone  ", EscrowMilestone);

  const logiToken = await hre.ethers.getContractAt("LogiToken", LogiToken);
  const registry = await hre.ethers.getContractAt("ShipmentRegistry", ShipmentRegistry);

  console.log("\nSetting logiToken on registry...");
  await registry.setLogiToken(LogiToken);
  console.log("✓ setLogiToken done");

  console.log("Granting MINTER_ROLE on LogiToken to ShipmentRegistry...");
  await logiToken.grantMinterRole(ShipmentRegistry);
  console.log("✓ grantMinterRole done");

  console.log("Setting escrowContract on registry (pickup guard)...");
  await registry.setEscrowContract(EscrowMilestone);
  console.log("✓ setEscrowContract done");

  // Update frontend .env
  try {
    const frontendEnvPath = path.join(__dirname, "..", "frontend", ".env");
    let envContent = fs.existsSync(frontendEnvPath) ? fs.readFileSync(frontendEnvPath, "utf8") : "";
    const setLine = (content, key, value) => {
      const regex = new RegExp(`^${key}=.*$`, "m");
      if (regex.test(content)) {
        return content.replace(regex, `${key}=${value}`);
      }
      return content + `${key}=${value}\n`;
    };
    envContent = setLine(envContent, "VITE_SEPOLIA_REGISTRY_ADDRESS", ShipmentRegistry);
    envContent = setLine(envContent, "VITE_SEPOLIA_ESCROW_ADDRESS", EscrowMilestone);
    envContent = setLine(envContent, "VITE_SEPOLIA_LOGITOKEN_ADDRESS", LogiToken);
    fs.writeFileSync(frontendEnvPath, envContent, "utf8");
    console.log("\n✓ Frontend .env updated");
  } catch (e) {
    console.warn("Could not update frontend .env:", e.message);
  }

  console.log("\n✅ Config completed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
