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
  // Fixed role-to-address mapping per user request
  const staffAddr = hre.ethers.getAddress("0x5df270a6f760cb51d0fca0abf2a34fc244ad3ce3"); // staff -> STAFF_ROLE
  const carrierAddr = hre.ethers.getAddress("0xa6458d0921a4554ed4db22bf8c3e066f6313bbc3"); // carrier -> CARRIER_ROLE
  const buyerAddr = hre.ethers.getAddress("0xc92bd76edbfb971be2354c823d718ab5583e9122");   // buyer -> BUYER_ROLE
  const packerAddr = hre.ethers.getAddress("0x971f6b9f1c7a61963aab36e3f3e4ec3522786362");  // packer -> PACKER_ROLE

  console.log("Using accounts:");
  console.log("Admin:     ", admin.address);
  console.log("Staff:     ", staffAddr);
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

  // Verify admin role on Registry
  const DEFAULT_ADMIN = await registry.DEFAULT_ADMIN_ROLE();
  const isAdmin = await registry.hasRole(DEFAULT_ADMIN, admin.address);
  if (!isAdmin) {
    throw new Error(
      `Signer ${admin.address} does not have DEFAULT_ADMIN_ROLE on ShipmentRegistry ${ShipmentRegistry}`
    );
  }

  // Grant roles in ShipmentRegistry
  console.log("Granting roles in ShipmentRegistry...");
  await registry.grantStaffRole(staffAddr);
  console.log("✓ Granted STAFF_ROLE to:", staffAddr);

  await registry.grantCarrierRole(carrierAddr);
  console.log("✓ Granted CARRIER_ROLE to:", carrierAddr);

  await registry.grantBuyerRole(buyerAddr);
  console.log("✓ Granted BUYER_ROLE to:", buyerAddr);

  await registry.grantPackerRole(packerAddr);
  console.log("✓ Granted PACKER_ROLE to:", packerAddr);

  // Set display names for convenience
  await registry.setDisplayNameFor(admin.address, "Admin");
  await registry.setDisplayNameFor(staffAddr, "Staff");
  await registry.setDisplayNameFor(carrierAddr, "Carrier");
  await registry.setDisplayNameFor(buyerAddr, "Buyer");
  await registry.setDisplayNameFor(packerAddr, "Packer");

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

  // Initialize shipping fee system (origin + tiers)
  console.log("\nInitializing shipping fee system...");
  // Default: UIT (HCMC) coordinates
  const originLat = 10870493; // 10.8704929 * 1e6
  const originLon = 106802116; // 106.8021156 * 1e6
  await registry.setOriginLocation(originLat, originLon);
  console.log("✓ Origin set to:", `${originLat/1e6}°N, ${originLon/1e6}°E`);
  await registry.initializeShippingTiers();
  console.log("✓ Shipping tiers initialized");
  const tiers = await registry.getShippingTiers();
  console.log(
    "Current tiers:",
    tiers.map((t) => ({ maxDistance: t.maxDistance.toString(), fee: t.fee.toString() }))
  );

  // Optional: Create a test order (buyer)
  if (process.env.CREATE_TEST_ORDER === "true") {
    console.log("\nCreating test order...");
    const orderCid = JSON.stringify({
      productName: "Sample",
      origin: "UIT HCMC",
      destination: "Hanoi",
      quantity: 1,
      shippingFee: 300,
      createdAt: new Date().toISOString(),
    });
    const buyerSigner = await hre.ethers.getSigner(buyerAddr);
    const regWithBuyer = registry.connect(buyerSigner);
    const tx = await regWithBuyer.createOrder(orderCid);
    const receipt = await tx.wait();
    console.log("✓ Test order created. Tx:", receipt.hash);
  }

  console.log("\n" + "=".repeat(60));
  console.log("SETUP SUMMARY");
  console.log("=".repeat(60));

  // Sync addresses to frontend .env
  try {
    const frontendEnvPath = path.join(__dirname, "..", "frontend", ".env");
    // Frontend expects generic keys (per contracts.js)
    const REGISTRY_KEY = `VITE_SHIPMENT_REGISTRY_ADDRESS`;
    const ESCROW_KEY = `VITE_ESCROW_MILESTONE_ADDRESS`;
    const LOGI_KEY = `VITE_LOGI_TOKEN_ADDRESS`;

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
  console.log("  STAFF:     ", staffAddr);
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
