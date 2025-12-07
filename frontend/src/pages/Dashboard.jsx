import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { ShipmentRegistryABI } from "../abis";
import {
  getContract,
  getMilestoneStatusName,
  getMilestoneColor,
  formatAddress,
} from "../utils/contracts";
import { getIPFSUrl, retrieveFromIPFS } from "../utils/ipfs";

export default function Dashboard({ account, chainId, role }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (account && chainId) {
      loadShipments();
    }
  }, [account, chainId, role]);

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

            // Try to fetch metadata (origin/destination/description)
            let meta = {};
            if (shipment.metadataCid && shipment.metadataCid !== "") {
              try {
                meta = await retrieveFromIPFS(shipment.metadataCid);
              } catch (e) {
                console.warn("Failed to fetch metadata for", id.toString(), e);
              }
            }

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
              origin: meta.origin || "-",
              destination: meta.destination || "-",
              description: meta.description || "",
              weight: meta.weight || "",
              items: meta.items || "",
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
    // Role-based filtering
    if (role && role !== "ADMIN") {
      if (
        role === "STAFF" &&
        (!shipment.shipper ||
          shipment.shipper.toLowerCase() !== account.toLowerCase())
      ) {
        return false;
      }
      if (
        role === "CARRIER" &&
        (!shipment.carrier ||
          shipment.carrier.toLowerCase() !== account.toLowerCase())
      ) {
        return false;
      }
      if (
        role === "BUYER" &&
        (!shipment.buyer ||
          shipment.buyer.toLowerCase() !== account.toLowerCase())
      ) {
        return false;
      }
      if (role === "PACKER" && shipment.status !== 0 && shipment.status !== 1) {
        return false; // Packer only sees CREATED and PICKED_UP
      }
    }

    // Additional filter
    if (filter === "all") return true;
    if (filter === "asShipper")
      return (
        shipment.shipper &&
        shipment.shipper.toLowerCase() === account.toLowerCase()
      );
    if (filter === "asCarrier")
      return (
        shipment.carrier &&
        shipment.carrier.toLowerCase() === account.toLowerCase()
      );
    if (filter === "asBuyer")
      return (
        shipment.buyer && shipment.buyer.toLowerCase() === account.toLowerCase()
      );
    return true;
  });

  const getMyRole = (shipment) => {
    if (!account) return "—";
    const roles = [];
    if (
      shipment.shipper &&
      shipment.shipper.toLowerCase() === account.toLowerCase()
    )
      roles.push("Shipper");
    if (
      shipment.carrier &&
      shipment.carrier.toLowerCase() === account.toLowerCase()
    )
      roles.push("Carrier");
    if (
      shipment.buyer &&
      shipment.buyer.toLowerCase() === account.toLowerCase()
    )
      roles.push("Buyer");
    if (
      shipment.warehouse &&
      shipment.warehouse.toLowerCase() === account.toLowerCase()
    )
      roles.push("Warehouse");
    return roles.length > 0 ? roles.join(", ") : "—";
  };

  const canProgress = (shipment) => {
    if (!account) return false;
    const s = shipment.status;
    if (s >= 4) return false;
    const next = s + 1;
    if (next === 1)
      return (
        shipment.shipper &&
        shipment.shipper.toLowerCase() === account.toLowerCase()
      );
    if (next === 2 || next === 3)
      return (
        shipment.carrier &&
        shipment.carrier.toLowerCase() === account.toLowerCase()
      );
    if (next === 4)
      return (
        shipment.buyer && shipment.buyer.toLowerCase() === account.toLowerCase()
      );
    return false;
  };

  const getNextActionLabel = (status) => {
    switch (status + 1) {
      case 1:
        return "Mark Picked Up";
      case 2:
        return "Mark In Transit";
      case 3:
        return "Mark Arrived";
      case 4:
        return "Confirm Delivered";
      default:
        return "";
    }
  };

  const progressShipment = async (shipment) => {
    const nextStatus = shipment.status + 1;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const registry = getContract(
        "ShipmentRegistry",
        ShipmentRegistryABI.abi,
        signer,
        chainId
      );
      const tx = await registry.updateMilestone(shipment.id, nextStatus);
      await tx.wait();
      await loadShipments();
    } catch (e) {
      console.error("Progress error", e);
      alert(e.message || "Failed to update status");
    }
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
              <div className="card-header">
                <h4>
                  #{shipment.id}{" "}
                  {shipment.origin !== "-" && shipment.destination !== "-" && (
                    <span className="route">
                      {shipment.origin} → {shipment.destination}
                    </span>
                  )}
                </h4>
                <span
                  className={`status-badge status-${getMilestoneColor(
                    shipment.status
                  )}`}
                  title={`Status updated ${shipment.updatedAt.toLocaleDateString()}`}
                >
                  {getMilestoneStatusName(shipment.status)}
                </span>
              </div>
              <div className="shipment-details">
                {shipment.description && (
                  <div className="detail-row">
                    <strong>Description:</strong>{" "}
                    {shipment.description.length > 80
                      ? shipment.description.slice(0, 77) + "…"
                      : shipment.description}
                  </div>
                )}
                <div className="detail-row">
                  <strong>Role:</strong> {getMyRole(shipment)}
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
                {shipment.metadataCid && (
                  <div className="detail-row">
                    <strong>Metadata:</strong>{" "}
                    <a
                      href={getIPFSUrl(shipment.metadataCid)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View on IPFS
                    </a>
                  </div>
                )}
                {shipment.documents.length > 0 && (
                  <div className="detail-row">
                    <strong>Docs:</strong>{" "}
                    {shipment.documents.slice(0, 2).map((d, i) => (
                      <a
                        key={i}
                        href={getIPFSUrl(d.cid)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ marginRight: "6px" }}
                      >
                        {d.docType || "Doc " + (i + 1)}
                      </a>
                    ))}
                    {shipment.documents.length > 2 && (
                      <span>+{shipment.documents.length - 2} more</span>
                    )}
                  </div>
                )}
                {canProgress(shipment) && (
                  <div className="detail-row">
                    <button
                      className="action-button primary"
                      onClick={() => progressShipment(shipment)}
                    >
                      {getNextActionLabel(shipment.status)}
                    </button>
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
