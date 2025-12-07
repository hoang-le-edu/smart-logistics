const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting deployment...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log(
    "Account balance:",
    hre.ethers.formatEther(
      await hre.ethers.provider.getBalance(deployer.address)
    ),
    "ETH\n"
  );

  // Deploy LogiToken
  console.log("Deploying LogiToken...");
  const initialSupply = hre.ethers.parseEther("1000000"); // 1M tokens
  const LogiToken = await hre.ethers.getContractFactory("LogiToken");
  const logiToken = await LogiToken.deploy(initialSupply);
  await logiToken.waitForDeployment();
  const logiTokenAddress = await logiToken.getAddress();
  console.log("✓ LogiToken deployed to:", logiTokenAddress);

  // Deploy ShipmentRegistry
  console.log("\nDeploying ShipmentRegistry...");
  const ShipmentRegistry = await hre.ethers.getContractFactory(
    "ShipmentRegistry"
  );
  const shipmentRegistry = await ShipmentRegistry.deploy();
  await shipmentRegistry.waitForDeployment();
  const registryAddress = await shipmentRegistry.getAddress();
  console.log("✓ ShipmentRegistry deployed to:", registryAddress);

  // Deploy EscrowMilestone
  console.log("\nDeploying EscrowMilestone...");
  const EscrowMilestone = await hre.ethers.getContractFactory(
    "EscrowMilestone"
  );
  const escrowMilestone = await EscrowMilestone.deploy(
    logiTokenAddress,
    registryAddress
  );
  await escrowMilestone.waitForDeployment();
  const escrowAddress = await escrowMilestone.getAddress();
  console.log("✓ EscrowMilestone deployed to:", escrowAddress);

  // Save deployment addresses
  const deploymentInfo = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      LogiToken: logiTokenAddress,
      ShipmentRegistry: registryAddress,
      EscrowMilestone: escrowAddress,
    },
  };

  const deploymentDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir, { recursive: true });
  }

  const deploymentFile = path.join(deploymentDir, `${hre.network.name}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log("\n✓ Deployment info saved to:", deploymentFile);

  // Save ABIs for frontend
  const abiDir = path.join(__dirname, "..", "frontend", "src", "abis");
  if (!fs.existsSync(abiDir)) {
    fs.mkdirSync(abiDir, { recursive: true });
  }

  const logiTokenArtifact = await hre.artifacts.readArtifact("LogiToken");
  const registryArtifact = await hre.artifacts.readArtifact("ShipmentRegistry");
  const escrowArtifact = await hre.artifacts.readArtifact("EscrowMilestone");

  fs.writeFileSync(
    path.join(abiDir, "LogiToken.json"),
    JSON.stringify(
      { address: logiTokenAddress, abi: logiTokenArtifact.abi },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(abiDir, "ShipmentRegistry.json"),
    JSON.stringify(
      { address: registryAddress, abi: registryArtifact.abi },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(abiDir, "EscrowMilestone.json"),
    JSON.stringify({ address: escrowAddress, abi: escrowArtifact.abi }, null, 2)
  );

  console.log("✓ ABIs saved to:", abiDir);

  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log("Network:", hre.network.name);
  console.log("LogiToken:        ", logiTokenAddress);
  console.log("ShipmentRegistry: ", registryAddress);
  console.log("EscrowMilestone:  ", escrowAddress);
  console.log("=".repeat(60));

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\nWaiting for block confirmations...");
    await logiToken.deploymentTransaction().wait(5);
    await shipmentRegistry.deploymentTransaction().wait(5);
    await escrowMilestone.deploymentTransaction().wait(5);

    console.log("\nVerifying contracts on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: logiTokenAddress,
        constructorArguments: [initialSupply],
      });
      console.log("✓ LogiToken verified");
    } catch (error) {
      console.log("LogiToken verification failed:", error.message);
    }

    try {
      await hre.run("verify:verify", {
        address: registryAddress,
        constructorArguments: [],
      });
      console.log("✓ ShipmentRegistry verified");
    } catch (error) {
      console.log("ShipmentRegistry verification failed:", error.message);
    }

    try {
      await hre.run("verify:verify", {
        address: escrowAddress,
        constructorArguments: [logiTokenAddress],
      });
      console.log("✓ EscrowMilestone verified");
    } catch (error) {
      console.log("EscrowMilestone verification failed:", error.message);
    }
  }

  console.log("\n✅ Deployment completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
