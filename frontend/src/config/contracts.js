// Contract addresses - update after deployment
export const CONTRACTS = {
  // Localhost addresses (update after running deploy script)
  localhost: {
    LogiToken: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    ShipmentRegistry: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    EscrowMilestone: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  },
  // Sepolia testnet addresses (update after deployment)
  sepolia: {
    LogiToken: import.meta.env.VITE_LOGI_TOKEN_ADDRESS || "",
    ShipmentRegistry: import.meta.env.VITE_SHIPMENT_REGISTRY_ADDRESS || "",
    EscrowMilestone: import.meta.env.VITE_ESCROW_MILESTONE_ADDRESS || "",
  },
};

// Chain IDs
export const CHAIN_IDS = {
  localhost: 31337,
  sepolia: 11155111,
};

// Get contract addresses for current network
export const getContractAddresses = (chainId) => {
  if (chainId === CHAIN_IDS.localhost) {
    return CONTRACTS.localhost;
  } else if (chainId === CHAIN_IDS.sepolia) {
    return CONTRACTS.sepolia;
  }
  return CONTRACTS.localhost; // Default to localhost
};
