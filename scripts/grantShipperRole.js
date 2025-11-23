/*
  Script: grantShipperRole.js
  Usage:
    TARGET_ACCOUNT=0x... npx hardhat run scripts/grantShipperRole.js --network sepolia

  Or add TARGET_ACCOUNT to your .env file.
  This script reads SEPOLIA_RPC_URL, PRIVATE_KEY, and TARGET_ACCOUNT from .env
  and calls grantShipperRole(account) on the deployed ShipmentRegistry.
*/

require('dotenv').config();
const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const targetAccount = process.env.TARGET_ACCOUNT;

  if (!targetAccount) {
    console.error(
      'Error: TARGET_ACCOUNT not set.\n' +
        'Usage: TARGET_ACCOUNT=0x... npx hardhat run scripts/grantShipperRole.js --network sepolia\n' +
        'Or add TARGET_ACCOUNT to your .env file.'
    );
    process.exit(1);
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(targetAccount)) {
    console.error('Invalid account address:', targetAccount);
    process.exit(1);
  }

  const deploymentsPath = path.join(
    __dirname,
    '..',
    'deployments',
    'sepolia.json'
  );
  if (!fs.existsSync(deploymentsPath)) {
    console.error(
      'deployments/sepolia.json not found. Make sure you deployed to Sepolia and that file exists.'
    );
    process.exit(1);
  }

  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  const registryAddress =
    deployments.contracts && deployments.contracts.ShipmentRegistry;
  if (!registryAddress) {
    console.error(
      'ShipmentRegistry address not found in deployments/sepolia.json'
    );
    process.exit(1);
  }

  // Load ABI from frontend/abis (these files are present in the repo)
  const abiPath = path.join(
    __dirname,
    '..',
    'frontend',
    'src',
    'abis',
    'ShipmentRegistry.json'
  );
  if (!fs.existsSync(abiPath)) {
    console.error('ABI file not found:', abiPath);
    process.exit(1);
  }
  const registryJson = JSON.parse(fs.readFileSync(abiPath, 'utf8'));

  // Use Hardhat's ethers v6 API (JsonRpcProvider is at hre.ethers.JsonRpcProvider)
  const provider = new hre.ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const signer = new hre.ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const registry = new hre.ethers.Contract(
    registryAddress,
    registryJson.abi,
    signer
  );

  console.log(`Connected as admin: ${signer.address}`);
  console.log(`ShipmentRegistry at: ${registryAddress}`);

  // SHIPPER_ROLE constant (same as in contract)
  const SHIPPER_ROLE = await registry.SHIPPER_ROLE();

  const hasBefore = await registry.hasRole(SHIPPER_ROLE, targetAccount);
  console.log(`Has SHIPPER_ROLE before: ${hasBefore}`);

  if (hasBefore) {
    console.log('Account already has SHIPPER_ROLE.');
    process.exit(0);
  }

  const tx = await registry.grantShipperRole(targetAccount);
  console.log('Granting role, tx hash:', tx.hash);
  await tx.wait();

  const hasAfter = await registry.hasRole(SHIPPER_ROLE, targetAccount);
  console.log(`Has SHIPPER_ROLE after: ${hasAfter}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
