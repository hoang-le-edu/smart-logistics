/*
  Script: grantCarrierRole.js
  Usage:
    TARGET_ACCOUNT=0x... npx hardhat run scripts/grantCarrierRole.js --network sepolia

  Reads SEPOLIA_RPC_URL, PRIVATE_KEY, TARGET_ACCOUNT from .env
  Grants CARRIER_ROLE to TARGET_ACCOUNT on deployed ShipmentRegistry.
*/

require('dotenv').config();
const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const targetAccount = process.env.TARGET_ACCOUNT;

  if (!targetAccount) {
    console.error('TARGET_ACCOUNT not set. Set env and retry.');
    process.exit(1);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(targetAccount)) {
    console.error('Invalid account address:', targetAccount);
    process.exit(1);
  }

  const deploymentsPath = path.join(__dirname, '..', 'deployments', 'sepolia.json');
  if (!fs.existsSync(deploymentsPath)) {
    console.error('deployments/sepolia.json not found. Deploy first.');
    process.exit(1);
  }
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  const registryAddress = deployments.contracts?.ShipmentRegistry;
  if (!registryAddress) {
    console.error('ShipmentRegistry address missing in deployments file.');
    process.exit(1);
  }

  const abiPath = path.join(__dirname, '..', 'frontend', 'src', 'abis', 'ShipmentRegistry.json');
  if (!fs.existsSync(abiPath)) {
    console.error('ABI file not found:', abiPath);
    process.exit(1);
  }
  const registryJson = JSON.parse(fs.readFileSync(abiPath, 'utf8'));

  const provider = new hre.ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const signer = new hre.ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const registry = new hre.ethers.Contract(registryAddress, registryJson.abi, signer);
  console.log('Admin signer:', signer.address);
  console.log('ShipmentRegistry:', registryAddress);

  const CARRIER_ROLE = await registry.CARRIER_ROLE();
  const hasBefore = await registry.hasRole(CARRIER_ROLE, targetAccount);
  console.log('Has CARRIER_ROLE before:', hasBefore);
  if (hasBefore) {
    console.log('Account already has CARRIER_ROLE');
    return;
  }

  const tx = await registry.grantCarrierRole(targetAccount);
  console.log('Granting role... tx:', tx.hash);
  await tx.wait();
  const hasAfter = await registry.hasRole(CARRIER_ROLE, targetAccount);
  console.log('Has CARRIER_ROLE after:', hasAfter);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
