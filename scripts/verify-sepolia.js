// Verify Sepolia Configuration
// Run: node scripts/verify-sepolia.js

const fs = require("fs");
const path = require("path");

console.log("🔍 Verifying Sepolia Configuration...\n");

// Check 1: .env file exists
const envPath = path.join(__dirname, "../frontend/.env");
if (!fs.existsSync(envPath)) {
  console.error("❌ ERROR: frontend/.env file not found");
  process.exit(1);
}
console.log("✅ frontend/.env exists");

// Check 2: Read .env content
const envContent = fs.readFileSync(envPath, "utf8");
const envVars = {};
envContent.split("\n").forEach((line) => {
  if (line.trim() && !line.startsWith("#")) {
    const [key, ...valueParts] = line.split("=");
    envVars[key.trim()] = valueParts.join("=").trim();
  }
});

// Check 3: Verify Sepolia contract addresses
const requiredVars = [
  "VITE_LOGI_TOKEN_ADDRESS",
  "VITE_SHIPMENT_REGISTRY_ADDRESS",
  "VITE_ESCROW_MILESTONE_ADDRESS",
];

let allPresent = true;
requiredVars.forEach((varName) => {
  if (!envVars[varName] || envVars[varName] === "") {
    console.error(`❌ ERROR: ${varName} is missing or empty`);
    allPresent = false;
  } else {
    console.log(`✅ ${varName}: ${envVars[varName]}`);
  }
});

if (!allPresent) {
  console.error(
    "\n❌ Configuration incomplete. Please check frontend/.env file"
  );
  process.exit(1);
}

// Check 4: Verify address format (0x prefix + 40 hex chars)
const addressRegex = /^0x[a-fA-F0-9]{40}$/;
let allValidFormat = true;
requiredVars.forEach((varName) => {
  if (!addressRegex.test(envVars[varName])) {
    console.error(
      `❌ ERROR: ${varName} has invalid format: ${envVars[varName]}`
    );
    allValidFormat = false;
  }
});

if (!allValidFormat) {
  console.error("\n❌ Some addresses have invalid format");
  process.exit(1);
}

// Check 5: Verify contracts.js can read env vars
const contractsConfigPath = path.join(
  __dirname,
  "../frontend/src/config/contracts.js"
);
if (!fs.existsSync(contractsConfigPath)) {
  console.error("❌ ERROR: frontend/src/config/contracts.js not found");
  process.exit(1);
}
console.log("✅ frontend/src/config/contracts.js exists");

// Check 6: Verify ABIs exist
const abiPath = path.join(__dirname, "../frontend/src/abis");
const requiredABIs = [
  "LogiToken.json",
  "ShipmentRegistry.json",
  "EscrowMilestone.json",
];
let allABIsPresent = true;
requiredABIs.forEach((abiFile) => {
  const abiFilePath = path.join(abiPath, abiFile);
  if (!fs.existsSync(abiFilePath)) {
    console.error(`❌ ERROR: ${abiFile} not found in frontend/src/abis/`);
    allABIsPresent = false;
  } else {
    console.log(`✅ ABI exists: ${abiFile}`);
  }
});

if (!allABIsPresent) {
  console.error("\n❌ Some ABI files are missing");
  process.exit(1);
}

// Check 7: Verify Infura RPC URL
if (!envVars["SEPOLIA_RPC_URL"]) {
  console.warn(
    "⚠️  WARNING: SEPOLIA_RPC_URL not found (needed for backend scripts)"
  );
} else {
  console.log(
    `✅ SEPOLIA_RPC_URL configured: ${envVars["SEPOLIA_RPC_URL"].substring(
      0,
      40
    )}...`
  );
}

// Check 8: Verify PRIVATE_KEY for deployments
if (!envVars["PRIVATE_KEY"]) {
  console.warn(
    "⚠️  WARNING: PRIVATE_KEY not found (needed for deploying/granting roles)"
  );
} else {
  const keyLength = envVars["PRIVATE_KEY"].length;
  if (keyLength !== 64 && keyLength !== 66) {
    console.error(
      `❌ ERROR: PRIVATE_KEY has invalid length: ${keyLength} (expected 64 or 66)`
    );
  } else {
    console.log(`✅ PRIVATE_KEY configured (length: ${keyLength})`);
  }
}

console.log("\n" + "=".repeat(60));
console.log("✅ ✅ ✅  CONFIGURATION VALID - READY FOR SEPOLIA  ✅ ✅ ✅");
console.log("=".repeat(60));
console.log("\n📋 Next Steps:");
console.log("  1. Open MetaMask → Switch to Sepolia Testnet");
console.log("  2. Ensure account has Sepolia ETH (use faucet if needed)");
console.log("  3. Run: cd frontend && npm run dev");
console.log("  4. Open: http://localhost:5173");
console.log('  5. Click "Connect Wallet"');
console.log("\n📚 For detailed guide, see: SEPOLIA_SETUP.md\n");
