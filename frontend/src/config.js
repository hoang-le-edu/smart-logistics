// Blockchain network configuration
export const NETWORKS = {
  localhost: {
    chainId: "0x7a69", // 31337
    chainName: "Hardhat Local",
    rpcUrls: ["http://127.0.0.1:8545"],
    nativeCurrency: {
      name: "ETH",
      symbol: "ETH",
      decimals: 18,
    },
  },
  sepolia: {
    chainId: "0xaa36a7", // 11155111
    chainName: "Sepolia Testnet",
    rpcUrls: ["https://sepolia.infura.io/v3/"],
    nativeCurrency: {
      name: "SepoliaETH",
      symbol: "ETH",
      decimals: 18,
    },
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
  },
};

// Contract addresses - loaded from deployments folder
export const CONTRACT_ADDRESSES = {
  localhost: {
    LogiToken: "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e",
    ShipmentRegistry: "0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0",
    EscrowMilestone: "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82",
  },
  sepolia: {
    LogiToken: "", // Deploy to Sepolia to get address
    ShipmentRegistry: "",
    EscrowMilestone: "",
  },
};

// Default network (change to 'sepolia' when deploying to testnet)
export const DEFAULT_NETWORK = "localhost";

// Test accounts for development (Hardhat default accounts)
export const TEST_ACCOUNTS = {
  admin: {
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    privateKey:
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  },
  shipper: {
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    privateKey:
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  },
  carrier: {
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    privateKey:
      "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  },
  buyer: {
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    privateKey:
      "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  },
};

// Milestone names for display
export const MILESTONES = [
  "Created",
  "Picked Up",
  "In Transit",
  "Arrived at Destination",
  "Delivered",
];

// Milestone colors for UI
export const MILESTONE_COLORS = {
  0: "gray", // Created
  1: "blue", // Picked Up
  2: "yellow", // In Transit
  3: "orange", // Arrived
  4: "green", // Delivered
};

// Payment percentages for each milestone
export const PAYMENT_PERCENTAGES = {
  1: 30, // Picked Up: 30%
  2: 30, // In Transit: 30%
  3: 20, // Arrived: 20%
  4: 20, // Delivered: 20%
};
