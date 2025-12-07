import { ethers } from "ethers";
import { getContractAddresses } from "../config/contracts";
import { ShipmentRegistryABI, EscrowMilestoneABI, LogiTokenABI } from "../abis";

/**
 * Get ShipmentRegistry contract instance
 * @returns {Promise<ethers.Contract>}
 */
export const getShipmentRegistry = async () => {
  try {
    if (!window.ethereum) {
      throw new Error("Ethereum provider not found. Please install MetaMask.");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);

    // Add small delay to ensure provider is ready after account switch
    await new Promise((resolve) => setTimeout(resolve, 100));

    const signer = await provider.getSigner();
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    return getContract(
      "ShipmentRegistry",
      ShipmentRegistryABI.abi,
      signer,
      chainId
    );
  } catch (error) {
    console.error("Error getting ShipmentRegistry:", error);
    throw error;
  }
};

/**
 * Get EscrowMilestone contract instance
 * @returns {Promise<ethers.Contract>}
 */
export const getEscrowMilestone = async () => {
  try {
    if (!window.ethereum) {
      throw new Error("Ethereum provider not found. Please install MetaMask.");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);

    // Add small delay to ensure provider is ready after account switch
    await new Promise((resolve) => setTimeout(resolve, 100));

    const signer = await provider.getSigner();
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    return getContract(
      "EscrowMilestone",
      EscrowMilestoneABI.abi,
      signer,
      chainId
    );
  } catch (error) {
    console.error("Error getting EscrowMilestone:", error);
    throw error;
  }
};

/**
 * Get LogiToken contract instance
 * @returns {Promise<ethers.Contract>}
 */
export const getLogiToken = async () => {
  try {
    if (!window.ethereum) {
      throw new Error("Ethereum provider not found. Please install MetaMask.");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);

    // Add small delay to ensure provider is ready after account switch
    await new Promise((resolve) => setTimeout(resolve, 100));

    const signer = await provider.getSigner();
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    return getContract("LogiToken", LogiTokenABI.abi, signer, chainId);
  } catch (error) {
    console.error("Error getting LogiToken:", error);
    throw error;
  }
};

/**
 * Get contract instance
 * @param {string} contractName - Name of the contract
 * @param {object} abi - Contract ABI
 * @param {object} signerOrProvider - Ethers signer or provider
 * @param {number} chainId - Chain ID
 * @returns {ethers.Contract}
 */
export const getContract = (contractName, abi, signerOrProvider, chainId) => {
  const addresses = getContractAddresses(chainId);
  const address = addresses[contractName];

  if (!address || address === "") {
    throw new Error(
      `Contract address for ${contractName} not found for chain ${chainId}`
    );
  }

  return new ethers.Contract(address, abi, signerOrProvider);
};

/**
 * Format token amount from wei to ether
 * @param {string|BigNumber} amount - Amount in wei
 * @param {number} decimals - Number of decimal places
 * @returns {string}
 */
export const formatTokenAmount = (amount, decimals = 2) => {
  if (!amount) return "0";
  try {
    const formatted = ethers.formatEther(amount);
    return parseFloat(formatted).toFixed(decimals);
  } catch (error) {
    console.error("Error formatting amount:", error);
    return "0";
  }
};

/**
 * Parse token amount from ether to wei
 * @param {string} amount - Amount in ether
 * @returns {BigNumber}
 */
export const parseTokenAmount = (amount) => {
  try {
    return ethers.parseEther(amount.toString());
  } catch (error) {
    console.error("Error parsing amount:", error);
    throw new Error("Invalid amount");
  }
};

/**
 * Format Ethereum address (truncate middle)
 * @param {string} address - Ethereum address
 * @param {number} chars - Number of chars to show on each side
 * @returns {string}
 */
export const formatAddress = (address, chars = 4) => {
  if (!address) return "";
  return `${address.substring(0, chars + 2)}...${address.substring(
    42 - chars
  )}`;
};

/**
 * Get milestone status name
 * @param {number} status - Status code (0-6)
 * @returns {string}
 */
export const getMilestoneStatusName = (status) => {
  const statuses = [
    "CREATED",
    "PICKED_UP",
    "IN_TRANSIT",
    "ARRIVED",
    "DELIVERED",
    "CANCELED",
    "FAILED",
  ];
  return statuses[status] || "UNKNOWN";
};

/**
 * Get milestone color for UI
 * @param {number} status - Status code
 * @returns {string}
 */
export const getMilestoneColor = (status) => {
  const colors = [
    "gray", // CREATED
    "blue", // PICKED_UP
    "yellow", // IN_TRANSIT
    "orange", // ARRIVED
    "green", // DELIVERED
    "red", // CANCELED
    "red", // FAILED
  ];
  return colors[status] || "gray";
};

/**
 * Calculate payment percentage for milestone
 * @param {number} milestoneIndex - Index (0-3)
 * @returns {number}
 */
export const getMilestonePaymentPercent = (milestoneIndex) => {
  const percentages = [30, 30, 20, 20];
  return percentages[milestoneIndex] || 0;
};

/**
 * Handle transaction with loading and error states
 * @param {Function} txFunction - Transaction function
 * @param {Function} onSuccess - Success callback
 * @param {Function} onError - Error callback
 * @returns {Promise}
 */
export const handleTransaction = async (txFunction, onSuccess, onError) => {
  try {
    const tx = await txFunction();
    const receipt = await tx.wait();

    if (receipt.status === 1) {
      onSuccess && onSuccess(receipt);
      return receipt;
    } else {
      throw new Error("Transaction failed");
    }
  } catch (error) {
    console.error("Transaction error:", error);
    const errorMessage = error.reason || error.message || "Transaction failed";
    onError && onError(errorMessage);
    throw error;
  }
};

/**
 * Parse contract error message
 * @param {Error} error - Error object
 * @returns {string}
 */
export const parseContractError = (error) => {
  if (error.reason) return error.reason;
  if (error.data?.message) return error.data.message;
  if (error.message) {
    // Extract revert reason if exists
    const match = error.message.match(/reason="([^"]*)"/);
    if (match) return match[1];
    return error.message;
  }
  return "Transaction failed";
};

/**
 * Wait for transaction confirmations
 * @param {string} txHash - Transaction hash
 * @param {object} provider - Ethers provider
 * @param {number} confirmations - Number of confirmations
 * @returns {Promise}
 */
export const waitForConfirmations = async (
  txHash,
  provider,
  confirmations = 1
) => {
  const receipt = await provider.waitForTransaction(txHash, confirmations);
  return receipt;
};

/**
 * Get transaction URL on block explorer
 * @param {string} txHash - Transaction hash
 * @param {number} chainId - Chain ID
 * @returns {string}
 */
export const getExplorerTxUrl = (txHash, chainId) => {
  const explorers = {
    1: "https://etherscan.io/tx/",
    11155111: "https://sepolia.etherscan.io/tx/",
    31337: "#", // Local network
  };
  const baseUrl = explorers[chainId] || explorers[1];
  return `${baseUrl}${txHash}`;
};

/**
 * Get address URL on block explorer
 * @param {string} address - Ethereum address
 * @param {number} chainId - Chain ID
 * @returns {string}
 */
export const getExplorerAddressUrl = (address, chainId) => {
  const explorers = {
    1: "https://etherscan.io/address/",
    11155111: "https://sepolia.etherscan.io/address/",
    31337: "#",
  };
  const baseUrl = explorers[chainId] || explorers[1];
  return `${baseUrl}${address}`;
};
