const { ethers } = require("hardhat");
require("dotenv").config();

/**
 * Seed Sepolia with bulk orders and shipments across different statuses.
 * Preconditions:
 * - Contracts deployed and addresses set via `scripts/setup.js`.
 * - Target wallets have correct roles from setup.
 * - LOGI balances for buyer/carrier should be 0 before running to avoid over-minting.
 */
async function main() {
  const network = hre.network.name;
  if (network !== "sepolia") {
    throw new Error("Run this script on sepolia: --network sepolia");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Seeder deployer:", deployer.address);

  // Load env addresses written by setup.js
  const registryAddr = process.env.SHIPMENT_REGISTRY_ADDRESS || process.env.VITE_SHIPMENT_REGISTRY_ADDRESS;
  const escrowAddr = process.env.ESCROW_MILESTONE_ADDRESS || process.env.VITE_ESCROW_MILESTONE_ADDRESS;
  const logiAddr = process.env.LOGI_TOKEN_ADDRESS || process.env.VITE_LOGI_TOKEN_ADDRESS;

  if (!registryAddr || !escrowAddr || !logiAddr) {
    throw new Error("Missing contract addresses in env (.env). Run setup.js first.");
  }

  const ShipmentRegistry = await ethers.getContractAt("ShipmentRegistry", registryAddr);
  const EscrowMilestone = await ethers.getContractAt("EscrowMilestone", escrowAddr);
  const LogiToken = await ethers.getContractAt("LogiToken", logiAddr);

  // Addresses (from setup.js outputs)
  const admin = process.env.ADMIN_ADDRESS;
  const staff = process.env.STAFF_ADDRESS;
  const carrier = process.env.CARRIER_ADDRESS || process.env.TARGET_CARRIER_ADDRESS;
  const buyer = process.env.BUYER_ADDRESS || process.env.TARGET_ACCOUNT;
  const packer = process.env.PACKER_ADDRESS;

  if (!admin || !staff || !carrier || !buyer || !packer) {
    console.warn("Some role addresses missing in env. Proceeding, but actions may fail.");
  }

  // Validate buyer/carrier addresses exist (balances are not enforced here)
  if (!buyer || !carrier) {
    throw new Error("Missing BUYER_ADDRESS or CARRIER_ADDRESS in .env. Set them before running seed.");
  }
  // Info-only: Log current balances for visibility, but do not block
  try {
    const buyerBal = await LogiToken.balanceOf(buyer);
    const carrierBal = await LogiToken.balanceOf(carrier);
    console.log("Current LOGI balances:", {
      buyer: ethers.formatEther(buyerBal),
      carrier: ethers.formatEther(carrierBal),
    });
  } catch (e) {
    console.warn("Could not read LOGI balances:", e.message);
  }

  // Ensure deployer has necessary roles to perform seeding on Sepolia
  // Grant roles to deployer if missing (ADMIN can grant roles)
  // Resolve role hashes without relying on constant getters that may revert
  const adminRole = await ShipmentRegistry.DEFAULT_ADMIN_ROLE();
  const staffRole = ethers.id("STAFF_ROLE"); // keccak256("STAFF_ROLE")
  const carrierRole = ethers.id("CARRIER_ROLE");
  const buyerRole = ethers.id("BUYER_ROLE");

  const isAdmin = await ShipmentRegistry.hasRole(adminRole, deployer.address);
  if (!isAdmin) {
    throw new Error("Deployer must be ADMIN to grant roles for seeding.");
  }

  const ensureRoleViaHelper = async (role, label, helperName) => {
    const has = await ShipmentRegistry.hasRole(role, deployer.address);
    if (!has) {
      if (ShipmentRegistry[helperName]) {
        console.log(`Granting ${label} role to deployer via ${helperName}()`);
        const tx = await ShipmentRegistry[helperName](deployer.address);
        await tx.wait();
        const nowHas = await ShipmentRegistry.hasRole(role, deployer.address);
        console.log(`${label} role granted?`, nowHas);
      } else {
        console.log(`Helper ${helperName} not found, falling back to grantRole()`);
        const tx = await ShipmentRegistry.grantRole(role, deployer.address);
        await tx.wait();
      }
    }
  };

  await ensureRoleViaHelper(staffRole, "STAFF", "grantStaffRole");
  await ensureRoleViaHelper(carrierRole, "CARRIER", "grantCarrierRole");
  await ensureRoleViaHelper(buyerRole, "BUYER", "grantBuyerRole");

  console.log("Creating orders (some without shipments)...");
  const orders = [];
  for (let i = 0; i < 3; i++) {
    const orderCid = await fakeCid(`order-${Date.now()}-${i}`);
    const tx = await ShipmentRegistry.createOrder(orderCid);
    const rc = await tx.wait();
    const ev = rc.logs
      .map((l) => {
        try { return ShipmentRegistry.interface.decodeEventLog("OrderCreated", l.data, l.topics); } catch { return null; }
      })
      .filter(Boolean)[0];
    const orderId = ev?.orderId?.toString() || `${Date.now()}-${i}`;
    orders.push({ orderId, cid: orderCid });
    console.log(`Order ${orderId} created (no shipment yet)`);
  }

  console.log("Creating shipments across statuses...");
  // Helper to create a shipment and progress status
  async function createShipment(metaLabel, buyerAddr) {
    const metadata = await fakeCid(metaLabel);
    // Determine fee > 0 to auto-open escrow
    const originTier = await ShipmentRegistry.getDefaultOriginTier();
    const feeInfo = await ShipmentRegistry.getShippingFee(originTier, buyerAddr);
    const shippingFee = feeInfo[0];
    // Create shipment as deployer after being granted STAFF_ROLE
    const tx = await ShipmentRegistry.createShipment(
      buyerAddr,
      metadata,
      shippingFee
    );
    const rc = await tx.wait();
    const ev = rc.logs
      .map((l) => { try { return ShipmentRegistry.interface.decodeEventLog("ShipmentCreated", l.data, l.topics); } catch { return null; } })
      .filter(Boolean)[0];
    const shipmentId = ev?.shipmentId?.toString();
    console.log(`Shipment ${shipmentId} created with fee`, ethers.formatEther(shippingFee));
    return shipmentId;
  }

  // Create shipments for each status
  const sCreated = await createShipment("meta-created", buyer);
  // PICKED_UP (1): by Staff
  await (await ShipmentRegistry.updateMilestone(sCreated, 1)).wait();
  console.log(`Shipment ${sCreated} -> PICKED_UP`);

  const sInTransit = await createShipment("meta-intransit", buyer);
  // PICKED_UP then IN_TRANSIT (2): carrier self-assign allowed at IN_TRANSIT
  await (await ShipmentRegistry.updateMilestone(sInTransit, 1)).wait();
  await (await ShipmentRegistry.updateMilestone(sInTransit, 2)).wait();
  console.log(`Shipment ${sInTransit} -> IN_TRANSIT`);

  const sArrived = await createShipment("meta-arrived", buyer);
  await (await ShipmentRegistry.updateMilestone(sArrived, 1)).wait();
  await (await ShipmentRegistry.updateMilestone(sArrived, 2)).wait();
  await (await ShipmentRegistry.updateMilestone(sArrived, 3)).wait();
  console.log(`Shipment ${sArrived} -> ARRIVED`);

  const sFailed = await createShipment("meta-failed", buyer);
  await (await ShipmentRegistry.updateMilestone(sFailed, 1)).wait();
  // Simulate failure by setting metadata and not progressing further; if contract has explicit FAILED status, replace with 5.
  console.log(`Shipment ${sFailed} marked as problem scenario (no further progression)`);

  // Fund LOGI for buyer/carrier minimally if needed after escrow auto-open (kept zero per requirement, skip mint)
  console.log("Seed complete. Review on frontend Dashboard.");
}

async function fakeCid(label) {
  // Simple deterministic CID-like string for testing (not real IPFS)
  return `fakecid://${label}`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
