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
  uploadShipmentMetadata,
  uploadToIPFS,
  isPinataConfigured,
} from "../utils/ipfs";
import { retrieveFromIPFS, getIPFSUrl } from "../utils/ipfs";

export default function ShipperPanel({ account, chainId }) {
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [formData, setFormData] = useState({
    description: "",
    origin: "",
    destination: "",
    weight: "",
    items: "",
    shippingFee: "",
  });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  useEffect(() => {
    if (account) loadOpenOrders();
  }, [account, chainId]);

  const loadOpenOrders = async () => {
    setLoadingOrders(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const registry = getContract("ShipmentRegistry", ShipmentRegistryABI.abi, provider, chainId);
      const iface = new ethers.Interface(ShipmentRegistryABI.abi);
      const topic = iface.getEvent("OrderCreated").topicHash;
      const logs = await provider.getLogs({
        address: (await registry.getAddress()),
        topics: [topic],
        fromBlock: "0x0",
        toBlock: "latest",
      });
      const list = logs.map((l) => {
        const ev = iface.decodeEventLog("OrderCreated", l.data, l.topics);
        return {
          orderId: ev.orderId.toString(),
          buyer: ev.buyer,
          cid: ev.orderCid,
          timestamp: Number(ev.timestamp),
        };
      }).reverse();
      // Load order details from IPFS to enable fallback matching
      const orderDetails = new Map(); // cid -> { buyer, origin, destination, productName, sig }
      const orderSignatureToCid = new Map(); // signature -> cid
      for (const o of list) {
        try {
          const d = await retrieveFromIPFS(o.cid);
          const productName = (d?.productName || d?.description || "").toString();
          const origin = (d?.origin || "").toString();
          const destination = (d?.destination || "").toString();
          const buyerLower = o.buyer.toLowerCase();
          const sig = `${buyerLower}|${origin}|${destination}|${productName}`.toLowerCase();
          orderDetails.set(o.cid, { buyer: buyerLower, origin, destination, productName, sig });
          orderSignatureToCid.set(sig, o.cid);
        } catch (_) {
          // ignore fetch issues
        }
      }
      // Map orders to shipment status (if any). If no shipment yet: "Pending Confirmation".
      const orderStatusMap = new Map(); // orderCid -> { status: number, updatedAt: number, shipmentId: number, metadataCid: string }
      try {
        const total = Number(await registry.getTotalShipments());
        for (let i = 0; i < total; i++) {
          const s = await registry.getShipment(i);
          const lastCid = s.metadataCids.length > 0 ? s.metadataCids[s.metadataCids.length - 1] : "";
          if (!lastCid) continue;
          try {
            const meta = await retrieveFromIPFS(lastCid);
            let ocid = meta?.orderCid;
            if (ocid) {
              const existing = orderStatusMap.get(ocid);
              const candidate = { status: Number(s.status), updatedAt: Number(s.updatedAt), shipmentId: Number(s.id ?? i), metadataCid: lastCid };
              if (!existing || candidate.updatedAt > existing.updatedAt) {
                orderStatusMap.set(ocid, candidate);
              }
            } else {
              // Fallback: match by signature of core fields
              const buyerLower = (meta?.buyer || "").toLowerCase();
              const origin = (meta?.origin || "").toString();
              const destination = (meta?.destination || "").toString();
              const description = (meta?.description || "").toString();
              const sig2 = `${buyerLower}|${origin}|${destination}|${description}`.toLowerCase();
              const matchedCid = orderSignatureToCid.get(sig2);
              if (matchedCid) {
                const existing = orderStatusMap.get(matchedCid);
                const candidate = { status: Number(s.status), updatedAt: Number(s.updatedAt), shipmentId: Number(s.id ?? i), metadataCid: lastCid };
                if (!existing || candidate.updatedAt > existing.updatedAt) {
                  orderStatusMap.set(matchedCid, candidate);
                }
              }
            }
          } catch (_) {
            // ignore malformed metadata
          }
        }
      } catch (e) {
        console.warn("Scan shipments for order status failed", e);
      }

      const withStatus = list.map((o) => {
        const s = orderStatusMap.get(o.cid);
        let statusText;
        let hasShipment = false;
        if (s) {
          hasShipment = true;
          statusText = Number(s.status) === 0 ? "Pending Confirmation" : getMilestoneStatusName(s.status);
        } else {
          statusText = "Open";
        }
        return { ...o, status: statusText, hasShipment, shipmentId: s?.shipmentId, shipmentMetadataCid: s?.metadataCid };
      });
      setOrders(withStatus);
    } catch (e) {
      console.warn("Failed to load orders", e);
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  const prefillFromOrder = async (order) => {
    try {
      const data = await retrieveFromIPFS(order.cid);
      setFormData((prev) => ({
        ...prev,
        description: data.productName || data.description || prev.description,
        origin: data.origin || prev.origin,
        destination: data.destination || prev.destination,
        weight: prev.weight, // Buyer does not provide weight; shipper will input
        items: (data.quantity ?? data.items) || prev.items,
      }));
      setSelectedOrder(order);
    } catch (e) {
      console.warn("Prefill failed", e);
    }
  };

  const validateForm = () => {
    if (!formData.description || !formData.origin || !formData.destination) {
      setError("Please fill all required fields");
      return false;
    }
    return true;
  };

  const createShipment = async (e) => {
    e.preventDefault();

    if (!account) {
      setError("Please connect your wallet");
      return;
    }

    if (!validateForm()) {
      return;
    }
    if (!selectedOrder) {
      setError("Please select an order (Prefill) first");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setTxHash("");

    try {
      // Step 1: Upload metadata to IPFS
      let metadataCid = "";

      if (isPinataConfigured()) {
        const metadata = {
          description: formData.description,
          origin: formData.origin,
          destination: formData.destination,
          weight: formData.weight,
          items: formData.items,
          shippingFee: formData.shippingFee,
          buyer: selectedOrder.buyer,
          orderCid: selectedOrder.cid,
          orderId: selectedOrder.orderId,
        };

        const ipfsResult = await uploadShipmentMetadata(metadata);
        metadataCid = ipfsResult.cid;
        console.log("Metadata uploaded to IPFS:", metadataCid);
      } else {
        // Fallback: use a placeholder CID
        metadataCid = `Qm${Date.now()}`;
        console.warn("Pinata not configured, using placeholder CID");
      }

      // Step 2: Upload additional file if provided
      let initialDocumentCids = [];
      let initialDocumentTypes = [];
      if (file && isPinataConfigured()) {
        const fileResult = await uploadToIPFS(file);
        console.log("File uploaded to IPFS:", fileResult.cid);
        initialDocumentCids = [fileResult.cid];
        initialDocumentTypes = [file.name || "attachment"];
      }

      // Step 3: Create shipment on blockchain
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
          registry.createShipment(
            selectedOrder.buyer,
            metadataCid,
            initialDocumentCids,
            initialDocumentTypes,
            formData.shippingFee ? ethers.parseEther(String(formData.shippingFee)) : 0n
          ),
        (receipt) => {
          setSuccess(`Shipment created successfully!`);
          setTxHash(receipt.hash);

          // Reset form
          setFormData({
            description: "",
            origin: "",
            destination: "",
            weight: "",
            items: "",
          });
          setFile(null);
          setSelectedOrder(null);
        },
        (errorMsg) => {
          setError(parseContractError({ message: errorMsg }));
        }
      );

      console.log("Transaction receipt:", receipt);
    } catch (err) {
      console.error("Error creating shipment:", err);
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  };

  if (!account) {
    return (
      <div className="shipper-panel">
        <div className="empty-state">
          <p>Please connect your wallet to create shipments</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shipper-panel">
      <div className="panel-header">
        <h2>Open Orders</h2>
        <p className="subtitle">Chọn đơn hàng để điền sẵn thông tin shipment</p>
      </div>
      <div className="shipments-grid" style={{ marginBottom: 24 }}>
        {loadingOrders ? (
          <p>Loading orders...</p>
        ) : orders.length === 0 ? (
          <div className="empty-state"><p>No orders available</p></div>
        ) : (
          orders.map((o) => (
            <div key={o.orderId} className="shipment-card">
              <div className="card-header">
                <h4>Order #{o.orderId}</h4>
              </div>
              <div className="card-body">
                <p><strong>Buyer:</strong> {o.buyer.slice(0,10)}...</p>
                <p><strong>Created:</strong> {new Date(o.timestamp * 1000).toLocaleString()}</p>
                <p><strong>Status:</strong> {o.status || "Open"}</p>
                <div className="flex" style={{ gap: 8 }}>
                  <a href={getIPFSUrl(o.cid)} className="metadata-link" target="_blank" rel="noreferrer">View</a>
                  {o.hasShipment ? (
                    <a href={getIPFSUrl(o.shipmentMetadataCid)} className="metadata-link" target="_blank" rel="noreferrer">View Shipment</a>
                  ) : (
                    <button type="button" className="action-button" onClick={() => prefillFromOrder(o)}>Prefill</button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="panel-header">
        <h2>Create New Shipment</h2>
        <p className="subtitle">
          As Shipper, you can create new logistics shipments
        </p>
      </div>

      <form onSubmit={createShipment} className="shipment-form">
        <div className="form-section">
          <h3>Participant Addresses</h3>

          <div className="form-group">
            <label>
              Selected Order / Buyer <span className="required">*</span>
            </label>
            <div className="form-input" style={{ display: 'flex', alignItems: 'center', justifyContent:'space-between' }}>
              <span style={{ color: '#000' }}>{selectedOrder ? `${selectedOrder.buyer.slice(0,10)}...` : 'No order selected'}</span>
              <button type="button" className="action-button" onClick={() => loadOpenOrders()}>Refresh</button>
            </div>
            {!selectedOrder && (
              <p className="hint warning">Vui lòng chọn một Order ở trên và bấm Prefill</p>
            )}
          </div>

          {/* Warehouse removed from contract; no input here */}
        </div>

        <div className="form-section">
          <h3>Shipment Details</h3>

          <div className="form-group">
            <label htmlFor="description">
              Description <span className="required">*</span>
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Describe the shipment contents..."
              required
              rows="3"
              className="form-textarea"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="origin">
                Origin <span className="required">*</span>
              </label>
              <input
                type="text"
                id="origin"
                name="origin"
                value={formData.origin}
                onChange={handleInputChange}
                placeholder="City, Country"
                required
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="destination">
                Destination <span className="required">*</span>
              </label>
              <input
                type="text"
                id="destination"
                name="destination"
                value={formData.destination}
                onChange={handleInputChange}
                placeholder="City, Country"
                required
                className="form-input"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="weight">Weight (kg)</label>
              <input
                type="number"
                id="weight"
                name="weight"
                value={formData.weight}
                onChange={handleInputChange}
                placeholder="100"
                step="0.01"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="items">Number of Items</label>
              <input
                type="number"
                id="items"
                name="items"
                value={formData.items}
                onChange={handleInputChange}
                placeholder="10"
                className="form-input"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="shippingFee">Shipping Fee (LOGI)</label>
              <input
                type="number"
                id="shippingFee"
                name="shippingFee"
                value={formData.shippingFee}
                onChange={handleInputChange}
                placeholder="1000"
                step="0.01"
                className="form-input"
              />
              <p className="hint">Buyer sẽ được auto-mint LOGI tương ứng khi tạo shipment</p>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="file">
              Attach Document (Bill of Lading, Invoice, etc.)
            </label>
            <input
              type="file"
              id="file"
              onChange={handleFileChange}
              accept=".pdf,.jpg,.jpeg,.png,.json"
              className="form-file"
              style={{ color: "#000", backgroundColor: "#fff" }}
            />
            <div style={{ marginTop: 6, color: "#000" }}>
              {file ? `Selected: ${file.name}` : "No file selected"}
            </div>
            {!isPinataConfigured() && (
              <p className="hint warning">
                ⚠️ IPFS not configured. Files won't be uploaded. Add Pinata keys
                to .env
              </p>
            )}
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" disabled={loading} className="submit-button">
            {loading ? "Creating Shipment..." : "Create Shipment"}
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
  );
}
