import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { ShipmentRegistryABI, EscrowMilestoneABI, LogiTokenABI } from "../abis";
import {
  getContract,
  handleTransaction,
  parseContractError,
  getMilestoneStatusName,
  formatTokenAmount,
} from "../utils/contracts";

export default function BuyerPanel({ account, chainId }) {
  const [shipments, setShipments] = useState([]);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [escrowDetails, setEscrowDetails] = useState(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [tokenBalance, setTokenBalance] = useState("0");
  const [loading, setLoading] = useState(false);
  const [loadingShipments, setLoadingShipments] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");

  useEffect(() => {
    if (account) {
      loadBuyerData();
    }
  }, [account, chainId]);

  const loadBuyerData = async () => {
    if (!account) return;

    setLoadingShipments(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const registry = getContract(
        "ShipmentRegistry",
        ShipmentRegistryABI.abi,
        provider,
        chainId
      );
      const token = getContract(
        "LogiToken",
        LogiTokenABI.abi,
        provider,
        chainId
      );

      // Load token balance
      const balance = await token.balanceOf(account);
      setTokenBalance(ethers.formatEther(balance));

      // Load shipments where account is buyer
      const shipmentIds = await registry.getShipmentsByAddress(account);

      const shipmentsData = await Promise.all(
        shipmentIds.map(async (id) => {
          const shipment = await registry.getShipment(id);

          if (shipment.buyer.toLowerCase() === account.toLowerCase()) {
            return {
              id: id.toString(),
              shipper: shipment.shipper,
              carrier: shipment.carrier,
              buyer: shipment.buyer,
              warehouse: shipment.warehouse,
              milestoneStatus: Number(shipment.milestoneStatus),
              metadataCid: shipment.metadataCid,
              timestamp: Number(shipment.timestamp),
            };
          }
          return null;
        })
      );

      setShipments(shipmentsData.filter((s) => s !== null));
    } catch (err) {
      console.error("Error loading buyer data:", err);
      setError(parseContractError(err));
    } finally {
      setLoadingShipments(false);
    }
  };

  const loadEscrowDetails = async (shipmentId) => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const escrow = getContract(
        "EscrowMilestone",
        EscrowMilestoneABI.abi,
        provider,
        chainId
      );

      const details = await escrow.getEscrowDetails(shipmentId);

      setEscrowDetails({
        totalAmount: ethers.formatEther(details.totalAmount),
        releasedAmount: ethers.formatEther(details.releasedAmount),
        deadline: Number(details.deadline),
        isActive: details.isActive,
        isCompleted: details.isCompleted,
      });
    } catch (err) {
      console.log("No escrow found for this shipment");
      setEscrowDetails(null);
    }
  };

  const selectShipment = async (shipment) => {
    setSelectedShipment(shipment);
    setError("");
    setSuccess("");
    await loadEscrowDetails(shipment.id);
  };

  const openEscrow = async (e) => {
    e.preventDefault();

    if (!account || !selectedShipment || !depositAmount) {
      setError("Please provide all required information");
      return;
    }

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Invalid deposit amount");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setTxHash("");

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const escrow = getContract(
        "EscrowMilestone",
        EscrowMilestoneABI.abi,
        signer,
        chainId
      );
      const token = getContract("LogiToken", LogiTokenABI.abi, signer, chainId);

      const amountWei = ethers.parseEther(depositAmount);

      // Step 1: Check token balance
      const balance = await token.balanceOf(account);
      if (balance < amountWei) {
        setError(
          `Insufficient token balance. You have ${formatTokenAmount(
            balance
          )} LOGI`
        );
        setLoading(false);
        return;
      }

      // Step 2: Approve tokens for escrow contract
      const escrowAddress = await escrow.getAddress();
      const currentAllowance = await token.allowance(account, escrowAddress);

      if (currentAllowance < amountWei) {
        const approveReceipt = await handleTransaction(
          () => token.approve(escrowAddress, amountWei),
          () => {
            console.log("Tokens approved for escrow");
          },
          (err) => {
            throw new Error(`Approval failed: ${err}`);
          }
        );
        console.log("Approval transaction:", approveReceipt);
      }

      // Step 3: Open escrow (30 days deadline)
      const deadline = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

      const receipt = await handleTransaction(
        () => escrow.openEscrow(selectedShipment.id, amountWei, deadline),
        async (receipt) => {
          setSuccess(`Escrow opened with ${depositAmount} LOGI tokens!`);
          setTxHash(receipt.hash);
          setDepositAmount("");

          // Reload data
          await loadBuyerData();
          await loadEscrowDetails(selectedShipment.id);
        },
        (errorMsg) => {
          setError(parseContractError({ message: errorMsg }));
        }
      );

      console.log("Transaction receipt:", receipt);
    } catch (err) {
      console.error("Error opening escrow:", err);
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  };

  const depositToEscrow = async () => {
    if (!selectedShipment || !depositAmount) {
      setError("Please provide deposit amount");
      return;
    }

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Invalid deposit amount");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setTxHash("");

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const escrow = getContract(
        "EscrowMilestone",
        EscrowMilestoneABI.abi,
        signer,
        chainId
      );
      const token = getContract("LogiToken", LogiTokenABI.abi, signer, chainId);

      const amountWei = ethers.parseEther(depositAmount);

      // Approve and deposit
      const escrowAddress = await escrow.getAddress();
      await handleTransaction(
        () => token.approve(escrowAddress, amountWei),
        () => console.log("Approved"),
        (err) => {
          throw new Error(err);
        }
      );

      const receipt = await handleTransaction(
        () => escrow.deposit(selectedShipment.id, amountWei),
        async (receipt) => {
          setSuccess(`Deposited ${depositAmount} LOGI to escrow!`);
          setTxHash(receipt.hash);
          setDepositAmount("");
          await loadBuyerData();
          await loadEscrowDetails(selectedShipment.id);
        },
        (errorMsg) => {
          setError(parseContractError({ message: errorMsg }));
        }
      );

      console.log("Deposit receipt:", receipt);
    } catch (err) {
      console.error("Error depositing:", err);
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  };

  const confirmDelivery = async () => {
    if (!selectedShipment) return;

    setLoading(true);
    setError("");
    setSuccess("");
    setTxHash("");

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const escrow = getContract(
        "EscrowMilestone",
        EscrowMilestoneABI.abi,
        signer,
        chainId
      );

      const receipt = await handleTransaction(
        () => escrow.release(selectedShipment.id, 4), // Milestone 4 = DELIVERED
        async (receipt) => {
          setSuccess("Delivery confirmed! Payment released to carrier.");
          setTxHash(receipt.hash);
          await loadBuyerData();
          await loadEscrowDetails(selectedShipment.id);
        },
        (errorMsg) => {
          setError(parseContractError({ message: errorMsg }));
        }
      );

      console.log("Release receipt:", receipt);
    } catch (err) {
      console.error("Error confirming delivery:", err);
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  };

  if (!account) {
    return (
      <div className="buyer-panel">
        <div className="empty-state">
          <p>Please connect your wallet to manage escrow</p>
        </div>
      </div>
    );
  }

  return (
    <div className="buyer-panel">
      <div className="panel-header">
        <h2>Manage Escrow</h2>
        <p className="subtitle">
          As Buyer, you can manage escrow payments for your shipments
        </p>
        <div className="token-balance">
          <strong>Your Balance:</strong> {parseFloat(tokenBalance).toFixed(2)}{" "}
          LOGI
        </div>
      </div>

      <div className="panel-content">
        <div className="shipments-list">
          <h3>Your Shipments ({shipments.length})</h3>

          {loadingShipments ? (
            <p>Loading shipments...</p>
          ) : shipments.length === 0 ? (
            <div className="empty-state">
              <p>No shipments found where you are the buyer</p>
            </div>
          ) : (
            <div className="shipments-grid">
              {shipments.map((shipment) => (
                <div
                  key={shipment.id}
                  className={`shipment-card ${
                    selectedShipment?.id === shipment.id ? "selected" : ""
                  }`}
                  onClick={() => selectShipment(shipment)}
                >
                  <div className="card-header">
                    <h4>Shipment #{shipment.id}</h4>
                    <span
                      className={`status-badge status-${shipment.milestoneStatus}`}
                    >
                      {getMilestoneStatusName(shipment.milestoneStatus)}
                    </span>
                  </div>
                  <div className="card-body">
                    <p>
                      <strong>Shipper:</strong> {shipment.shipper.slice(0, 10)}
                      ...
                    </p>
                    <p>
                      <strong>Carrier:</strong> {shipment.carrier.slice(0, 10)}
                      ...
                    </p>
                    <p>
                      <strong>Created:</strong>{" "}
                      {new Date(shipment.timestamp * 1000).toLocaleDateString()}
                    </p>
                    {shipment.metadataCid && (
                      <a
                        href={`https://gateway.pinata.cloud/ipfs/${shipment.metadataCid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="metadata-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View Metadata
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedShipment && (
          <div className="escrow-management">
            <h3>Escrow for Shipment #{selectedShipment.id}</h3>

            {escrowDetails ? (
              <div className="escrow-info">
                <div className="info-grid">
                  <div className="info-item">
                    <label>Total Amount:</label>
                    <span>
                      {parseFloat(escrowDetails.totalAmount).toFixed(2)} LOGI
                    </span>
                  </div>
                  <div className="info-item">
                    <label>Released:</label>
                    <span>
                      {parseFloat(escrowDetails.releasedAmount).toFixed(2)} LOGI
                    </span>
                  </div>
                  <div className="info-item">
                    <label>Deadline:</label>
                    <span>
                      {new Date(
                        escrowDetails.deadline * 1000
                      ).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="info-item">
                    <label>Status:</label>
                    <span
                      className={
                        escrowDetails.isCompleted
                          ? "text-success"
                          : "text-primary"
                      }
                    >
                      {escrowDetails.isCompleted
                        ? "Completed"
                        : escrowDetails.isActive
                        ? "Active"
                        : "Inactive"}
                    </span>
                  </div>
                </div>

                <div className="escrow-actions">
                  <div className="form-group">
                    <label htmlFor="depositAmount">
                      Additional Deposit Amount (LOGI)
                    </label>
                    <input
                      type="number"
                      id="depositAmount"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="100"
                      step="0.01"
                      className="form-input"
                    />
                  </div>

                  <button
                    onClick={depositToEscrow}
                    disabled={loading || !depositAmount}
                    className="action-button"
                  >
                    {loading ? "Processing..." : "Deposit More"}
                  </button>

                  {selectedShipment.milestoneStatus === 4 &&
                    !escrowDetails.isCompleted && (
                      <button
                        onClick={confirmDelivery}
                        disabled={loading}
                        className="action-button primary"
                      >
                        {loading
                          ? "Processing..."
                          : "Confirm Delivery & Release Payment"}
                      </button>
                    )}
                </div>
              </div>
            ) : (
              <div className="no-escrow">
                <p>No escrow opened for this shipment yet.</p>

                <form onSubmit={openEscrow} className="open-escrow-form">
                  <div className="form-group">
                    <label htmlFor="initialAmount">
                      Initial Deposit Amount (LOGI){" "}
                      <span className="required">*</span>
                    </label>
                    <input
                      type="number"
                      id="initialAmount"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="1000"
                      step="0.01"
                      required
                      className="form-input"
                    />
                    <p className="hint">
                      This will be distributed: 30% at pickup, 30% in transit,
                      20% at arrival, 20% at delivery
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !depositAmount}
                    className="submit-button"
                  >
                    {loading ? "Opening Escrow..." : "Open Escrow"}
                  </button>
                </form>
              </div>
            )}

            {error && (
              <div className="alert alert-error">
                <strong>Error:</strong> {error}
              </div>
            )}

            {success && (
              <div className="alert alert-success">
                <strong>Success:</strong> {success}
                {txHash && (
                  <p className="tx-hash">
                    Transaction: <code>{txHash}</code>
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
