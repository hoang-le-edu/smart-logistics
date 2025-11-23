const hre = require("hardhat");

async function main() {
  console.log("\n🔍 Fetching contract information...\n");

  // Get contract addresses
  const LogiToken = await hre.ethers.getContractAt(
    "LogiToken",
    "0x5FbDB2315678afecb367f032d93F642f64180aa3"
  );
  const ShipmentRegistry = await hre.ethers.getContractAt(
    "ShipmentRegistry",
    "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
  );
  const EscrowMilestone = await hre.ethers.getContractAt(
    "EscrowMilestone",
    "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"
  );

  const [deployer, addr1, addr2] = await hre.ethers.getSigners();

  console.log("📋 CONTRACT ADDRESSES:");
  console.log("----------------------");
  console.log(`LogiToken:        ${await LogiToken.getAddress()}`);
  console.log(`ShipmentRegistry: ${await ShipmentRegistry.getAddress()}`);
  console.log(`EscrowMilestone:  ${await EscrowMilestone.getAddress()}`);

  console.log("\n👥 TEST ACCOUNTS:");
  console.log("------------------");
  console.log(`Deployer/Admin: ${deployer.address}`);
  console.log(`Account 1:      ${addr1.address}`);
  console.log(`Account 2:      ${addr2.address}`);

  console.log("\n💰 TOKEN BALANCES:");
  console.log("-------------------");
  const balance0 = await LogiToken.balanceOf(deployer.address);
  const balance1 = await LogiToken.balanceOf(addr1.address);
  const balance2 = await LogiToken.balanceOf(addr2.address);

  console.log(`Deployer: ${hre.ethers.formatEther(balance0)} LOGI`);
  console.log(`Account 1: ${hre.ethers.formatEther(balance1)} LOGI`);
  console.log(`Account 2: ${hre.ethers.formatEther(balance2)} LOGI`);

  console.log("\n🔑 ROLES:");
  console.log("---------");

  // Check roles
  const SHIPPER_ROLE = await ShipmentRegistry.SHIPPER_ROLE();
  const CARRIER_ROLE = await ShipmentRegistry.CARRIER_ROLE();
  const BUYER_ROLE = await ShipmentRegistry.BUYER_ROLE();

  const hasShipper0 = await ShipmentRegistry.hasRole(
    SHIPPER_ROLE,
    deployer.address
  );
  const hasCarrier1 = await ShipmentRegistry.hasRole(
    CARRIER_ROLE,
    addr1.address
  );
  const hasBuyer2 = await ShipmentRegistry.hasRole(BUYER_ROLE, addr2.address);

  console.log(`${deployer.address.slice(0, 10)}... is Shipper: ${hasShipper0}`);
  console.log(`${addr1.address.slice(0, 10)}... is Carrier: ${hasCarrier1}`);
  console.log(`${addr2.address.slice(0, 10)}... is Buyer: ${hasBuyer2}`);

  console.log("\n📦 SHIPMENTS:");
  console.log("-------------");

  // Try to get shipments (might be empty if none created yet)
  try {
    const shipments0 = await ShipmentRegistry.getShipmentsByAddress(
      deployer.address
    );
    const shipments1 = await ShipmentRegistry.getShipmentsByAddress(
      addr1.address
    );
    const shipments2 = await ShipmentRegistry.getShipmentsByAddress(
      addr2.address
    );

    console.log(`Deployer has ${shipments0.length} shipment(s)`);
    console.log(`Account 1 has ${shipments1.length} shipment(s)`);
    console.log(`Account 2 has ${shipments2.length} shipment(s)`);

    // Show details of first shipment if exists
    if (shipments0.length > 0) {
      const shipment = await ShipmentRegistry.getShipment(shipments0[0]);
      console.log(`\nShipment #${shipments0[0]} Details:`);
      console.log(`  Shipper: ${shipment.shipper}`);
      console.log(`  Carrier: ${shipment.carrier}`);
      console.log(`  Buyer: ${shipment.buyer}`);
      console.log(`  Status: ${shipment.milestoneStatus}`);
      console.log(`  Metadata CID: ${shipment.metadataCid}`);
    }
  } catch (error) {
    console.log("No shipments found yet");
  }

  console.log("\n💳 ESCROW INFO:");
  console.log("---------------");
  console.log("Run this after creating shipments and opening escrow");

  console.log("\n✅ Contract information fetched successfully!");
  console.log("\n📝 NEXT STEPS:");
  console.log("1. Import these accounts into MetaMask:");
  console.log(`   - Deployer (Shipper): Account #0`);
  console.log(`   - Carrier: Account #1`);
  console.log(`   - Buyer: Account #2`);
  console.log("2. Open frontend: http://localhost:5173");
  console.log("3. Connect wallet and start testing!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
