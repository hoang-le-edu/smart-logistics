import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { ShipmentRegistryABI } from "../abis";
import {
  getContract,
  handleTransaction,
  parseContractError,
  getMilestoneStatusName,
} from "../utils/contracts";
import {
  uploadToIPFS,
  isPinataConfigured,
  retrieveFromIPFS,
} from "../utils/ipfs";

export default function CarrierPanel({ account, chainId }) {
  const [shipments, setShipments] = useState([]);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [selectedMilestone, setSelectedMilestone] = useState(1); // 1 = PICKED_UP
  const [proofFile, setProofFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingShipments, setLoadingShipments] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");

  // Milestone options for carrier (cannot set to CREATED)
  const milestoneOptions = [
    { value: 1, label: "Picked Up", canSetFrom: [0] },
    { value: 2, label: "In Transit", canSetFrom: [1] },
    { value: 3, label: "Arrived at Destination", canSetFrom: [2] },
    { value: 4, label: "Delivered", canSetFrom: [3] },
  ];

  useEffect(() => {
    if (account) {
      loadCarrierShipments();
    }
  }, [account, chainId]);

  const loadCarrierShipments = async () => {
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

      const shipmentIds = await registry.getShipmentsByAddress(account);

      const shipmentsData = await Promise.all(
        shipmentIds.map(async (id) => {
          const shipment = await registry.getShipment(id);

          // Only include shipments where account is carrier
          if (shipment.carrier.toLowerCase() === account.toLowerCase()) {
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
      console.error("Error loading shipments:", err);
      setError(parseContractError(err));
    } finally {
      setLoadingShipments(false);
    }
  };

  const handleFileChange = (e) => {
    setProofFile(e.target.files[0]);
  };

  const canUpdateMilestone = (currentStatus, targetStatus) => {
    const option = milestoneOptions.find((m) => m.value === targetStatus);
    return option && option.canSetFrom.includes(currentStatus);
  };

  const updateMilestone = async (e) => {
    e.preventDefault();

    if (!account || !selectedShipment) {
      setError("Please select a shipment");
      return;
    }

    if (
      !canUpdateMilestone(selectedShipment.milestoneStatus, selectedMilestone)
    ) {
      setError(
        `Cannot update from ${getMilestoneStatusName(
          selectedShipment.milestoneStatus
        )} to ${getMilestoneStatusName(selectedMilestone)}`
      );
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setTxHash("");

    try {
      // Step 1: Upload proof document to IPFS if provided
      let proofCid = "";

      if (proofFile) {
        if (isPinataConfigured()) {
          const result = await uploadToIPFS(proofFile);
          proofCid = result.cid;
          console.log("Proof document uploaded to IPFS:", proofCid);
        } else {
          console.warn("Pinata not configured, skipping file upload");
        }
      }

      // Step 2: Update milestone on blockchain
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const registry = getContract(
        "ShipmentRegistry",
        ShipmentRegistryABI.abi,
        signer,
        chainId
      );

      const receipt = await handleTransaction(
        () => registry.updateMilestone(selectedShipment.id, selectedMilestone),
        async (receipt) => {
          setSuccess(
            `Milestone updated to ${getMilestoneStatusName(selectedMilestone)}!`
          );
          setTxHash(receipt.hash);

          // Step 3: Attach proof document if available
          if (proofCid) {
            try {
              await handleTransaction(
                () => registry.attachDocument(selectedShipment.id, proofCid),
                () => {
                  console.log("Proof document attached to shipment");
                },
                (err) => {
                  console.warn("Failed to attach document:", err);
                }
              );
            } catch (attachErr) {
              console.warn("Document attachment failed:", attachErr);
            }
          }

          // Reload shipments
          await loadCarrierShipments();
          setSelectedShipment(null);
          setProofFile(null);
        },
        (errorMsg) => {
          setError(parseContractError({ message: errorMsg }));
        }
      );

      console.log("Transaction receipt:", receipt);
    } catch (err) {
      console.error("Error updating milestone:", err);
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  };

  const selectShipment = (shipment) => {
    setSelectedShipment(shipment);
    setError("");
    setSuccess("");

    // Auto-select next logical milestone
    const currentStatus = shipment.milestoneStatus;
    if (currentStatus < 4) {
      setSelectedMilestone(currentStatus + 1);
    }
  };

  if (!account) {
    return (
      <div className="carrier-panel">
        <div className="empty-state">
          <p>Please connect your wallet to manage shipments</p>
        </div>
      </div>
    );
  }

  return (
    <div className="carrier-panel">
      <div className="panel-header">
        <h2>Manage Shipments</h2>
        <p className="subtitle">
          As Carrier, you can update shipment milestones
        </p>
      </div>

      <div className="panel-content">
        <div className="shipments-list">
          <h3>Your Shipments ({shipments.length})</h3>

          {loadingShipments ? (
            <p>Loading shipments...</p>
          ) : shipments.length === 0 ? (
            <div className="empty-state">
              <p>No shipments found where you are the carrier</p>
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
                      <strong>Buyer:</strong> {shipment.buyer.slice(0, 10)}...
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
          <div className="update-form">
            <h3>Update Milestone for Shipment #{selectedShipment.id}</h3>

            <form onSubmit={updateMilestone}>
              <div className="form-group">
                <label htmlFor="currentStatus">Current Status</label>
                <input
                  type="text"
                  id="currentStatus"
                  value={getMilestoneStatusName(
                    selectedShipment.milestoneStatus
                  )}
                  disabled
                  className="form-input disabled"
                />
              </div>

              <div className="form-group">
                <label htmlFor="milestone">
                  New Milestone Status <span className="required">*</span>
                </label>
                <select
                  id="milestone"
                  value={selectedMilestone}
                  onChange={(e) => setSelectedMilestone(Number(e.target.value))}
                  className="form-select"
                  required
                >
                  {milestoneOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={
                        !canUpdateMilestone(
                          selectedShipment.milestoneStatus,
                          option.value
                        )
                      }
                    >
                      {option.label}
                      {!canUpdateMilestone(
                        selectedShipment.milestoneStatus,
                        option.value
                      ) && " (unavailable)"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="proof">
                  Attach Proof Document (Photo, Signature, GPS, etc.)
                </label>
                <input
                  type="file"
                  id="proof"
                  onChange={handleFileChange}
                  accept=".pdf,.jpg,.jpeg,.png,.json"
                  className="form-file"
                />
                {!isPinataConfigured() && (
                  <p className="hint warning">
                    ⚠️ IPFS not configured. Files won't be uploaded.
                  </p>
                )}
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => setSelectedShipment(null)}
                  className="cancel-button"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="submit-button"
                >
                  {loading ? "Updating..." : "Update Milestone"}
                </button>
              </div>

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
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
