import { useEffect, useState } from "react";
import { retrieveFromIPFS, getIPFSUrl } from "../utils/ipfs";
import {
  getShipmentRegistry,
  getMilestoneStatusName,
} from "../utils/contracts";

export default function OrderDetailModal({ shipmentId, onClose }) {
  const [metadata, setMetadata] = useState(null);
  const [shipment, setShipment] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadShipmentDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId]);

  async function loadShipmentDetails() {
    try {
      setLoading(true);
      const registry = await getShipmentRegistry();

      // Get shipment data
      const shipmentData = await registry.getShipment(shipmentId);
      setShipment({
        id: Number(shipmentData.id),
        shipper: shipmentData.shipper,
        carrier: shipmentData.carrier,
        buyer: shipmentData.buyer,
        status: Number(shipmentData.status),
        createdAt: new Date(
          Number(shipmentData.createdAt) * 1000
        ).toLocaleString(),
        updatedAt: new Date(
          Number(shipmentData.updatedAt) * 1000
        ).toLocaleString(),
      });

      // Load metadata from IPFS (auto-decrypts)
      if (shipmentData.metadataCids && shipmentData.metadataCids.length > 0) {
        const metadataCid = shipmentData.metadataCids[0];
        try {
          const data = await retrieveFromIPFS(metadataCid);
          setMetadata(data);
        } catch (err) {
          console.warn("Could not load metadata:", err);
        }
      }

      // Load documents
      const docs = await registry.getShipmentDocuments(shipmentId);
      setDocuments(
        docs.map((doc) => ({
          docType: doc.docType,
          cid: doc.cid,
          uploadedBy: doc.uploadedBy,
          timestamp: new Date(Number(doc.timestamp) * 1000).toLocaleString(),
        }))
      );
    } catch (err) {
      console.error("Error loading shipment details:", err);
      setError("Failed to load shipment details");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal-content loading"
          onClick={(e) => e.stopPropagation()}
        >
          <p>Loading shipment details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal-content error"
          onClick={(e) => e.stopPropagation()}
        >
          <p>{error}</p>
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content order-detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Shipment #{shipmentId} Details</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {shipment && (
            <div className="shipment-info-section">
              <h3>Shipment Information</h3>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Status:</span>
                  <span className={`status-badge status-${shipment.status}`}>
                    {getMilestoneStatusName(shipment.status)}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">Shipper:</span>
                  <span className="info-value address">{shipment.shipper}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Carrier:</span>
                  <span className="info-value address">{shipment.carrier}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Buyer:</span>
                  <span className="info-value address">{shipment.buyer}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Created:</span>
                  <span className="info-value">{shipment.createdAt}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Last Updated:</span>
                  <span className="info-value">{shipment.updatedAt}</span>
                </div>
              </div>
            </div>
          )}

          {metadata && (
            <div className="metadata-section">
              <h3>Shipment Metadata</h3>
              <div className="info-grid">
                {metadata.origin && (
                  <div className="info-item">
                    <span className="info-label">Origin:</span>
                    <span className="info-value">{metadata.origin}</span>
                  </div>
                )}
                {metadata.destination && (
                  <div className="info-item">
                    <span className="info-label">Destination:</span>
                    <span className="info-value">{metadata.destination}</span>
                  </div>
                )}
                {metadata.weight && (
                  <div className="info-item">
                    <span className="info-label">Weight:</span>
                    <span className="info-value">{metadata.weight}</span>
                  </div>
                )}
                {metadata.description && (
                  <div className="info-item full-width">
                    <span className="info-label">Description:</span>
                    <span className="info-value">{metadata.description}</span>
                  </div>
                )}
                {metadata.items && (
                  <div className="info-item full-width">
                    <span className="info-label">Items:</span>
                    <span className="info-value">{metadata.items}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="documents-section">
            <h3>Documents ({documents.length})</h3>
            {documents.length === 0 ? (
              <p className="empty-state">No documents attached</p>
            ) : (
              <div className="documents-list">
                {documents.map((doc, idx) => (
                  <div key={idx} className="document-item">
                    <div className="document-info">
                      <span className="document-type">{doc.docType}</span>
                      <span className="document-meta">
                        Uploaded by {doc.uploadedBy.slice(0, 10)}... on{" "}
                        {doc.timestamp}
                      </span>
                    </div>
                    <a
                      href={getIPFSUrl(doc.cid)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-link"
                    >
                      View Document →
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
