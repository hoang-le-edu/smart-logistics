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

  const [admin, shipper, carrier, buyer] = await hre.ethers.getSigners();

  console.log("Using accounts:");
  console.log("Admin:     ", admin.address);
  console.log("Shipper:   ", shipper.address);
  console.log("Carrier:   ", carrier.address);
  console.log("Buyer:     ", buyer.address);
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
  await registry.grantShipperRole(shipper.address);
  console.log("✓ Granted SHIPPER_ROLE to:", shipper.address);

  await registry.grantCarrierRole(carrier.address);
  console.log("✓ Granted CARRIER_ROLE to:", carrier.address);

  await registry.grantBuyerRole(buyer.address);
  console.log("✓ Granted BUYER_ROLE to:", buyer.address);

  // Mint tokens to buyer for testing
  console.log("\nMinting tokens to buyer...");
  const buyerTokenAmount = hre.ethers.parseEther("10000");
  await logiToken.mint(buyer.address, buyerTokenAmount);
  console.log(
    `✓ Minted ${hre.ethers.formatEther(buyerTokenAmount)} LOGI to buyer`
  );

  // Mint tokens to carrier for testing
  const carrierTokenAmount = hre.ethers.parseEther("5000");
  await logiToken.mint(carrier.address, carrierTokenAmount);
  console.log(
    `✓ Minted ${hre.ethers.formatEther(carrierTokenAmount)} LOGI to carrier`
  );

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
  console.log("Roles granted:");
  console.log("  SHIPPER:   ", shipper.address);
  console.log("  CARRIER:   ", carrier.address);
  console.log("  BUYER:     ", buyer.address);
  console.log("\nToken balances:");
  console.log(
    "  Buyer:   ",
    hre.ethers.formatEther(await logiToken.balanceOf(buyer.address)),
    "LOGI"
  );
  console.log(
    "  Carrier: ",
    hre.ethers.formatEther(await logiToken.balanceOf(carrier.address)),
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
