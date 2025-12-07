const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Setting up roles and initial data...\n");

  // Load deployment addresses
  const deploymentFile = path.join(
    __dirname,
    "..",
    "deployments",
    `${hre.network.name}.json`
  );
  if (!fs.existsSync(deploymentFile)) {
    console.error("Deployment file not found. Please run deploy.js first.");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const { LogiToken, ShipmentRegistry, EscrowMilestone } = deployment.contracts;

  const signers = await hre.ethers.getSigners();
  const admin = signers[0];
  const shipperAddr =
    process.env.SHIPPER_ADDRESS ||
    (signers[1] ? signers[1].address : admin.address);
  const carrierAddr =
    process.env.CARRIER_ADDRESS ||
    (signers[2] ? signers[2].address : admin.address);
  const buyerAddr =
    process.env.BUYER_ADDRESS ||
    (signers[3] ? signers[3].address : admin.address);
  const packerAddr =
    process.env.PACKER_ADDRESS ||
    (signers[4] ? signers[4].address : admin.address);

  console.log("Using accounts:");
  console.log("Admin:     ", admin.address);
  console.log("Shipper:   ", shipperAddr);
  console.log("Carrier:   ", carrierAddr);
  console.log("Buyer:     ", buyerAddr);
  console.log("Packer:    ", packerAddr);
  console.log();

  // Get contract instances
  const logiToken = await hre.ethers.getContractAt("LogiToken", LogiToken);
  const registry = await hre.ethers.getContractAt(
    "ShipmentRegistry",
    ShipmentRegistry
  );
  const escrow = await hre.ethers.getContractAt(
    "EscrowMilestone",
    EscrowMilestone
  );

  // Grant roles in ShipmentRegistry
  console.log("Granting roles in ShipmentRegistry...");
  await registry.grantShipperRole(shipperAddr);
  console.log("✓ Granted SHIPPER_ROLE to:", shipperAddr);

  await registry.grantCarrierRole(carrierAddr);
  console.log("✓ Granted CARRIER_ROLE to:", carrierAddr);

  await registry.grantBuyerRole(buyerAddr);
  console.log("✓ Granted BUYER_ROLE to:", buyerAddr);

  await registry.grantPackerRole(packerAddr);
  console.log("✓ Granted PACKER_ROLE to:", packerAddr);

  // Mint tokens to buyer for testing
  console.log("\nMinting tokens to buyer (if MINTER_ROLE available)...");
  try {
    const buyerTokenAmount = hre.ethers.parseEther("10000");
    await logiToken.mint(buyerAddr, buyerTokenAmount);
    console.log(
      `✓ Minted ${hre.ethers.formatEther(buyerTokenAmount)} LOGI to buyer`
    );
  } catch (e) {
    console.warn("Mint to buyer skipped:", e.message);
  }

  // Mint tokens to carrier for testing
  const carrierTokenAmount = hre.ethers.parseEther("5000");
  try {
    await logiToken.mint(carrierAddr, carrierTokenAmount);
    console.log(
      `✓ Minted ${hre.ethers.formatEther(carrierTokenAmount)} LOGI to carrier`
    );
  } catch (e) {
    console.warn("Mint to carrier skipped:", e.message);
  }

  // Configure Registry integrations on current network
  console.log("\nConfiguring Registry integrations...");
  // Set admin address for payment recipient
  await registry.setAdmin(admin.address);
  console.log("✓ setAdmin:", admin.address);
  // Set LOGI token address for auto-mint
  await registry.setLogiToken(LogiToken);
  console.log("✓ setLogiToken:", LogiToken);
  // Grant MINTER_ROLE on LogiToken to ShipmentRegistry
  await logiToken.grantMinterRole(ShipmentRegistry);
  console.log("✓ grantMinterRole to ShipmentRegistry:", ShipmentRegistry);
  // Grant MINTER_ROLE to EscrowMilestone for auto-mint
  await logiToken.grantMinterRole(EscrowMilestone);
  console.log("✓ grantMinterRole to EscrowMilestone:", EscrowMilestone);
  // Set Escrow contract for pickup guard
  await registry.setEscrowContract(EscrowMilestone);
  console.log("✓ setEscrowContract:", EscrowMilestone);
  // Grant REGISTRY_ROLE to ShipmentRegistry on EscrowMilestone
  await escrow.grantRole(await escrow.REGISTRY_ROLE(), ShipmentRegistry);
  console.log("✓ grantRole REGISTRY_ROLE to ShipmentRegistry on Escrow");

  // Optional: Create a test shipment
  if (process.env.CREATE_TEST_SHIPMENT === "true") {
    console.log("\nCreating test shipment...");
    const metadataCid = "QmTestShipment123456789ABC";
    const tx = await registry
      .connect(shipper)
      .createShipment(carrier.address, buyer.address, metadataCid);
    const receipt = await tx.wait();
    console.log("✓ Test shipment created (ID: 1)");
    console.log("  Transaction:", receipt.hash);
  }

  console.log("\n" + "=".repeat(60));
  console.log("SETUP SUMMARY");
  console.log("=".repeat(60));

  // Sync addresses to frontend .env
  try {
    const frontendEnvPath = path.join(__dirname, "..", "frontend", ".env");
    const networkKey = hre.network.name.toLowerCase();
    // Build keys based on network
    const REGISTRY_KEY = `VITE_${networkKey.toUpperCase()}_REGISTRY_ADDRESS`;
    const ESCROW_KEY = `VITE_${networkKey.toUpperCase()}_ESCROW_ADDRESS`;
    const LOGI_KEY = `VITE_${networkKey.toUpperCase()}_LOGITOKEN_ADDRESS`;

    // Read existing .env if present
    let envContent = fs.existsSync(frontendEnvPath)
      ? fs.readFileSync(frontendEnvPath, "utf8")
      : "";

    const setLine = (content, key, value) => {
      const regex = new RegExp(`^${key}=.*$`, "m");
      if (regex.test(content)) {
        return content.replace(regex, `${key}=${value}`);
      }
      return content + `${key}=${value}\n`;
    };

    envContent = setLine(envContent, REGISTRY_KEY, ShipmentRegistry);
    envContent = setLine(envContent, ESCROW_KEY, EscrowMilestone);
    envContent = setLine(envContent, LOGI_KEY, LogiToken);

    fs.writeFileSync(frontendEnvPath, envContent, "utf8");
    console.log("\n✓ Frontend .env updated:");
    console.log(`  ${REGISTRY_KEY}=${ShipmentRegistry}`);
    console.log(`  ${ESCROW_KEY}=${EscrowMilestone}`);
    console.log(`  ${LOGI_KEY}=${LogiToken}`);
  } catch (e) {
    console.warn("Could not update frontend .env:", e.message);
  }
  console.log("Roles granted:");
  console.log("  SHIPPER:   ", shipperAddr);
  console.log("  CARRIER:   ", carrierAddr);
  console.log("  BUYER:     ", buyerAddr);
  console.log("  PACKER:    ", packerAddr);
  console.log("\nToken balances:");
  console.log(
    "  Buyer:   ",
    hre.ethers.formatEther(await logiToken.balanceOf(buyerAddr)),
    "LOGI"
  );
  console.log(
    "  Carrier: ",
    hre.ethers.formatEther(await logiToken.balanceOf(carrierAddr)),
    "LOGI"
  );
  console.log("=".repeat(60));

  console.log("\n✅ Setup completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
