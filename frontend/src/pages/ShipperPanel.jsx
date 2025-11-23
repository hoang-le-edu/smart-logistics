import { useState } from "react";
import { ethers } from "ethers";
import { ShipmentRegistryABI } from "../abis";
import {
  getContract,
  handleTransaction,
  parseContractError,
} from "../utils/contracts";
import {
  uploadShipmentMetadata,
  uploadToIPFS,
  isPinataConfigured,
} from "../utils/ipfs";

export default function ShipperPanel({ account, chainId }) {
  const [formData, setFormData] = useState({
    carrierAddress: "",
    buyerAddress: "",
    warehouseAddress: "",
    description: "",
    origin: "",
    destination: "",
    weight: "",
    items: "",
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

  const validateForm = () => {
    if (!ethers.isAddress(formData.carrierAddress)) {
      setError("Invalid carrier address");
      return false;
    }
    if (!ethers.isAddress(formData.buyerAddress)) {
      setError("Invalid buyer address");
      return false;
    }
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
          carrier: formData.carrierAddress,
          buyer: formData.buyerAddress,
          warehouse: formData.warehouseAddress || ethers.ZeroAddress,
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
      if (file && isPinataConfigured()) {
        const fileResult = await uploadToIPFS(file);
        console.log("File uploaded to IPFS:", fileResult.cid);
        // Store file CID in metadata or attach later
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

      const warehouseAddr = formData.warehouseAddress || ethers.ZeroAddress;

      const receipt = await handleTransaction(
        () =>
          registry.createShipment(
            formData.carrierAddress,
            formData.buyerAddress,
            warehouseAddr,
            metadataCid
          ),
        (receipt) => {
          setSuccess(`Shipment created successfully!`);
          setTxHash(receipt.hash);

          // Reset form
          setFormData({
            carrierAddress: "",
            buyerAddress: "",
            warehouseAddress: "",
            description: "",
            origin: "",
            destination: "",
            weight: "",
            items: "",
          });
          setFile(null);
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
        <h2>Create New Shipment</h2>
        <p className="subtitle">
          As Shipper, you can create new logistics shipments
        </p>
      </div>

      <form onSubmit={createShipment} className="shipment-form">
        <div className="form-section">
          <h3>Participant Addresses</h3>

          <div className="form-group">
            <label htmlFor="carrierAddress">
              Carrier Address <span className="required">*</span>
            </label>
            <input
              type="text"
              id="carrierAddress"
              name="carrierAddress"
              value={formData.carrierAddress}
              onChange={handleInputChange}
              placeholder="0x..."
              required
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="buyerAddress">
              Buyer Address <span className="required">*</span>
            </label>
            <input
              type="text"
              id="buyerAddress"
              name="buyerAddress"
              value={formData.buyerAddress}
              onChange={handleInputChange}
              placeholder="0x..."
              required
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="warehouseAddress">
              Warehouse Address (Optional)
            </label>
            <input
              type="text"
              id="warehouseAddress"
              name="warehouseAddress"
              value={formData.warehouseAddress}
              onChange={handleInputChange}
              placeholder="0x... (leave empty if none)"
              className="form-input"
            />
          </div>
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
            />
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
