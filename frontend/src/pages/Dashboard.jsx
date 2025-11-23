import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { ShipmentRegistryABI } from "../abis";
import {
  getContract,
  getMilestoneStatusName,
  getMilestoneColor,
  formatAddress,
} from "../utils/contracts";
import { getIPFSUrl } from "../utils/ipfs";

export default function Dashboard({ account, chainId }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (account && chainId) {
      loadShipments();
    }
  }, [account, chainId]);

  const loadShipments = async () => {
    try {
      setLoading(true);
      setError("");

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const registry = getContract(
        "ShipmentRegistry",
        ShipmentRegistryABI.abi,
        signer,
        chainId
      );

      // Get all shipment IDs for this address
      const shipmentIds = await registry.getShipmentsByAddress(account);

      // Load each shipment's details
      const shipmentsData = await Promise.all(
        shipmentIds.map(async (id) => {
          try {
            const shipment = await registry.getShipment(id);
            const documents = await registry.getShipmentDocuments(id);

            return {
              id: id.toString(),
              shipper: shipment.shipper,
              carrier: shipment.carrier,
              buyer: shipment.buyer,
              warehouse: shipment.warehouse,
              metadataCid: shipment.metadataCid,
              status: Number(shipment.status),
              createdAt: new Date(Number(shipment.createdAt) * 1000),
              updatedAt: new Date(Number(shipment.updatedAt) * 1000),
              documents: documents.map((doc) => ({
                docType: doc.docType,
                cid: doc.cid,
                uploadedBy: doc.uploadedBy,
                timestamp: new Date(Number(doc.timestamp) * 1000),
              })),
            };
          } catch (err) {
            console.error(`Error loading shipment ${id}:`, err);
            return null;
          }
        })
      );

      setShipments(shipmentsData.filter((s) => s !== null));
    } catch (err) {
      console.error("Error loading shipments:", err);
      setError("Failed to load shipments. Make sure contracts are deployed.");
    } finally {
      setLoading(false);
    }
  };

  const filteredShipments = shipments.filter((shipment) => {
    if (filter === "all") return true;
    if (filter === "asShipper")
      return shipment.shipper.toLowerCase() === account.toLowerCase();
    if (filter === "asCarrier")
      return shipment.carrier.toLowerCase() === account.toLowerCase();
    if (filter === "asBuyer")
      return shipment.buyer.toLowerCase() === account.toLowerCase();
    return true;
  });

  const getMyRole = (shipment) => {
    const roles = [];
    if (shipment.shipper.toLowerCase() === account.toLowerCase())
      roles.push("Shipper");
    if (shipment.carrier.toLowerCase() === account.toLowerCase())
      roles.push("Carrier");
    if (shipment.buyer.toLowerCase() === account.toLowerCase())
      roles.push("Buyer");
    if (shipment.warehouse.toLowerCase() === account.toLowerCase())
      roles.push("Warehouse");
    return roles.join(", ");
  };

  if (!account) {
    return (
      <div className="dashboard">
        <div className="empty-state">
          <p>Please connect your wallet to view shipments</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>My Shipments</h2>
        <button
          onClick={loadShipments}
          className="refresh-button"
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <div className="filter-tabs">
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
        >
          All ({shipments.length})
        </button>
        <button
          className={filter === "asShipper" ? "active" : ""}
          onClick={() => setFilter("asShipper")}
        >
          As Shipper (
          {
            shipments.filter(
              (s) => s.shipper.toLowerCase() === account.toLowerCase()
            ).length
          }
          )
        </button>
        <button
          className={filter === "asCarrier" ? "active" : ""}
          onClick={() => setFilter("asCarrier")}
        >
          As Carrier (
          {
            shipments.filter(
              (s) => s.carrier.toLowerCase() === account.toLowerCase()
            ).length
          }
          )
        </button>
        <button
          className={filter === "asBuyer" ? "active" : ""}
          onClick={() => setFilter("asBuyer")}
        >
          As Buyer (
          {
            shipments.filter(
              (s) => s.buyer.toLowerCase() === account.toLowerCase()
            ).length
          }
          )
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading shipments...</div>
      ) : filteredShipments.length === 0 ? (
        <div className="empty-state">
          <p>No shipments found</p>
          <p className="hint">Create a new shipment from the Shipper Panel</p>
        </div>
      ) : (
        <div className="shipments-grid">
          {filteredShipments.map((shipment) => (
            <div key={shipment.id} className="shipment-card">
              <div className="shipment-header">
                <h3>Shipment #{shipment.id}</h3>
                <span
                  className={`status-badge status-${getMilestoneColor(
                    shipment.status
                  )}`}
                >
                  {getMilestoneStatusName(shipment.status)}
                </span>
              </div>

              <div className="shipment-details">
                <div className="detail-row">
                  <strong>My Role:</strong> {getMyRole(shipment)}
                </div>
                <div className="detail-row">
                  <strong>Shipper:</strong> {formatAddress(shipment.shipper)}
                </div>
                <div className="detail-row">
                  <strong>Carrier:</strong> {formatAddress(shipment.carrier)}
                </div>
                <div className="detail-row">
                  <strong>Buyer:</strong> {formatAddress(shipment.buyer)}
                </div>
                <div className="detail-row">
                  <strong>Created:</strong>{" "}
                  {shipment.createdAt.toLocaleDateString()}
                </div>
                <div className="detail-row">
                  <strong>Updated:</strong>{" "}
                  {shipment.updatedAt.toLocaleDateString()}
                </div>
                {shipment.metadataCid && (
                  <div className="detail-row">
                    <strong>Metadata:</strong>{" "}
                    <a
                      href={getIPFSUrl(shipment.metadataCid)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ipfs-link"
                    >
                      View on IPFS
                    </a>
                  </div>
                )}
                {shipment.documents.length > 0 && (
                  <div className="documents-section">
                    <strong>Documents ({shipment.documents.length}):</strong>
                    <ul className="documents-list">
                      {shipment.documents.slice(0, 3).map((doc, idx) => (
                        <li key={idx}>
                          <a
                            href={getIPFSUrl(doc.cid)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {doc.docType}
                          </a>
                        </li>
                      ))}
                      {shipment.documents.length > 3 && (
                        <li>...and {shipment.documents.length - 3} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
