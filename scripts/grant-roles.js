// Grant roles and set display names quickly
// Usage:
//   npx hardhat run scripts/grant-roles.js --network sepolia
// Env required (or edit inline):
//   REGISTRY_ADDRESS=<ShipmentRegistry address>
//   ADMIN_ADDRESS=<Admin signer address with DEFAULT_ADMIN_ROLE>
//   Optionally: PRIVATE_KEY in hardhat.config.js for the admin

require('dotenv').config();

async function main() {
  const hre = require("hardhat");
  const { ethers } = hre;

  const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS || process.env.VITE_SHIPMENT_REGISTRY_ADDRESS || process.env.VITE_SEPOLIA_REGISTRY_ADDRESS;
  const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS || "0x83a651097147cf1c21592c817a559883bab3f533";

  if (!REGISTRY_ADDRESS) {
    throw new Error("Missing REGISTRY_ADDRESS env. Set REGISTRY_ADDRESS to ShipmentRegistry contract address.");
  }

  console.log(`Using Registry: ${REGISTRY_ADDRESS}`);

  // Ensure the first signer is the admin
  const [signer] = await ethers.getSigners();
  const signerAddr = await signer.getAddress();
  console.log(`Signer: ${signerAddr}`);
  if (ADMIN_ADDRESS.toLowerCase() !== signerAddr.toLowerCase()) {
    console.warn("Warning: Current signer is not the specified ADMIN_ADDRESS. Proceeding anyway.");
  }

  const registry = await ethers.getContractAt("ShipmentRegistry", REGISTRY_ADDRESS, signer);

  // Print admin role info for PACKER_ROLE to diagnose permissions
  try {
    const DEFAULT_ADMIN = await registry.DEFAULT_ADMIN_ROLE();
    const PACKER = await registry.PACKER_ROLE();
    const packerAdmin = await registry.getRoleAdmin(PACKER);
    const signerIsDefaultAdmin = await registry.hasRole(DEFAULT_ADMIN, signerAddr);
    const signerIsPackerAdmin = await registry.hasRole(packerAdmin, signerAddr);
    console.log(`Default admin role: ${DEFAULT_ADMIN}`);
    console.log(`PACKER_ROLE: ${PACKER}`);
    console.log(`Admin of PACKER_ROLE: ${packerAdmin}`);
    console.log(`Signer has DEFAULT_ADMIN_ROLE: ${signerIsDefaultAdmin}`);
    console.log(`Signer has admin of PACKER_ROLE: ${signerIsPackerAdmin}`);
  } catch (err) {
    console.warn(`Could not fetch admin info: ${err.message || err}`);
  }

  // Roles and names to grant
  const entries = [
    { role: "SHIPPER_ROLE", method: "grantShipperRole", address: "0x5dF270A6f760Cb51d0Fca0ABF2A34FC244AD3CE3", name: "Staff" },
    { role: "CARRIER_ROLE", method: "grantCarrierRole", address: "0xA6458d0921A4554Ed4dB22bf8c3E066F6313bbc3", name: "Carrier" },
    { role: "BUYER_ROLE", method: "grantBuyerRole", address: "0x5dF270A6f760Cb51d0Fca0ABF2A34FC244AD3CE3", name: "Buyer 1" },
    { role: "PACKER_ROLE", method: "grantPackerRole", address: "0x971F6B9F1c7A61963AaB36E3F3E4eC3522786362", name: "Packer" },
    { role: "BUYER_ROLE", method: "grantBuyerRole", address: "0xF4C52252ABbf13B0805cCE714832eB5FfE21E288", name: "Buyer 2" },
  ];

  // Helper to resolve role hash from contract
  async function getRoleHash(roleConstName) {
    return await registry[roleConstName]();
  }

  // Normalize addresses to EIP-55 checksummed form
  function toChecksum(addr) {
    try {
      return ethers.getAddress(addr);
    } catch (err) {
      // Try lowercasing then checksumming (handles mixed-case inputs)
      return ethers.getAddress(addr.toLowerCase());
    }
  }

  for (const e of entries) {
    const targetAddress = toChecksum(e.address);
    console.log(`\nGranting ${e.role} to ${e.address} and setting name '${e.name}'`);

    // Set display name first (admin-only)
    try {
      const txName = await registry.setDisplayNameFor(targetAddress, e.name);
      await txName.wait();
      console.log(`- Name set: ${e.name}`);
    } catch (err) {
      console.warn(`! Failed to set name '${e.name}': ${err.message || err}`);
    }

    // Grant role using the dedicated method
    const grantMethod = registry[e.method];
    if (typeof grantMethod !== 'function') {
      throw new Error(`Method ${e.method} not found on ShipmentRegistry`);
    }
    try {
      const txRole = await grantMethod(targetAddress);
      await txRole.wait();
      console.log(`- Role granted: ${e.role}`);
    } catch (err) {
      console.error(`! Failed to grant ${e.role}: ${err.message || err}`);
      // Provide additional debug: check role admin
      try {
        const roleHashDebug = await registry[e.role]();
        const roleAdmin = await registry.getRoleAdmin(roleHashDebug);
        const signerIsAdmin = await registry.hasRole(roleAdmin, signerAddr);
        console.error(`! Role admin for ${e.role}: ${roleAdmin}`);
        console.error(`! Signer has admin role: ${signerIsAdmin}`);
      } catch {}
      continue; // proceed to next entry
    }

    // Verify
    const roleHash = await registry[e.role]();
    const has = await registry.hasRole(roleHash, targetAddress);
    console.log(`- Verify hasRole: ${has}`);
  }

  console.log("\nAll roles and names applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
