import { useState, useEffect } from "react";
import { getShipmentRegistry } from "../utils/contracts";
import { uploadToIPFS } from "../utils/ipfs";

export default function PackerPanel({ account, chainId }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingDoc, setUploadingDoc] = useState(null);
  const [uploadedSuccess, setUploadedSuccess] = useState(null);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [nameCache, setNameCache] = useState({});

  async function getDisplayName(address) {
    if (!address) return "";
    const key = address.toLowerCase();
    if (nameCache[key] !== undefined) return nameCache[key];
    try {
      const registry = await getShipmentRegistry();
      const name = await registry.displayName(address);
      setNameCache((prev) => ({ ...prev, [key]: name }));
      return name;
    } catch (e) {
      setNameCache((prev) => ({ ...prev, [key]: "" }));
      return "";
    }
  }

  useEffect(() => {
    if (account) {
      loadPendingShipments();
    }
  }, [account, chainId]);

  async function loadPendingShipments() {
    try {
      setLoading(true);
      const registry = await getShipmentRegistry();

      // Get all shipments with status CREATED (0)
      const totalShipments = await registry.getTotalShipments();
      const pending = [];
      const ZERO = "0x0000000000000000000000000000000000000000";

      for (let i = 0; i < totalShipments; i++) {
        const shipment = await registry.getShipment(i);
        // After contract update, allow Packer to see all CREATED shipments
        if (Number(shipment.status) === 0) {
          pending.push({
            id: Number(shipment.id),
            staff: shipment.staff,
            carrier: shipment.carrier,
            buyer: shipment.buyer,
            warehouse: shipment.warehouse,
            status: Number(shipment.status),
            createdAt: new Date(
              Number(shipment.createdAt) * 1000
            ).toLocaleString(),
          });
        }
      }

      setShipments(pending);
      // Prefetch names to avoid flicker
      const addrs = new Set();
      pending.forEach((p) => {
        if (p.staff) addrs.add(p.staff.toLowerCase());
        if (p.carrier) addrs.add(p.carrier.toLowerCase());
        if (p.buyer) addrs.add(p.buyer.toLowerCase());
      });
      for (const addr of addrs) {
        // fire and forget
        getDisplayName(addr);
      }
      setError("");
    } catch (error) {
      console.error("Error loading shipments:", error);
      setError("Failed to load shipments: " + (error?.message || String(error)));
    } finally {
      setLoading(false);
    }
  }

  async function markPickedUp(shipmentId) {
    try {
      const registry = await getShipmentRegistry();
      // Contract now allows PICKED_UP without an assigned carrier; carrier will self-assign at IN_TRANSIT
      const tx = await registry.updateMilestone(shipmentId, 1); // PICKED_UP
      await tx.wait();
      setSuccess(`Shipment #${shipmentId} marked as PICKED_UP!`);
      setError("");
      loadPendingShipments();
    } catch (error) {
      console.error("Error updating milestone:", error);
      setError("Failed to mark as picked up: " + (error?.message || String(error)));
      setSuccess("");
    }
  }

  async function uploadPackingDocument(shipmentId, file) {
    try {
      setUploadingDoc(shipmentId);

      // Upload file to IPFS (auto-encrypted)
      const result = await uploadToIPFS(file);

      // Attach document to shipment
      const registry = await getShipmentRegistry();
      const tx = await registry.attachDocument(
        shipmentId,
        "Packing List",
        result.cid
      );
      await tx.wait();
      setSuccess("Packing document uploaded successfully!");
      setUploadedSuccess(shipmentId);
      setError("");
      setUploadingDoc(null);
    } catch (error) {
      console.error("Error uploading document:", error);
      setError("Failed to upload document: " + (error?.message || String(error)));
      setSuccess("");
      setUploadingDoc(null);
    }
  }

  if (!account) {
    return (
      <div className="panel-placeholder">
        <p>Please connect your wallet to access the Packer Panel</p>
      </div>
    );
  }

  return (
    <div className="packer-panel">
      <div className="panel-header">
        <h2>📦 Packer Dashboard</h2>
        <p className="subtitle">
          Mark shipments as picked up and upload packing documents
        </p>
      </div>

      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}
      {success && (
        <div className="alert alert-success">
          <strong>Success:</strong> {success}
        </div>
      )}

      {loading ? (
        <div className="loading-state">Loading pending shipments...</div>
      ) : shipments.length === 0 ? (
        <div className="empty-state">
          <p>No shipments ready for packing</p>
        </div>
      ) : (
        <div className="shipments-grid">
          {shipments.map((shipment) => (
            <div key={shipment.id} className="shipment-card">
              <div className="card-header">
                <h3>Shipment #{shipment.id}</h3>
                <span className="status-badge status-created">CREATED</span>
              </div>

              <div className="card-body">
                <div className="info-row">
                  <span className="label">Staff: </span>
                  <span className="value">
                    {nameCache[shipment.staff?.toLowerCase()] ?? ""}
                  </span>
                </div>
                <div className="info-row">
                  <span className="label">Carrier: </span>
                  <span className="value">
                    {nameCache[shipment.carrier?.toLowerCase()] ?? ""}
                  </span>
                </div>
                <div className="info-row">
                  <span className="label">Buyer: </span>
                  <span className="value">
                    {nameCache[shipment.buyer?.toLowerCase()] ?? ""}
                  </span>
                </div>
                <div className="info-row">
                  <span className="label">Created: </span>
                  <span className="value">{shipment.createdAt}</span>
                </div>
              </div>

              <div className="card-actions" style={{ marginTop: 8 }}>
                <button
                  className="btn-primary"
                  onClick={() => markPickedUp(shipment.id)}
                >
                  Mark as Picked Up
                </button>

                <label className="btn-secondary file-upload-label">
                    {uploadingDoc === shipment.id
                      ? "Uploading..."
                      : uploadedSuccess === shipment.id
                      ? "Upload Success"
                      : "Upload Document"}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      if (e.target.files[0]) {
                          // Reset success indicator for a new upload attempt
                          setUploadedSuccess(null);
                        uploadPackingDocument(shipment.id, e.target.files[0]);
                      }
                    }}
                    disabled={uploadingDoc === shipment.id}
                    style={{ display: "none" }}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
