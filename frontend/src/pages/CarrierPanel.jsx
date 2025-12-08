import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { ShipmentRegistryABI } from "../abis";
import { EscrowMilestoneABI } from "../abis";
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
import ShipmentDetailModal from "../components/ShipmentDetailModal";

export default function CarrierPanel({ account, chainId }) {
  const [shipments, setShipments] = useState([]);
  const [availableShipments, setAvailableShipments] = useState([]);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [selectedMilestone, setSelectedMilestone] = useState(1); // 1 = PICKED_UP
  const [cancelReason, setCancelReason] = useState("");
  const [proofFile, setProofFile] = useState(null);
  const [uploadingTransitDoc, setUploadingTransitDoc] = useState(null);
  const [uploadedTransitDocSuccessId, setUploadedTransitDocSuccessId] =
    useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingShipments, setLoadingShipments] = useState(true);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [viewingShipment, setViewingShipment] = useState(null);
  const [txHash, setTxHash] = useState("");

  // Pagination state
  const [displayedShipmentsCount, setDisplayedShipmentsCount] = useState(5);
  const [displayedAvailableCount, setDisplayedAvailableCount] = useState(5);
  const [totalMyShipments, setTotalMyShipments] = useState(0);
  const [totalAvailableShipments, setTotalAvailableShipments] = useState(0);
  const RECORDS_PER_PAGE = 5;

  // Cancel modal state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelModalShipmentId, setCancelModalShipmentId] = useState("");
  const [cancelModalReason, setCancelModalReason] = useState("");
  const [cancelModalFile, setCancelModalFile] = useState(null);
  const [cancelModalLoading, setCancelModalLoading] = useState(false);

  // Milestone options for carrier (cannot set to CREATED)
  const milestoneOptions = [
    { value: 1, label: "Picked Up", canSetFrom: [0] },
    { value: 2, label: "In Transit", canSetFrom: [1] },
    { value: 3, label: "Arrived at Destination", canSetFrom: [2] },
    { value: 4, label: "Delivered", canSetFrom: [3] },
    { value: 5, label: "Cancel", canSetFrom: [0, 1, 2, 3] },
    { value: 6, label: "Failed (Refund Buyer)", canSetFrom: [1, 2, 3] },
  ];

  useEffect(() => {
    if (account) {
      loadCarrierShipments();
      loadAvailableShipments();
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
            const latestCid =
              shipment.metadataCids.length > 0
                ? shipment.metadataCids[shipment.metadataCids.length - 1]
                : "";
            return {
              id: id.toString(),
              staff: shipment.staff,
              carrier: shipment.carrier,
              buyer: shipment.buyer,
              milestoneStatus: Number(shipment.status),
              metadataCid: latestCid,
              timestamp: Number(shipment.createdAt),
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

  const loadAvailableShipments = async () => {
    setLoadingAvailable(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const registry = getContract(
        "ShipmentRegistry",
        ShipmentRegistryABI.abi,
        provider,
        chainId
      );

      const total = await registry.getTotalShipments();
      const list = [];
      const count = Number(total);
      for (let i = 0; i < count; i++) {
        try {
          const s = await registry.getShipment(i);
          const isUnassigned = s.carrier === ethers.ZeroAddress;
          const statusNum = Number(s.status);
          const isCreated = statusNum === 0; // CREATED
          const isPickedUp = statusNum === 1; // PICKED_UP
          // Available for carrier: either CREATED (to accept) or PICKED_UP (to move IN_TRANSIT)
          if (isUnassigned && (isCreated || isPickedUp)) {
            const latestCid =
              s.metadataCids.length > 0
                ? s.metadataCids[s.metadataCids.length - 1]
                : "";
            list.push({
              id: i.toString(),
              staff: s.staff,
              buyer: s.buyer,
              status: statusNum,
              metadataCid: latestCid,
              timestamp: Number(s.createdAt),
            });
          }
        } catch (e) {
          // skip
        }
      }
      setAvailableShipments(list.reverse());
    } catch (e) {
      console.error("Error loading available shipments:", e);
    } finally {
      setLoadingAvailable(false);
    }
  };

  const handleFileChange = (e) => {
    setProofFile(e.target.files[0]);
  };

  const uploadTransitDocument = async (shipmentId, file) => {
    try {
      setUploadingTransitDoc(shipmentId);
      setUploadedTransitDocSuccessId(null);
      if (!file) {
        setError("Please select a document to upload");
        setUploadingTransitDoc(null);
        return;
      }

      // Upload file to IPFS
      const result = await uploadToIPFS(file);

      // Attach document to shipment
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const registry = getContract(
        "ShipmentRegistry",
        ShipmentRegistryABI.abi,
        signer,
        chainId
      );

      await handleTransaction(
        () => registry.attachDocument(shipmentId, "Transit Proof", result.cid),
        async () => {
          setSuccess("Transit document uploaded successfully!");
          setUploadedTransitDocSuccessId(shipmentId);
          // Auto-revert the success label back to "Upload Document" after a few seconds
          setTimeout(() => {
            // Only clear if still pointing to the same shipment
            setUploadedTransitDocSuccessId((curr) =>
              curr === shipmentId ? null : curr
            );
          }, 3000);
          // Refresh lists to reflect any changes
          await loadCarrierShipments();
          await loadAvailableShipments();
        },
        (errorMsg) => setError(parseContractError({ message: errorMsg }))
      );
    } catch (err) {
      console.error("Transit document upload error:", err);
      setError(parseContractError(err));
    } finally {
      setUploadingTransitDoc(null);
      // If there was an error, ensure label returns to default state
      setUploadedTransitDocSuccessId((curr) =>
        curr === shipmentId ? curr : curr
      );
    }
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

    // Cancel path requires reason
    if (selectedMilestone === 5 && !cancelReason.trim()) {
      setError("Cancel reason is required");
      return;
    }

    // Failed path requires reason
    if (selectedMilestone === 6 && !cancelReason.trim()) {
      setError("Failure reason is required");
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
        () =>
          selectedMilestone === 5
            ? registry.cancelShipment(
                selectedShipment.id,
                cancelReason.trim(),
                "",
                ""
              )
            : selectedMilestone === 6
            ? registry.markShipmentFailed(
                selectedShipment.id,
                cancelReason.trim()
              )
            : registry.updateMilestone(selectedShipment.id, selectedMilestone),
        async (receipt) => {
          setSuccess(
            selectedMilestone === 5
              ? "Shipment canceled successfully"
              : selectedMilestone === 6
              ? "Shipment marked as failed - Buyer will be refunded"
              : `Milestone updated to ${getMilestoneStatusName(
                  selectedMilestone
                )}!`
          );
          setTxHash(receipt.hash);

          // Step 3: Attach proof document if available
          if (proofCid && selectedMilestone !== 5 && selectedMilestone !== 6) {
            try {
              await handleTransaction(
                () =>
                  registry.attachDocument(
                    selectedShipment.id,
                    "Proof",
                    proofCid
                  ),
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
          setCancelReason("");
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

  // Directly mark a shipment as IN_TRANSIT without showing the update form
  const markInTransitDirect = async (shipmentId, currentStatus) => {
    if (!account) {
      setError("Please connect your wallet");
      return;
    }

    if (!canUpdateMilestone(currentStatus, 2)) {
      setError(
        `Cannot update from ${getMilestoneStatusName(
          currentStatus
        )} to In Transit`
      );
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setTxHash("");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const registry = getContract(
        "ShipmentRegistry",
        ShipmentRegistryABI.abi,
        signer,
        chainId
      );

      await handleTransaction(
        () => registry.updateMilestone(shipmentId, 2),
        async (receipt) => {
          setSuccess("Milestone updated to In Transit!");
          setTxHash(receipt.hash);
          await loadCarrierShipments();
          await loadAvailableShipments();
        },
        (errorMsg) => setError(parseContractError({ message: errorMsg }))
      );
    } catch (err) {
      console.error("Direct IN_TRANSIT error:", err);
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  };

  const acceptShipment = async (shipmentId) => {
    setLoading(true);
    setError("");
    setSuccess("");
    setTxHash("");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const registry = getContract(
        "ShipmentRegistry",
        ShipmentRegistryABI.abi,
        signer,
        chainId
      );

      // Check escrow is active before pickup
      try {
        const escrow = getContract(
          "EscrowMilestone",
          EscrowMilestoneABI.abi,
          provider,
          chainId
        );
        const details = await escrow.getEscrowDetails(Number(shipmentId));
        if (!details.isActive) {
          setError("Buyer must open escrow before pickup");
          setLoading(false);
          return;
        }
      } catch (_) {
        // If escrow contract not found or no details, block pickup
        setError(
          "Escrow not found or inactive. Ask buyer to open escrow first."
        );
        setLoading(false);
        return;
      }

      await handleTransaction(
        () => registry.acceptShipment(shipmentId),
        async (receipt) => {
          setSuccess(`Accepted shipment #${shipmentId} and picked up.`);
          setTxHash(receipt.hash);
          await loadCarrierShipments();
          await loadAvailableShipments();
        },
        (errorMsg) => setError(parseContractError({ message: errorMsg }))
      );
    } catch (err) {
      console.error("Accept shipment error:", err);
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  };

  // Directly mark a shipment as ARRIVED without showing the update form
  const markArrivedDirect = async (shipmentId, currentStatus) => {
    if (!account) {
      setError("Please connect your wallet");
      return;
    }

    if (!canUpdateMilestone(currentStatus, 3)) {
      setError(
        `Cannot update from ${getMilestoneStatusName(currentStatus)} to Arrived`
      );
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setTxHash("");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const registry = getContract(
        "ShipmentRegistry",
        ShipmentRegistryABI.abi,
        signer,
        chainId
      );

      await handleTransaction(
        () => registry.updateMilestone(shipmentId, 3),
        async (receipt) => {
          setSuccess("Milestone updated to Arrived!");
          setTxHash(receipt.hash);
          await loadCarrierShipments();
          await loadAvailableShipments();
        },
        (errorMsg) => setError(parseContractError({ message: errorMsg }))
      );
    } catch (err) {
      console.error("Direct ARRIVED error:", err);
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  };

  const openCancelModal = (shipmentId) => {
    setCancelModalOpen(true);
    setCancelModalShipmentId(shipmentId);
    setCancelModalReason("");
    setCancelModalFile(null);
    setError("");
    setSuccess("");
  };

  const closeCancelModal = () => {
    setCancelModalOpen(false);
  };

  const confirmCancelShipment = async () => {
    if (!account) {
      setError("Please connect your wallet");
      return;
    }
    if (!cancelModalReason.trim()) {
      setError("Cancel reason is required");
      return;
    }
    setCancelModalLoading(true);
    setError("");
    setSuccess("");
    setTxHash("");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const registry = getContract(
        "ShipmentRegistry",
        ShipmentRegistryABI.abi,
        signer,
        chainId
      );

      await handleTransaction(
        () =>
          registry.markShipmentFailed(
            cancelModalShipmentId,
            cancelModalReason.trim()
          ),
        async (receipt) => {
          setSuccess(
            "Shipment canceled and marked as failed. Buyer will be refunded."
          );
          setTxHash(receipt.hash);

          // upload cancel proof if provided
          if (cancelModalFile) {
            try {
              if (isPinataConfigured()) {
                const result = await uploadToIPFS(cancelModalFile);
                await handleTransaction(
                  () =>
                    registry.attachDocument(
                      cancelModalShipmentId,
                      "Cancel Proof",
                      result.cid
                    ),
                  () => {},
                  () => {}
                );
              } else {
                console.warn(
                  "Pinata not configured, skipping cancel proof upload"
                );
              }
            } catch (attachErr) {
              console.warn("Cancel proof upload failed:", attachErr);
            }
          }

          await loadCarrierShipments();
          await loadAvailableShipments();
          closeCancelModal();
        },
        (errorMsg) => setError(parseContractError({ message: errorMsg }))
      );
    } catch (err) {
      console.error("Confirm cancel error:", err);
      setError(parseContractError(err));
    } finally {
      setCancelModalLoading(false);
    }
  };

  const markShipmentFailed = async (shipmentId, reason) => {
    setLoading(true);
    setError("");
    setSuccess("");
    setTxHash("");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const registry = getContract(
        "ShipmentRegistry",
        ShipmentRegistryABI.abi,
        signer,
        chainId
      );

      await handleTransaction(
        () => registry.markShipmentFailed(shipmentId, reason),
        async (receipt) => {
          setSuccess(
            `Shipment #${shipmentId} marked as failed. Buyer will be refunded.`
          );
          setTxHash(receipt.hash);
          await loadCarrierShipments();
        },
        (errorMsg) => setError(parseContractError({ message: errorMsg }))
      );
    } catch (err) {
      console.error("Mark failed error:", err);
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
        <div className="shipments-list" style={{ marginBottom: 24 }}>
          <h3>Available Shipments to Accept ({availableShipments.length})</h3>
          {loadingAvailable ? (
            <p>Loading available shipments...</p>
          ) : availableShipments.length === 0 ? (
            <div className="empty-state">
              <p>No open shipments to accept</p>
            </div>
          ) : (
            <div className="shipments-grid">
              {availableShipments.map((s) => (
                <div key={s.id} className="shipment-card">
                  <div className="card-header">
                    <h4>Shipment #{s.id}</h4>
                    <span className={`status-badge status-${s.status}`}>
                      {getMilestoneStatusName(s.status)}
                    </span>
                  </div>
                  <div className="card-body">
                    <p>
                      <strong>Staff:</strong> {s.staff.slice(0, 10)}...
                    </p>
                    <p>
                      <strong>Buyer:</strong> {s.buyer.slice(0, 10)}...
                    </p>
                    <p>
                      <strong>Created:</strong>{" "}
                      {new Date(s.timestamp * 1000).toLocaleDateString()}
                    </p>
                    {s.metadataCid && (
                      <button
                        className="metadata-link"
                        onClick={() => setViewingShipment(s)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#2563eb",
                          cursor: "pointer",
                          textDecoration: "underline",
                          padding: 0,
                        }}
                      >
                        View Details
                      </button>
                    )}
                  </div>
                  <div
                    className="card-actions"
                    style={{ padding: "8px 16px 16px" }}
                  >
                    {s.status === 0 ? (
                      <button
                        className="action-button"
                        style={{ backgroundColor: "#000", color: "#fff" }}
                        disabled={loading}
                        onClick={() => acceptShipment(s.id)}
                      >
                        Accept
                      </button>
                    ) : (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className="action-button"
                          style={{ backgroundColor: "#000", color: "#fff" }}
                          disabled={loading}
                          onClick={() => markInTransitDirect(s.id, s.status)}
                        >
                          Mark In Transit
                        </button>
                        <label className="action-button">
                          {uploadingTransitDoc === s.id
                            ? "Uploading..."
                            : uploadedTransitDocSuccessId === s.id
                            ? "Upload Success"
                            : "Upload Document"}
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.json"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadTransitDocument(s.id, f);
                            }}
                            disabled={uploadingTransitDoc === s.id}
                            style={{ display: "none" }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
                <div key={shipment.id} className={`shipment-card`}>
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
                      <strong>Staff:</strong> {shipment.staff.slice(0, 10)}
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
                      <button
                        className="metadata-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingShipment(shipment);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#2563eb",
                          cursor: "pointer",
                          textDecoration: "underline",
                          padding: 0,
                        }}
                      >
                        View Details
                      </button>
                    )}
                  </div>
                  {shipment.milestoneStatus === 2 && (
                    <div
                      className="card-actions"
                      style={{ padding: "8px 16px 16px" }}
                    >
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className="action-button"
                          style={{ backgroundColor: "#000", color: "#fff" }}
                          disabled={loading}
                          onClick={(e) => {
                            e.stopPropagation();
                            markArrivedDirect(
                              shipment.id,
                              shipment.milestoneStatus
                            );
                          }}
                        >
                          Mark Arrived
                        </button>
                        <label
                          className="action-button"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {uploadingTransitDoc === shipment.id
                            ? "Uploading..."
                            : uploadedTransitDocSuccessId === shipment.id
                            ? "Upload Success"
                            : "Upload Document"}
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.json"
                            onChange={(e) => {
                              e.stopPropagation();
                              const f = e.target.files?.[0];
                              if (f) uploadTransitDocument(shipment.id, f);
                            }}
                            disabled={uploadingTransitDoc === shipment.id}
                            style={{ display: "none" }}
                          />
                        </label>
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <button
                          className="action-button"
                          style={{ backgroundColor: "#dc2626", color: "#fff" }}
                          disabled={loading}
                          onClick={(e) => {
                            e.stopPropagation();
                            openCancelModal(shipment.id);
                          }}
                        >
                          Mark Failed
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {cancelModalOpen && (
          <div
            className="modal-overlay"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
            onClick={closeCancelModal}
          >
            <div
              className="modal"
              style={{
                background: "#fff",
                padding: 20,
                borderRadius: 8,
                width: 520,
                maxWidth: "90%",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ marginTop: 0 }}>Mark Shipment as Failed</h3>
              <p style={{ color: "#6b7280", marginBottom: 16 }}>
                This will refund remaining escrow balance to the buyer.
              </p>
              <div className="form-group">
                <label htmlFor="cancelReasonModal">
                  Failure Reason <span className="required">*</span>
                </label>
                <textarea
                  id="cancelReasonModal"
                  value={cancelModalReason}
                  onChange={(e) => setCancelModalReason(e.target.value)}
                  placeholder="Provide a clear reason for cancellation"
                  rows={3}
                  className="form-textarea"
                />
              </div>
              <div className="form-group">
                <label htmlFor="cancelProof">
                  Attach Cancel Proof (optional)
                </label>
                <input
                  type="file"
                  id="cancelProof"
                  onChange={(e) =>
                    setCancelModalFile(e.target.files?.[0] || null)
                  }
                  accept=".pdf,.jpg,.jpeg,.png,.json"
                  className="form-file"
                  style={{ color: "#000", backgroundColor: "#fff" }}
                />
                <div style={{ marginTop: 6, color: "#000" }}>
                  {cancelModalFile
                    ? `Selected: ${cancelModalFile.name}`
                    : "No file selected"}
                </div>
                {!isPinataConfigured() && (
                  <p className="hint warning">
                    ⚠️ IPFS not configured. Files won't be uploaded.
                  </p>
                )}
              </div>
              <div
                className="form-actions"
                style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
              >
                <button
                  className="cancel-button"
                  onClick={closeCancelModal}
                  disabled={cancelModalLoading}
                >
                  Close
                </button>
                <button
                  className="submit-button"
                  onClick={confirmCancelShipment}
                  disabled={cancelModalLoading}
                >
                  {cancelModalLoading ? "Processing..." : "Confirm Cancel"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Shipment Detail Modal */}
        {viewingShipment && (
          <ShipmentDetailModal
            shipment={viewingShipment}
            onClose={() => setViewingShipment(null)}
          />
        )}
      </div>
    </div>
  );
}
