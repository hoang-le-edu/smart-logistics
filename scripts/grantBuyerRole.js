/*
  Script: grantBuyerRole.js
  Usage:
    TARGET_ACCOUNT=0x... npx hardhat run scripts/grantBuyerRole.js --network sepolia

  Grants BUYER_ROLE to TARGET_ACCOUNT.
*/

require('dotenv').config();
const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const targetAccount = process.env.TARGET_ACCOUNT;
  if (!targetAccount) {
    console.error('TARGET_ACCOUNT not set.');
    process.exit(1);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(targetAccount)) {
    console.error('Invalid account address:', targetAccount);
    process.exit(1);
  }

  const deploymentsPath = path.join(__dirname, '..', 'deployments', 'sepolia.json');
  if (!fs.existsSync(deploymentsPath)) {
    console.error('deployments/sepolia.json not found.');
    process.exit(1);
  }
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  const registryAddress = deployments.contracts?.ShipmentRegistry;
  if (!registryAddress) {
    console.error('ShipmentRegistry address missing.');
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

  const BUYER_ROLE = await registry.BUYER_ROLE();
  const hasBefore = await registry.hasRole(BUYER_ROLE, targetAccount);
  console.log('Has BUYER_ROLE before:', hasBefore);
  if (hasBefore) {
    console.log('Account already has BUYER_ROLE');
    return;
  }

  const tx = await registry.grantBuyerRole(targetAccount);
  console.log('Granting role... tx:', tx.hash);
  await tx.wait();
  const hasAfter = await registry.hasRole(BUYER_ROLE, targetAccount);
  console.log('Has BUYER_ROLE after:', hasAfter);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
