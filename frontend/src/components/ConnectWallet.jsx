import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { ShipmentRegistryABI } from "../abis";
import { getContract } from "../utils/contracts";

export default function ConnectWallet({ onAccountChange, onChainIdChange }) {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [balance, setBalance] = useState("0");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleName, setRoleName] = useState("");

  useEffect(() => {
    checkConnection();

    let accountChangeTimeout;

    // Debounced handler to avoid multiple rapid calls
    const debouncedAccountsChanged = (accounts) => {
      if (accountChangeTimeout) {
        clearTimeout(accountChangeTimeout);
      }
      accountChangeTimeout = setTimeout(() => {
        handleAccountsChanged(accounts);
      }, 300);
    };

    if (window.ethereum) {
      window.ethereum.on("accountsChanged", debouncedAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);
    }

    return () => {
      if (accountChangeTimeout) {
        clearTimeout(accountChangeTimeout);
      }
      if (window.ethereum) {
        window.ethereum.removeListener(
          "accountsChanged",
          debouncedAccountsChanged
        );
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, []);

  const checkConnection = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.listAccounts();

        if (accounts.length > 0) {
          const signer = await provider.getSigner();
          const address = await signer.getAddress();
          const network = await provider.getNetwork();
          const bal = await provider.getBalance(address);

          setAccount(address);
          setChainId(Number(network.chainId));
          setBalance(ethers.formatEther(bal));

          // Load display name and role
          await loadIdentity(provider, address, Number(network.chainId));

          // Notify parent components
          if (onAccountChange) onAccountChange(address);
          if (onChainIdChange) onChainIdChange(Number(network.chainId));
        }
      } catch (err) {
        console.error("Error checking connection:", err);
      }
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError("Please install MetaMask to use this app");
      return;
    }

    setIsConnecting(true);
    setError("");

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);

      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      const bal = await provider.getBalance(address);

      setAccount(address);
      setChainId(Number(network.chainId));
      setBalance(ethers.formatEther(bal));

      // Load display name and role
      await loadIdentity(provider, address, Number(network.chainId));

      // Notify parent components
      if (onAccountChange) onAccountChange(address);
      if (onChainIdChange) onChainIdChange(Number(network.chainId));
    } catch (err) {
      console.error("Error connecting wallet:", err);
      setError(err.message || "Failed to connect wallet");
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setChainId(null);
    setBalance("0");
    setDisplayName("");
    setRoleName("");

    // Notify parent components
    if (onAccountChange) onAccountChange(null);
    if (onChainIdChange) onChainIdChange(null);
  };

  const handleAccountsChanged = (accounts) => {
    if (accounts.length === 0) {
      disconnectWallet();
    } else {
      checkConnection();
    }
  };

  const handleChainChanged = () => {
    window.location.reload();
  };

  const switchNetwork = async (targetChainId) => {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${targetChainId.toString(16)}` }],
      });
    } catch (err) {
      // Chain not added to MetaMask
      if (err.code === 4902) {
        if (targetChainId === 11155111) {
          await addSepoliaNetwork();
        }
      } else {
        console.error("Error switching network:", err);
        setError("Failed to switch network");
      }
    }
  };

  const addSepoliaNetwork = async () => {
    try {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0xaa36a7",
            chainName: "Sepolia Testnet",
            nativeCurrency: {
              name: "Sepolia ETH",
              symbol: "ETH",
              decimals: 18,
            },
            rpcUrls: ["https://sepolia.infura.io/v3/"],
            blockExplorerUrls: ["https://sepolia.etherscan.io/"],
          },
        ],
      });
    } catch (err) {
      console.error("Error adding network:", err);
      setError("Failed to add Sepolia network");
    }
  };

  const getNetworkName = (id) => {
    const networks = {
      1: "Ethereum Mainnet",
      11155111: "Sepolia Testnet",
      31337: "Hardhat Local",
    };
    return networks[id] || `Chain ID: ${id}`;
  };

  const formatAddress = (addr) => {
    if (!addr) return "";
    return `${addr.substring(0, 6)}...${addr.substring(38)}`;
  };

  const loadIdentity = async (provider, addr, cId) => {
    try {
      // Add delay to ensure provider is ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      const signer = await provider.getSigner();
      const registry = getContract(
        "ShipmentRegistry",
        ShipmentRegistryABI.abi,
        signer,
        cId
      );
      const name = await registry.displayName(addr);
      const isAdmin = await registry.hasRole(
        await registry.DEFAULT_ADMIN_ROLE(),
        addr
      );
      const isStaff = await registry.hasRole(
        await registry.STAFF_ROLE(),
        addr
      );
      const isPacker = await registry.hasRole(
        await registry.PACKER_ROLE(),
        addr
      );
      const isCarrier = await registry.hasRole(
        await registry.CARRIER_ROLE(),
        addr
      );
      const isBuyer = await registry.hasRole(await registry.BUYER_ROLE(), addr);
      setDisplayName(name || "");
      const r = isAdmin
        ? "Admin"
        : isStaff
        ? "Staff"
        : isPacker
        ? "Packer"
        : isCarrier
        ? "Carrier"
        : isBuyer
        ? "Buyer"
        : "";
      setRoleName(r);
    } catch (e) {
      console.warn("Load identity failed, setting defaults", e);
      // Set defaults on error instead of leaving old values
      setDisplayName("");
      setRoleName("");
    }
  };

  return (
    <div className="connect-wallet" style={{ color: "#000" }}>
      {!account ? (
        <div className="wallet-connect-section">
          <button
            onClick={connectWallet}
            disabled={isConnecting}
            className="connect-button"
            style={{ color: "#FFF" }}
          >
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </button>
          {error && (
            <p className="error-message" style={{ color: "#000" }}>
              {error}
            </p>
          )}
          {!window.ethereum && (
            <p className="warning-message" style={{ color: "#000" }}>
              Please install{" "}
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#000" }}
              >
                MetaMask
              </a>{" "}
              to use this app
            </p>
          )}
        </div>
      ) : (
        <div className="wallet-info">
          <div className="account-info">
            <div className="account-details">
              <div className="address" style={{ color: "#000" }}>
                <div>
                  <strong>Account:</strong> {formatAddress(account)}
                </div>
                {displayName && (
                  <div>
                    <strong>Name:</strong> {displayName}
                  </div>
                )}
                {roleName && (
                  <div>
                    <strong>Role:</strong> {roleName}
                  </div>
                )}
              </div>
              <div className="network" style={{ color: "#000" }}>
                <strong>Network:</strong> {getNetworkName(chainId)}
              </div>
              <div className="balance" style={{ color: "#000" }}>
                <strong>Balance:</strong> {parseFloat(balance).toFixed(4)} ETH
              </div>
            </div>
            <button
              onClick={disconnectWallet}
              className="disconnect-button"
              style={{ color: "#FFF" }}
            >
              Disconnect
            </button>
          </div>

          {chainId !== 31337 && chainId !== 11155111 && (
            <div className="network-warning" style={{ color: "#000" }}>
              <p style={{ color: "#000" }}>
                ⚠️ Please switch to Sepolia Testnet or Local Network
              </p>
              <button
                onClick={() => switchNetwork(11155111)}
                className="switch-network-button"
                style={{ color: "#000" }}
              >
                Switch to Sepolia
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
