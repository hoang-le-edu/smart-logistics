import { useState, useEffect } from "react";
import { getShipmentRegistry } from "../utils/contracts";
import { uploadToIPFS } from "../utils/ipfs";

export default function PackerPanel({ account, chainId }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingDoc, setUploadingDoc] = useState(null);

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

      for (let i = 0; i < totalShipments; i++) {
        const shipment = await registry.getShipment(i);
        if (Number(shipment.status) === 0) {
          pending.push({
            id: Number(shipment.id),
            shipper: shipment.shipper,
            carrier: shipment.carrier,
            buyer: shipment.buyer,
            status: Number(shipment.status),
            createdAt: new Date(
              Number(shipment.createdAt) * 1000
            ).toLocaleString(),
          });
        }
      }

      setShipments(pending);
    } catch (error) {
      console.error("Error loading shipments:", error);
      alert("Failed to load shipments: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function markPickedUp(shipmentId) {
    try {
      const registry = await getShipmentRegistry();
      const tx = await registry.updateMilestone(shipmentId, 1); // PICKED_UP
      await tx.wait();
      alert("Shipment marked as picked up!");
      loadPendingShipments();
    } catch (error) {
      console.error("Error updating milestone:", error);
      alert("Failed to mark as picked up: " + error.message);
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

      alert("Document uploaded successfully!");
      setUploadingDoc(null);
    } catch (error) {
      console.error("Error uploading document:", error);
      alert("Failed to upload document: " + error.message);
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
                  <span className="label">Shipper:</span>
                  <span className="value address">
                    {shipment.shipper.slice(0, 10)}...
                  </span>
                </div>
                <div className="info-row">
                  <span className="label">Carrier:</span>
                  <span className="value address">
                    {shipment.carrier.slice(0, 10)}...
                  </span>
                </div>
                <div className="info-row">
                  <span className="label">Buyer:</span>
                  <span className="value address">
                    {shipment.buyer.slice(0, 10)}...
                  </span>
                </div>
                <div className="info-row">
                  <span className="label">Created:</span>
                  <span className="value">{shipment.createdAt}</span>
                </div>
              </div>

              <div className="card-actions">
                <button
                  className="btn-primary"
                  onClick={() => markPickedUp(shipment.id)}
                >
                  ✓ Mark as Picked Up
                </button>

                <label className="btn-secondary file-upload-label">
                  {uploadingDoc === shipment.id
                    ? "Uploading..."
                    : "📄 Upload Packing List"}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      if (e.target.files[0]) {
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
