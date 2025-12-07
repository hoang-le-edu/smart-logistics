// Check roles for current MetaMask account
// Usage: Open browser console on http://localhost:5173 and paste this

(async function checkMyRoles() {
  try {
    console.log("🔍 Checking roles for connected account...\n");

    // Get current account
    if (!window.ethereum) {
      console.error("❌ MetaMask not found");
      return;
    }

    const { ethers } = await import(
      "https://cdn.jsdelivr.net/npm/ethers@6.9.0/+esm"
    );
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const account = await signer.getAddress();
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    console.log("✅ Account:", account);
    console.log(
      "✅ Network:",
      chainId === 11155111
        ? "Sepolia"
        : chainId === 31337
        ? "Localhost"
        : `Chain ${chainId}`
    );
    console.log("");

    // Get contract address
    let registryAddress;
    if (chainId === 11155111) {
      // Sepolia
      registryAddress = "0x80Aa18aeDcA1f5D71bFc0b028bd73DC5db2c3d72";
    } else if (chainId === 31337) {
      // Localhost
      registryAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    } else {
      console.error("❌ Unsupported network");
      return;
    }

    console.log("📄 Registry Address:", registryAddress);
    console.log("");

    // Minimal ABI for hasRole
    const abi = [
      "function DEFAULT_ADMIN_ROLE() public view returns (bytes32)",
      "function SHIPPER_ROLE() public view returns (bytes32)",
      "function PACKER_ROLE() public view returns (bytes32)",
      "function CARRIER_ROLE() public view returns (bytes32)",
      "function BUYER_ROLE() public view returns (bytes32)",
      "function hasRole(bytes32 role, address account) public view returns (bool)",
    ];

    const registry = new ethers.Contract(registryAddress, abi, provider);

    // Check each role
    console.log("🔎 Checking roles on-chain...\n");

    const adminRole = await registry.DEFAULT_ADMIN_ROLE();
    const hasAdmin = await registry.hasRole(adminRole, account);
    console.log(`${hasAdmin ? "✅" : "❌"} ADMIN (DEFAULT_ADMIN_ROLE)`);

    const shipperRole = await registry.SHIPPER_ROLE();
    const hasShipper = await registry.hasRole(shipperRole, account);
    console.log(`${hasShipper ? "✅" : "❌"} STAFF (SHIPPER_ROLE)`);

    const packerRole = await registry.PACKER_ROLE();
    const hasPacker = await registry.hasRole(packerRole, account);
    console.log(`${hasPacker ? "✅" : "❌"} PACKER (PACKER_ROLE)`);

    const carrierRole = await registry.CARRIER_ROLE();
    const hasCarrier = await registry.hasRole(carrierRole, account);
    console.log(`${hasCarrier ? "✅" : "❌"} CARRIER (CARRIER_ROLE)`);

    const buyerRole = await registry.BUYER_ROLE();
    const hasBuyer = await registry.hasRole(buyerRole, account);
    console.log(`${hasBuyer ? "✅" : "❌"} BUYER (BUYER_ROLE)`);

    console.log("");

    // Determine frontend role (priority order)
    let frontendRole = "NONE";
    if (hasAdmin) frontendRole = "ADMIN";
    else if (hasShipper) frontendRole = "STAFF";
    else if (hasPacker) frontendRole = "PACKER";
    else if (hasCarrier) frontendRole = "CARRIER";
    else if (hasBuyer) frontendRole = "BUYER";

    console.log("🎯 Frontend will show role:", frontendRole);

    if (frontendRole === "NONE") {
      console.log("");
      console.log("⚠️  No role assigned!");
      console.log("💡 To grant role, use:");
      console.log(
        "   npx hardhat run scripts/grantCarrierRole.js --network sepolia"
      );
      console.log(
        "   npx hardhat run scripts/grantShipperRole.js --network sepolia"
      );
      console.log(
        "   npx hardhat run scripts/grantBuyerRole.js --network sepolia"
      );
      console.log("");
      console.log("   Update TARGET_ACCOUNT in .env first:");
      console.log(`   TARGET_ACCOUNT="${account}"`);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
  }
})();
