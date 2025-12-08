import { useState, useEffect } from "react";
import CryptoJS from "crypto-js";
import axios from "axios";
import { getShipmentRegistry } from "../utils/contracts";
import "./ShipmentDetailModal.css";

const ENCRYPTION_KEY =
  import.meta.env.VITE_ENCRYPTION_KEY ||
  "smart-logistics-default-key-2024-change-in-production";

export default function ShipmentDetailModal({ shipment, onClose }) {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [decryptedData, setDecryptedData] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [downloadingDoc, setDownloadingDoc] = useState(null);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [viewedContent, setViewedContent] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

  useEffect(() => {
    if (shipment?.metadataCid) {
      loadMetadata(shipment.metadataCid);
    }
    if (shipment?.id !== undefined) {
      loadDocuments(shipment.id);
    }
  }, [shipment]);

  const loadMetadata = async (cid) => {
    setLoading(true);
    setError("");
    try {
      // Check if CID is actually a JSON string (from old seed data)
      try {
        // Try to parse as JSON first
        const parsedData = JSON.parse(cid);
        setMetadata(parsedData);
        setLoading(false);
        return;
      } catch {
        // Not JSON, proceed with IPFS fetch
      }

      // Validate CID format (CIDv0: Qm..., CIDv1: baf...)
      if (!cid.startsWith("Qm") && !cid.startsWith("baf")) {
        throw new Error("Invalid IPFS CID format");
      }

      // Try multiple IPFS gateways
      const gateways = [
        `https://ipfs.io/ipfs/${cid}`,
        `https://cloudflare-ipfs.com/ipfs/${cid}`,
        `https://gateway.pinata.cloud/ipfs/${cid}`,
      ];

      let response = null;
      let lastError = null;

      for (const gateway of gateways) {
        try {
          response = await fetch(gateway);
          if (response.ok) break;
        } catch (err) {
          lastError = err;
        }
      }

      if (!response || !response.ok) {
        throw lastError || new Error("All IPFS gateways failed");
      }

      const data = await response.json();
      setMetadata(data);

      // Try to decrypt if data is encrypted
      if (data.encrypted) {
        try {
          const decrypted = CryptoJS.AES.decrypt(
            data.encrypted,
            ENCRYPTION_KEY
          );
          const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
          if (decryptedText) {
            setDecryptedData(JSON.parse(decryptedText));
          }
        } catch (err) {
          console.warn("Decryption failed or data not encrypted:", err);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async (shipmentId) => {
    // Skip loading documents if shipmentId is invalid or undefined
    if (shipmentId === undefined || shipmentId === null || shipmentId < 0) {
      console.log("Skipping document load: invalid shipmentId", shipmentId);
      setLoadingDocs(false);
      return;
    }

    setLoadingDocs(true);
    try {
      const registry = await getShipmentRegistry();
      const docs = await registry.getShipmentDocuments(shipmentId);
      setDocuments(
        docs.map((doc, idx) => ({
          id: idx,
          docType: doc.docType,
          cid: doc.cid,
          uploadedBy: doc.uploadedBy,
          timestamp: Number(doc.timestamp),
        }))
      );
    } catch (err) {
      console.error("Failed to load documents:", err);
      // Silently fail if shipment doesn't exist (might be an order)
    } finally {
      setLoadingDocs(false);
    }
  };

  const downloadAndDecryptFile = async (cid, docType) => {
    setDownloadingDoc(cid);
    try {
      // Fetch encrypted file from IPFS
      const response = await axios.get(
        `https://gateway.pinata.cloud/ipfs/${cid}`,
        {
          responseType: "text",
        }
      );

      let decryptedContent;
      const encryptedData = response.data;

      // Check if it's encrypted (starts with U2FsdGVkX1 for AES)
      if (
        typeof encryptedData === "string" &&
        encryptedData.includes("U2FsdGVkX1")
      ) {
        // Decrypt the file content
        const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
        decryptedContent = bytes.toString(CryptoJS.enc.Utf8);

        if (!decryptedContent) {
          throw new Error(
            "Giải mã thất bại. Kiểm tra ENCRYPTION_KEY trong .env"
          );
        }
      } else {
        // Not encrypted, use as-is
        decryptedContent = encryptedData;
      }

      // Detect file type
      const docTypeLower = docType?.toLowerCase() || "";
      const isImage =
        docTypeLower.includes("png") ||
        docTypeLower.includes("jpg") ||
        docTypeLower.includes("jpeg") ||
        docTypeLower.includes("gif") ||
        docTypeLower.includes("webp") ||
        docTypeLower.includes("bmp");

      let blob;
      let fileName;

      if (isImage) {
        // For images, decryptedContent is base64, convert to blob
        const mimeType = docTypeLower.includes("png")
          ? "image/png"
          : docTypeLower.includes("jpg") || docTypeLower.includes("jpeg")
          ? "image/jpeg"
          : docTypeLower.includes("gif")
          ? "image/gif"
          : docTypeLower.includes("webp")
          ? "image/webp"
          : "image/png";

        // Decode base64 to binary using proper method
        const binaryString = atob(decryptedContent);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        blob = new Blob([bytes.buffer], { type: mimeType });

        const ext = docTypeLower.includes("png")
          ? "png"
          : docTypeLower.includes("jpg") || docTypeLower.includes("jpeg")
          ? "jpg"
          : docTypeLower.includes("gif")
          ? "gif"
          : docTypeLower.includes("webp")
          ? "webp"
          : "png";
        fileName = `${docType || "image"}_${cid.slice(0, 8)}.${ext}`;
      } else {
        // For text files
        blob = new Blob([decryptedContent], { type: "text/plain" });
        fileName = `${docType || "document"}_${cid.slice(0, 8)}.txt`;
      }

      // Download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      alert("✅ File đã được giải mã và tải xuống!");
    } catch (err) {
      console.error("Download/decrypt error:", err);
      alert(`❌ Lỗi: ${err.message}`);
    } finally {
      setDownloadingDoc(null);
    }
  };

  const viewDocumentInline = async (doc) => {
    setViewingDoc(doc);
    setViewLoading(true);
    setViewedContent(null);
    try {
      // Fetch encrypted file from IPFS
      const response = await axios.get(
        `https://gateway.pinata.cloud/ipfs/${doc.cid}`,
        { responseType: "text" }
      );

      const encryptedData = response.data;

      // Check if data is encrypted (contains U2FsdGVkX1 - CryptoJS signature)
      if (
        typeof encryptedData !== "string" ||
        !encryptedData.includes("U2FsdGVkX1")
      ) {
        throw new Error("File không được mã hóa đúng định dạng");
      }

      // Decrypt the content
      const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
      const decryptedContent = bytes.toString(CryptoJS.enc.Utf8);

      if (!decryptedContent) {
        throw new Error("Giải mã thất bại. Kiểm tra ENCRYPTION_KEY trong .env");
      }

      // Detect file type from docType
      const docType = doc.docType?.toLowerCase() || "";
      const isImage =
        docType.includes("png") ||
        docType.includes("jpg") ||
        docType.includes("jpeg") ||
        docType.includes("gif") ||
        docType.includes("webp") ||
        docType.includes("bmp");

      if (isImage) {
        // For images, decrypted content is base64
        const mimeType = docType.includes("png")
          ? "image/png"
          : docType.includes("jpg") || docType.includes("jpeg")
          ? "image/jpeg"
          : docType.includes("gif")
          ? "image/gif"
          : docType.includes("webp")
          ? "image/webp"
          : "image/png";

        setViewedContent({
          type: "image",
          content: `data:${mimeType};base64,${decryptedContent}`,
          raw: decryptedContent,
        });
        return;
      }

      // For non-image files, try to parse as JSON
      try {
        const jsonData = JSON.parse(decryptedContent);
        setViewedContent({
          type: "json",
          content: jsonData,
          raw: decryptedContent,
        });
      } catch {
        // Not JSON, display as text
        setViewedContent({
          type: "text",
          content: decryptedContent,
          raw: decryptedContent,
        });
      }
    } catch (err) {
      console.error("View document error:", err);
      setViewedContent({
        type: "error",
        content: err.message,
      });
    } finally {
      setViewLoading(false);
    }
  };

  const closeDocumentViewer = () => {
    setViewingDoc(null);
    setViewedContent(null);
  };

  const getMilestoneStatusName = (status) => {
    const statuses = [
      "CREATED",
      "PICKED_UP",
      "IN_TRANSIT",
      "ARRIVED",
      "DELIVERED",
      "CANCELED",
    ];
    return statuses[status] || "UNKNOWN";
  };

  const formatAddress = (address) => {
    if (!address) return "N/A";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    return new Date(Number(timestamp) * 1000).toLocaleString("vi-VN");
  };

  if (!shipment) return null;

  const isOrder = shipment.id < 0 || shipment.orderId !== undefined;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {isOrder
              ? `📦 Order Details #${shipment.orderId || shipment.id}`
              : `Shipment Details #${shipment.id}`}
          </h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* Basic Info */}
          <section className="info-section">
            <h3>📦 Basic Information</h3>
            <div className="info-grid">
              <div className="info-item">
                <label>Status:</label>
                <span
                  className={`status-badge status-${shipment.milestoneStatus}`}
                >
                  {getMilestoneStatusName(shipment.milestoneStatus)}
                </span>
              </div>
              <div className="info-item">
                <label>Created:</label>
                <span>{formatDate(shipment.timestamp)}</span>
              </div>
            </div>
          </section>

          {/* Shipment Details from Decrypted Metadata */}
          {decryptedData && (
            <section className="info-section">
              <h3>📋 Shipment Details</h3>
              <div className="info-grid">
                {decryptedData.description && (
                  <div className="info-item full-width">
                    <label>Product Description:</label>
                    <span>{decryptedData.description}</span>
                  </div>
                )}
                {decryptedData.origin && (
                  <div className="info-item">
                    <label>Origin:</label>
                    <span>{decryptedData.origin}</span>
                  </div>
                )}
                {decryptedData.destination && (
                  <div className="info-item">
                    <label>Destination:</label>
                    <span>{decryptedData.destination}</span>
                  </div>
                )}
                {decryptedData.weight && (
                  <div className="info-item">
                    <label>Weight:</label>
                    <span>{decryptedData.weight} kg</span>
                  </div>
                )}
                {decryptedData.items && (
                  <div className="info-item">
                    <label>Number of Items:</label>
                    <span>{decryptedData.items}</span>
                  </div>
                )}
                {decryptedData.shippingFee && (
                  <div className="info-item">
                    <label>Shipping Fee:</label>
                    <span>{decryptedData.shippingFee} LOGI</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Parties */}
          <section className="info-section">
            <h3>👥 Parties</h3>
            <div className="info-grid">
              <div className="info-item">
                <label>Shipper:</label>
                <span className="address">
                  {formatAddress(shipment.shipper)}
                </span>
                <button
                  className="copy-btn"
                  onClick={() =>
                    navigator.clipboard.writeText(shipment.shipper)
                  }
                  title="Copy address"
                >
                  📋
                </button>
              </div>
              <div className="info-item">
                <label>Carrier:</label>
                <span className="address">
                  {formatAddress(shipment.carrier)}
                </span>
                <button
                  className="copy-btn"
                  onClick={() =>
                    navigator.clipboard.writeText(shipment.carrier)
                  }
                  title="Copy address"
                >
                  📋
                </button>
              </div>
              <div className="info-item">
                <label>Buyer:</label>
                <span className="address">{formatAddress(shipment.buyer)}</span>
                <button
                  className="copy-btn"
                  onClick={() => navigator.clipboard.writeText(shipment.buyer)}
                  title="Copy address"
                >
                  📋
                </button>
              </div>
            </div>
          </section>

          {/* Metadata */}
          <section className="info-section">
            <h3>
              📄 Metadata{" "}
              {shipment.metadataCid &&
                `(IPFS: ${shipment.metadataCid.slice(0, 10)}...)`}
            </h3>

            {loading && <p className="loading">Loading metadata...</p>}
            {error && <p className="error">Error: {error}</p>}

            {metadata && !loading && (
              <div className="metadata-container">
                {/* Collapsible raw metadata section */}
                <details>
                  <summary
                    style={{
                      cursor: "pointer",
                      fontWeight: "bold",
                      marginBottom: "10px",
                      userSelect: "none",
                    }}
                  >
                    📄 View Raw Metadata JSON
                  </summary>
                  {decryptedData ? (
                    <div className="decrypted-data">
                      <div className="decrypt-badge">🔓 Decrypted Data</div>
                      <pre>{JSON.stringify(decryptedData, null, 2)}</pre>
                    </div>
                  ) : (
                    <>
                      {/* Show encrypted data */}
                      {metadata.encrypted && (
                        <div className="encrypted-data">
                          <div className="encrypt-badge">🔒 Encrypted Data</div>
                          <div className="encrypted-text">
                            {metadata.encrypted.slice(0, 100)}...
                          </div>
                          <p className="hint">
                            ⚠️ Không thể giải mã. Kiểm tra ENCRYPTION_KEY trong
                            .env
                          </p>
                        </div>
                      )}

                      {/* Show raw metadata if not encrypted */}
                      {!metadata.encrypted && (
                        <pre>{JSON.stringify(metadata, null, 2)}</pre>
                      )}
                    </>
                  )}
                </details>
              </div>
            )}
          </section>

          {/* Documents Section - Only show for shipments, not orders */}
          {!isOrder && (
            <section className="info-section">
              <h3>📎 Attached Documents</h3>
              {loadingDocs ? (
                <p className="loading">Loading documents...</p>
              ) : documents.length === 0 ? (
                <p className="hint">No documents attached to this shipment</p>
              ) : (
                <div className="documents-list">
                  {documents.map((doc) => (
                    <div key={doc.id} className="document-item">
                      <div className="document-info">
                        <div className="document-type">
                          📄 {doc.docType || "Document"}
                        </div>
                        <div className="document-meta">
                          <span className="document-cid" title={doc.cid}>
                            CID: {doc.cid.slice(0, 8)}...{doc.cid.slice(-6)}
                          </span>
                          <span className="document-date">
                            {new Date(doc.timestamp * 1000).toLocaleString(
                              "vi-VN"
                            )}
                          </span>
                        </div>
                        <div className="document-uploader">
                          Uploaded by: {doc.uploadedBy.slice(0, 8)}...
                          {doc.uploadedBy.slice(-6)}
                        </div>
                      </div>
                      <div className="document-actions">
                        <button
                          className="btn-view-inline"
                          onClick={() => viewDocumentInline(doc)}
                          title="Xem nội dung đã giải mã"
                        >
                          👁️ Xem nội dung
                        </button>
                        <button
                          className="btn-decrypt"
                          onClick={() =>
                            downloadAndDecryptFile(doc.cid, doc.docType)
                          }
                          disabled={downloadingDoc === doc.cid}
                          title="Tải xuống file"
                        >
                          {downloadingDoc === doc.cid
                            ? "⏳ Đang xử lý..."
                            : "⬇️ Tải xuống"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* IPFS Link */}
          {shipment.metadataCid && (
            <section className="info-section">
              <a
                href={`https://gateway.pinata.cloud/ipfs/${shipment.metadataCid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ipfs-link"
              >
                🔗 View on IPFS Gateway
              </a>
            </section>
          )}
        </div>

        {/* Document Viewer Modal */}
        {viewingDoc && (
          <div
            className="document-viewer-overlay"
            onClick={closeDocumentViewer}
          >
            <div
              className="document-viewer-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="document-viewer-header">
                <h3>📄 {viewingDoc.docType || "Document"}</h3>
                <button className="close-button" onClick={closeDocumentViewer}>
                  ×
                </button>
              </div>
              <div className="document-viewer-body">
                {viewLoading ? (
                  <div className="viewer-loading">⏳ Đang giải mã...</div>
                ) : viewedContent?.type === "error" ? (
                  <div className="viewer-error">
                    ❌ Lỗi: {viewedContent.content}
                  </div>
                ) : viewedContent?.type === "image" ? (
                  <div className="viewer-image">
                    <div className="viewer-label">✅ Image Preview:</div>
                    <img
                      src={viewedContent.content}
                      alt={viewingDoc.docType}
                      style={{
                        maxWidth: "100%",
                        maxHeight: "70vh",
                        objectFit: "contain",
                      }}
                    />
                  </div>
                ) : viewedContent?.type === "json" ? (
                  <div className="viewer-json">
                    <div className="viewer-label">✅ Nội dung (JSON):</div>
                    <pre className="viewer-content">
                      {JSON.stringify(viewedContent.content, null, 2)}
                    </pre>
                  </div>
                ) : viewedContent?.type === "text" ? (
                  <div className="viewer-text">
                    <div className="viewer-label">✅ Nội dung (Text):</div>
                    <pre className="viewer-content">
                      {viewedContent.content}
                    </pre>
                  </div>
                ) : null}
              </div>
              <div className="document-viewer-footer">
                <button className="btn-secondary" onClick={closeDocumentViewer}>
                  Đóng
                </button>
                {viewedContent && (
                  <button
                    className="btn-primary"
                    onClick={() => {
                      const blob = new Blob([viewedContent.raw], {
                        type: "text/plain",
                      });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${
                        viewingDoc.docType || "document"
                      }_${viewingDoc.cid.slice(0, 8)}.txt`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                    }}
                  >
                    ⬇️ Tải xuống
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
