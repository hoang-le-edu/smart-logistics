const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(
    'Initializing shipping fee system with account:',
    deployer.address
  );

  // Read deployed contract address from deployment file
  const deploymentFile = path.join(
    __dirname,
    '..',
    'deployments',
    `${hre.network.name}.json`
  );

  if (!fs.existsSync(deploymentFile)) {
    throw new Error('Deployment file not found. Please run deploy.js first.');
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
  const registryAddress = deployment.contracts.ShipmentRegistry;

  if (!registryAddress) {
    throw new Error('ShipmentRegistry address not found in deployment file');
  }

  console.log('ShipmentRegistry address:', registryAddress);

  // Get contract instance
  const registry = await hre.ethers.getContractAt(
    'ShipmentRegistry',
    registryAddress
  );

  console.log('\n=== Setting Origin Location ===');
  // Set origin location (example: Ho Chi Minh City coordinates)
  // UIT LOCATION: 10.870492954229887, 106.80211562883524
  // Latitude: 10.8231° N = 10823100 (multiply by 1e6)
  // Longitude: 106.6297° E = 106629700 (multiply by 1e6)
  const originLat = 10870493; // 10.870492954229887° N (UIT)
  const originLon = 106802116; // 106.80211562883524° E (UIT)

  console.log(
    `Setting origin to: ${originLat / 1e6}°N, ${originLon / 1e6}°E (UIT)`
  );

  const tx1 = await registry.setOriginLocation(originLat, originLon);
  await tx1.wait();
  console.log('✅ Origin location set successfully');

  console.log('\n=== Initializing Shipping Tiers ===');
  console.log('Tier structure:');
  console.log('  < 2 km: 0 LOGI (Free)');
  console.log('  2-10 km: 10 LOGI');
  console.log('  10-100 km: 50 LOGI');
  console.log('  100-500 km: 150 LOGI');
  console.log('  >= 500 km: 300 LOGI');

  const tx2 = await registry.initializeShippingTiers();
  await tx2.wait();
  console.log('✅ Shipping tiers initialized successfully');

  console.log('\n=== Verifying Configuration ===');
  const storedOriginLat = await registry.originLatitude();
  const storedOriginLon = await registry.originLongitude();
  console.log(
    `Stored origin: ${Number(storedOriginLat) / 1e6}°N, ${
      Number(storedOriginLon) / 1e6
    }°E`
  );

  const tiers = await registry.getShippingTiers();
  console.log('\nShipping tiers:');
  tiers.forEach((tier, index) => {
    console.log(
      `  Tier ${index}: Max distance ${tier.maxDistance.toString()} km, Fee ${tier.fee.toString()} LOGI`
    );
  });

  console.log('\n=== Testing Shipping Fee Calculation ===');
  // Test with Hanoi coordinates (approx 1670 km from UIT)
  // Latitude: 21.0285° N = 21028500
  // Longitude: 105.8542° E = 105854200
  const hanoiLat = 21028500;
  const hanoiLon = 105854200;

  const result = await registry.getShippingFee(hanoiLat, hanoiLon);
  console.log(`\nTest: UIT -> Hanoi`);
  console.log(`  Distance: ${result.distance.toString()} km`);
  console.log(`  Fee: ${result.fee.toString()} LOGI`);

  console.log('\n✅ Shipping fee system initialized successfully!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
